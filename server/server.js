import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db, { generatePasscode, getFplCache, setFplCache, getAdminPassword, syncCredentialsFile, getScoringRules, saveScoringRules, resetScoringRules } from './db.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Persistent sessions via SQLite (2-year expiry)
const SESSION_DURATION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function getSession(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const now = Date.now();
  const row = db.prepare('SELECT * FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)').get(token, now);
  if (!row) return null;
  return {
    role: row.role,
    playerId: row.player_id,
    name: row.name,
    timezone: row.timezone || 'UTC',
    createdAt: row.created_at,
    token: row.token
  };
}

function saveSession(token, role, playerId, name, timezone = 'UTC') {
  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;
  db.prepare(`
    INSERT OR REPLACE INTO sessions (token, role, player_id, name, timezone, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, role, playerId || null, name || null, timezone || 'UTC', now, expiresAt);
}

function deleteSession(token) {
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}

function requireAdmin(req, res, next) {
  const sess = getSession(req);
  if (!sess || sess.role !== 'admin') {
    return res.status(401).json({ error: 'Admin authorization required' });
  }
  req.session = sess;
  next();
}

function requirePlayerOrAdmin(req, res, next) {
  const sess = getSession(req);
  if (!sess) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.session = sess;
  next();
}

// ─── AUTH ENDPOINTS ─────────────────────────────────────────────────────────
app.post('/api/auth/admin', (req, res) => {
  const { password, player_id, player_name, timezone } = req.body;
  const currentAdminPassword = getAdminPassword();
  if (!password || password !== currentAdminPassword) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  let player = null;
  if (player_id) {
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(player_id);
  } else if (player_name && player_name.trim()) {
    player = db.prepare('SELECT * FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(player_name.trim());
    if (!player) {
      const code = generatePasscode();
      const insert = db.prepare('INSERT INTO players (name, passcode, timezone) VALUES (?, ?, ?)').run(player_name.trim(), code, timezone || 'UTC');
      player = { id: insert.lastInsertRowid, name: player_name.trim(), passcode: code, timezone: timezone || 'UTC' };
      const groups = db.prepare('SELECT id FROM groups').all();
      const assignGroup = db.prepare('INSERT OR IGNORE INTO group_players (group_id, player_id) VALUES (?, ?)');
      for (const g of groups) {
        assignGroup.run(g.id, player.id);
      }
      syncCredentialsFile();
    }
  }

  const userTimezone = timezone || (player && player.timezone) || 'UTC';
  const token = 'adm_' + crypto.randomBytes(16).toString('hex');
  saveSession(token, 'admin', player ? player.id : null, player ? player.name : 'Admin', userTimezone);

  res.json({
    success: true,
    role: 'admin',
    token,
    timezone: userTimezone,
    player: player ? { id: player.id, name: player.name } : null
  });
});

app.post('/api/auth/admin/player', requireAdmin, (req, res) => {
  const { player_id, player_name } = req.body;
  let player = null;
  if (player_id) {
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(player_id);
  } else if (player_name && player_name.trim()) {
    player = db.prepare('SELECT * FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(player_name.trim());
    if (!player) {
      const code = generatePasscode();
      const insert = db.prepare('INSERT INTO players (name, passcode) VALUES (?, ?)').run(player_name.trim(), code);
      player = { id: insert.lastInsertRowid, name: player_name.trim(), passcode: code };
      const groups = db.prepare('SELECT id FROM groups').all();
      const assignGroup = db.prepare('INSERT OR IGNORE INTO group_players (group_id, player_id) VALUES (?, ?)');
      for (const g of groups) {
        assignGroup.run(g.id, player.id);
      }
      syncCredentialsFile();
    }
  }

  req.session.playerId = player ? player.id : null;
  req.session.name = player ? player.name : 'Admin';

  db.prepare('UPDATE sessions SET player_id = ?, name = ? WHERE token = ?').run(
    player ? player.id : null,
    player ? player.name : 'Admin',
    req.session.token
  );

  res.json({
    success: true,
    role: 'admin',
    player: player ? { id: player.id, name: player.name } : null
  });
});

app.post('/api/auth/player', (req, res) => {
  const { player_id, name, passcode, timezone } = req.body;
  if ((!player_id && (!name || !name.trim())) || !passcode) {
    return res.status(400).json({ error: 'Player name and 6-character passcode are required' });
  }

  let player = null;
  if (player_id) {
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(player_id);
  } else if (name) {
    player = db.prepare('SELECT * FROM players WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name.trim());
  }

  if (!player) {
    return res.status(404).json({ error: `Player "${name || player_id}" not found. Please check spelling or ask your admin.` });
  }

  if (!player.passcode || player.passcode.toUpperCase() !== passcode.trim().toUpperCase()) {
    return res.status(401).json({ error: 'Incorrect 6-character passcode' });
  }

  const userTimezone = timezone || player.timezone || 'UTC';
  if (timezone && timezone !== player.timezone) {
    db.prepare('UPDATE players SET timezone = ? WHERE id = ?').run(timezone, player.id);
  }

  const token = 'ply_' + crypto.randomBytes(16).toString('hex');
  saveSession(token, 'player', player.id, player.name, userTimezone);

  res.json({
    success: true,
    role: 'player',
    token,
    timezone: userTimezone,
    player: { id: player.id, name: player.name }
  });
});

app.post('/api/auth/timezone', (req, res) => {
  const { timezone } = req.body;
  if (!timezone || typeof timezone !== 'string') {
    return res.status(400).json({ error: 'Valid timezone string is required' });
  }
  const sess = getSession(req);
  if (sess) {
    db.prepare('UPDATE sessions SET timezone = ? WHERE token = ?').run(timezone, sess.token);
    if (sess.playerId) {
      db.prepare('UPDATE players SET timezone = ? WHERE id = ?').run(timezone, sess.playerId);
    }
  }
  res.json({ success: true, timezone });
});

app.get('/api/auth/verify', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.json({ role: 'guest' });
  res.json(sess);
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    deleteSession(token);
  }
  res.json({ success: true });
});

// ─── FPL PROXY ENDPOINTS (DYNAMIC ON-DEMAND SQLITE CACHE) ───────────────────
const TTL_LIVE = 5 * 60 * 1000;          // 5 minutes when a match is underway
const TTL_NORMAL = 6 * 60 * 60 * 1000;    // 6 hours when no match is live
const TTL_BOOTSTRAP = 24 * 60 * 60 * 1000; // 24 hours for static team metadata

function calculateFixturesStateAndTTL(fixtures) {
  if (!Array.isArray(fixtures)) {
    return { state: 'NORMAL', ttl: TTL_NORMAL };
  }
  const now = Date.now();
  const isLive = fixtures.some(f => {
    // If whistle blown / provisional result finalized on pitch, not live
    if (f.finished_provisional) return false;
    // Explicitly started in FPL
    if (f.started) return true;
    // Safety kickoff window check (within 125 min of kickoff)
    if (f.kickoff_time) {
      const kickoff = new Date(f.kickoff_time).getTime();
      if (!isNaN(kickoff) && now >= kickoff && now <= kickoff + 125 * 60 * 1000) {
        return true;
      }
    }
    return false;
  });

  if (isLive) {
    return { state: 'LIVE', ttl: TTL_LIVE };
  }

  // Find next upcoming kickoff time to cap normal TTL at next kickoff
  let nextKickoffMs = null;
  for (const f of fixtures) {
    if (f.finished || f.finished_provisional) continue;
    if (f.kickoff_time) {
      const kickoff = new Date(f.kickoff_time).getTime();
      if (!isNaN(kickoff) && kickoff > now) {
        if (nextKickoffMs === null || kickoff < nextKickoffMs) {
          nextKickoffMs = kickoff;
        }
      }
    }
  }

  let dynamicTtl = TTL_NORMAL;
  if (nextKickoffMs !== null) {
    const timeToKickoff = nextKickoffMs - now;
    if (timeToKickoff > 0) {
      dynamicTtl = Math.min(TTL_NORMAL, Math.max(10 * 1000, timeToKickoff));
    }
  }

  return { state: 'NORMAL', ttl: dynamicTtl };
}

const inFlightFetches = {};

async function fetchFplWithCoalesce(url, key) {
  if (inFlightFetches[key]) {
    return inFlightFetches[key];
  }
  inFlightFetches[key] = (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        throw new Error(`FPL API responded with HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      delete inFlightFetches[key];
    }
  })();
  return inFlightFetches[key];
}

app.get('/api/fpl/bootstrap-static/', async (req, res) => {
  const now = Date.now();
  const cached = getFplCache('bootstrap-static');

  if (cached && (now - cached.updated_at) < TTL_BOOTSTRAP) {
    res.setHeader('X-FPL-Cache', 'HIT');
    res.setHeader('X-FPL-State', 'BOOTSTRAP');
    res.setHeader('X-FPL-Updated-At', String(cached.updated_at));
    res.setHeader('X-FPL-TTL', String(TTL_BOOTSTRAP));
    return res.type('application/json').send(cached.data);
  }

  try {
    const data = await fetchFplWithCoalesce('https://fantasy.premierleague.com/api/bootstrap-static/', 'bootstrap-static');
    const jsonStr = JSON.stringify(data);
    setFplCache('bootstrap-static', jsonStr, TTL_BOOTSTRAP, 'BOOTSTRAP');

    res.setHeader('X-FPL-Cache', 'MISS');
    res.setHeader('X-FPL-State', 'BOOTSTRAP');
    res.setHeader('X-FPL-Updated-At', String(now));
    res.setHeader('X-FPL-TTL', String(TTL_BOOTSTRAP));
    return res.json(data);
  } catch (err) {
    console.warn('FPL bootstrap-static fetch failed, attempting stale cache fallback:', err.message);
    if (cached) {
      res.setHeader('X-FPL-Cache', 'STALE_FALLBACK');
      res.setHeader('X-FPL-State', 'BOOTSTRAP');
      res.setHeader('X-FPL-Updated-At', String(cached.updated_at));
      res.setHeader('X-FPL-TTL', String(TTL_BOOTSTRAP));
      return res.type('application/json').send(cached.data);
    }
    return res.status(502).json({ error: 'Failed to fetch FPL bootstrap-static and no cache is available' });
  }
});

app.get('/api/fpl/fixtures/', async (req, res) => {
  const sess = getSession(req);
  const isAuthenticatedUser = !!sess;
  const now = Date.now();
  const cached = getFplCache('fixtures');

  // If no active user session, force Standard Mode (NORMAL)
  if (!isAuthenticatedUser) {
    if (cached) {
      res.setHeader('X-FPL-Cache', 'HIT');
      res.setHeader('X-FPL-State', 'NORMAL');
      res.setHeader('X-FPL-Updated-At', String(cached.updated_at));
      res.setHeader('X-FPL-TTL', String(TTL_NORMAL));
      return res.type('application/json').send(cached.data);
    }
  }

  let isCacheValid = false;

  if (cached) {
    const cacheAge = now - cached.updated_at;
    if (cacheAge < cached.dynamic_ttl) {
      isCacheValid = true;

      // Kickoff Trigger Check: If cached state was NOT 'LIVE', verify if any match reached kickoff time since updated_at
      if (cached.match_state !== 'LIVE') {
        try {
          const fixtures = JSON.parse(cached.data);
          const hasCrossedKickoff = fixtures.some(f => {
            if (f.finished || f.finished_provisional) return false;
            if (f.kickoff_time) {
              const kickoff = new Date(f.kickoff_time).getTime();
              // Match reached kickoff time and is within match duration window
              return !isNaN(kickoff) && now >= kickoff && (kickoff + 125 * 60 * 1000) >= now;
            }
            return false;
          });
          if (hasCrossedKickoff) {
            isCacheValid = false; // Invalidate cached normal mode response to query fresh live scores
          }
        } catch (e) {
          isCacheValid = false;
        }
      }
    }
  }

  if (cached && isCacheValid) {
    const effectiveState = isAuthenticatedUser ? (cached.match_state || 'NORMAL') : 'NORMAL';
    res.setHeader('X-FPL-Cache', 'HIT');
    res.setHeader('X-FPL-State', effectiveState);
    res.setHeader('X-FPL-Updated-At', String(cached.updated_at));
    res.setHeader('X-FPL-TTL', String(cached.dynamic_ttl));
    return res.type('application/json').send(cached.data);
  }

  try {
    const data = await fetchFplWithCoalesce('https://fantasy.premierleague.com/api/fixtures/', 'fixtures');
    const { state, ttl } = calculateFixturesStateAndTTL(data);
    const jsonStr = JSON.stringify(data);
    setFplCache('fixtures', jsonStr, ttl, state);

    const effectiveState = isAuthenticatedUser ? state : 'NORMAL';
    res.setHeader('X-FPL-Cache', 'MISS');
    res.setHeader('X-FPL-State', effectiveState);
    res.setHeader('X-FPL-Updated-At', String(now));
    res.setHeader('X-FPL-TTL', String(ttl));
    return res.json(data);
  } catch (err) {
    console.warn('FPL fixtures fetch failed, attempting stale cache fallback:', err.message);
    if (cached) {
      const effectiveState = isAuthenticatedUser ? (cached.match_state || 'NORMAL') : 'NORMAL';
      res.setHeader('X-FPL-Cache', 'STALE_FALLBACK');
      res.setHeader('X-FPL-State', effectiveState);
      res.setHeader('X-FPL-Updated-At', String(cached.updated_at));
      res.setHeader('X-FPL-TTL', String(cached.dynamic_ttl));
      return res.type('application/json').send(cached.data);
    }
    return res.status(502).json({ error: 'Failed to fetch FPL fixtures and no cache is available' });
  }
});

// ─── GROUPS ENDPOINTS ───────────────────────────────────────────────────────
// Get all groups with member counts (Public)
app.get('/api/groups', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.*, COUNT(gp.player_id) as player_count
      FROM groups g
      LEFT JOIN group_players gp ON g.id = gp.group_id
      GROUP BY g.id
      ORDER BY g.name ASC
    `).all();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new group (Admin only)
app.post('/api/groups', requireAdmin, (req, res) => {
  const { name, teams_filter } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  const filterVal = (Array.isArray(teams_filter) && teams_filter.length > 0)
    ? JSON.stringify(teams_filter)
    : (typeof teams_filter === 'string' ? teams_filter : 'ALL');

  try {
    const stmt = db.prepare('INSERT INTO groups (name, teams_filter) VALUES (?, ?)');
    const info = stmt.run(name.trim(), filterVal);
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), teams_filter: filterVal, player_count: 0 });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A group with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Rename/Update group (Admin only)
app.put('/api/groups/:id', requireAdmin, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const { name, teams_filter } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  const filterVal = (Array.isArray(teams_filter) && teams_filter.length > 0)
    ? JSON.stringify(teams_filter)
    : (typeof teams_filter === 'string' ? teams_filter : 'ALL');

  try {
    const stmt = db.prepare('UPDATE groups SET name = ?, teams_filter = ? WHERE id = ?');
    const result = stmt.run(name.trim(), filterVal, groupId);
    if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ id: groupId, name: name.trim(), teams_filter: filterVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete group (Admin only)
app.delete('/api/groups/:id', requireAdmin, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  try {
    const stmt = db.prepare('DELETE FROM groups WHERE id = ?');
    const result = stmt.run(groupId);
    if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get players in a specific group (Public)
app.get('/api/groups/:id/players', (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  try {
    const players = db.prepare(`
      SELECT p.id, p.name, p.created_at
      FROM players p
      JOIN group_players gp ON p.id = gp.player_id
      WHERE gp.group_id = ?
      ORDER BY p.name ASC
    `).all(groupId);
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MASTER PLAYERS ENDPOINTS ───────────────────────────────────────────────
// Get all master players with their assigned group list (Public, but passcodes included only for Admin)
app.get('/api/players', (req, res) => {
  const sess = getSession(req);
  const isAdmin = sess && sess.role === 'admin';

  try {
    const players = db.prepare(`
      SELECT p.*,
        COALESCE(json_group_array(gp.group_id), '[]') as group_ids
      FROM players p
      LEFT JOIN group_players gp ON p.id = gp.player_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all();

    const formatted = players.map(p => {
      const pObj = {
        ...p,
        group_ids: JSON.parse(p.group_ids).filter(id => id !== null)
      };
      if (!isAdmin) {
        delete pObj.passcode;
      }
      return pObj;
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new master player (Admin only)
app.post('/api/players', requireAdmin, (req, res) => {
  const { name, group_ids } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Player name is required' });

  const passcode = generatePasscode();
  try {
    const insertPlayer = db.prepare('INSERT INTO players (name, passcode) VALUES (?, ?)');
    const info = insertPlayer.run(name.trim(), passcode);
    const playerId = info.lastInsertRowid;

    if (Array.isArray(group_ids) && group_ids.length > 0) {
      const assignGroup = db.prepare('INSERT OR IGNORE INTO group_players (group_id, player_id) VALUES (?, ?)');
      for (const gId of group_ids) {
        assignGroup.run(gId, playerId);
      }
    }

    syncCredentialsFile();

    res.status(201).json({ id: playerId, name: name.trim(), passcode, group_ids: group_ids || [] });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A player with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Rename master player (Admin only)
app.put('/api/players/:id', requireAdmin, (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Player name is required' });

  try {
    const stmt = db.prepare('UPDATE players SET name = ? WHERE id = ?');
    const result = stmt.run(name.trim(), playerId);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    syncCredentialsFile();
    res.json({ id: playerId, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete master player (Admin only)
app.delete('/api/players/:id', requireAdmin, (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  try {
    const stmt = db.prepare('DELETE FROM players WHERE id = ?');
    const result = stmt.run(playerId);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    syncCredentialsFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin reset/regenerate player passcode
app.post('/api/players/:id/reset-passcode', requireAdmin, (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  const newPasscode = generatePasscode();
  try {
    const stmt = db.prepare('UPDATE players SET passcode = ? WHERE id = ?');
    const result = stmt.run(newPasscode, playerId);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    syncCredentialsFile();
    res.json({ success: true, id: playerId, passcode: newPasscode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign player to group (Admin only)
app.post('/api/players/:id/groups', requireAdmin, (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  const { group_id } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id is required' });

  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO group_players (group_id, player_id) VALUES (?, ?)');
    stmt.run(group_id, playerId);
    syncCredentialsFile();
    res.json({ success: true, player_id: playerId, group_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove player from group (Admin only)
app.delete('/api/players/:id/groups/:groupId', requireAdmin, (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  const groupId = parseInt(req.params.groupId, 10);

  try {
    const stmt = db.prepare('DELETE FROM group_players WHERE group_id = ? AND player_id = ?');
    stmt.run(groupId, playerId);
    syncCredentialsFile();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PREDICTIONS ENDPOINTS ──────────────────────────────────────────────────
// Get predictions (If groupId provided, return predictions for all players in that group; otherwise all predictions)
app.get('/api/predictions', (req, res) => {
  const groupId = req.query.groupId ? parseInt(req.query.groupId, 10) : null;

  try {
    let rows;
    if (groupId) {
      rows = db.prepare(`
        SELECT p.match_id, p.player_id, p.home_score, p.away_score
        FROM predictions p
        INNER JOIN group_players gp ON gp.player_id = p.player_id
        WHERE gp.group_id = ?
      `).all(groupId);
    } else {
      rows = db.prepare(`
        SELECT match_id, player_id, home_score, away_score
        FROM predictions
      `).all();
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save prediction (Requires Player token for own score, or Admin token for any score)
app.post('/api/predictions', requirePlayerOrAdmin, (req, res) => {
  const { match_id, player_id, home_score, away_score } = req.body;

  if (match_id === undefined || player_id === undefined) {
    return res.status(400).json({ error: 'match_id and player_id are required' });
  }

  // Permission check: Admin can edit any prediction; Player can only edit their own
  if (req.session.role !== 'admin' && req.session.playerId !== Number(player_id)) {
    return res.status(403).json({ error: 'You are only authorized to edit your own score predictions.' });
  }

  // Kickoff lock check: Regular players cannot modify predictions once kickoff has passed (Admins are exempt)
  if (req.session.role !== 'admin') {
    const cachedFixtures = getFplCache('fixtures');
    if (cachedFixtures && cachedFixtures.data) {
      try {
        const fixtures = JSON.parse(cachedFixtures.data);
        const match = fixtures.find(f => f.id === Number(match_id));
        if (match && match.kickoff_time) {
          if (new Date() >= new Date(match.kickoff_time)) {
            return res.status(403).json({ error: 'Predictions are locked because kickoff has passed.' });
          }
        }
      } catch (e) { }
    }
  }

  const hScore = (home_score !== null && home_score !== '' && home_score !== undefined) ? parseInt(home_score, 10) : null;
  const aScore = (away_score !== null && away_score !== '' && away_score !== undefined) ? parseInt(away_score, 10) : null;

  try {
    const stmt = db.prepare(`
      INSERT INTO predictions (match_id, player_id, home_score, away_score, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(match_id, player_id) DO UPDATE SET
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(match_id, player_id, hScore, aScore);
    res.json({ success: true, match_id, player_id, home_score: hScore, away_score: aScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SCORING RULES ENDPOINTS ────────────────────────────────────────────────
// Get active scoring tiers and bonus rules (Public)
app.get('/api/scoring-rules', (req, res) => {
  try {
    const rules = getScoringRules();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update scoring tiers and bonus rules (Admin only)
app.put('/api/scoring-rules', requireAdmin, (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules) || rules.length === 0) {
    return res.status(400).json({ error: 'A non-empty rules array is required' });
  }
  try {
    const updated = saveScoringRules(rules);
    res.json({ success: true, rules: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all available SVG assets dynamically from assets folder
app.get('/api/svg-assets', (req, res) => {
  try {
    const assetsDir = path.resolve(process.cwd(), 'assets');
    const iconsDir = path.resolve(process.cwd(), 'assets', 'icons');
    const svgFiles = [];

    if (fs.existsSync(iconsDir)) {
      const files = fs.readdirSync(iconsDir);
      for (const f of files) {
        if (f.endsWith('.svg')) {
          svgFiles.push(`assets/icons/${f}`);
        }
      }
    }

    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      for (const f of files) {
        if (f.endsWith('.svg') && !svgFiles.includes(`assets/${f}`)) {
          svgFiles.push(`assets/${f}`);
        }
      }
    }

    res.json(svgFiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EPL Predictor Server running on port ${PORT}`);
});

