import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dns from 'dns';
import fs from 'fs';
import path from 'path';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore
}
import db, {
  generatePasscode,
  getFplCache,
  setFplCache,
  getAdminPassword,
  syncCredentialsFile,
  getScoringRules,
  saveScoringRules,
  resetScoringRules,
  backupDatabase,
  listBackups,
  scheduleNightlyBackup,
  setAppSetting,
  deleteAppSetting,
  getGroupWagers,
  bulkSetGroupWagers,
  setSingleWager,
  getGroupWagerSettings,
  setGroupWagerSettings,
  getGroupPlayerStakes,
  setGroupPlayerStakes
} from './db.js';
import { calculateBackendWhatIfStandings, getPasSettingsDetails } from './whatif.js';
import {
  slugifyTopic,
  getNtfyConfig,
  sendNtfyNotification,
  checkAndSendPredictionReminders,
  runNotificationCycle,
  startNotificationScheduler
} from './notifications.js';

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
const lastSeenThrottle = new Map();

export function touchPlayerLastSeen(playerId) {
  if (!playerId) return;
  const now = Date.now();
  const last = lastSeenThrottle.get(playerId) || 0;
  // Throttle updates to at most once every 10 seconds per player
  if (now - last > 10000) {
    lastSeenThrottle.set(playerId, now);
    try {
      db.prepare(`UPDATE players SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`).run(playerId);
    } catch (e) {
      console.warn('Error updating player last_seen_at:', e.message);
    }
  }
}

function getSession(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const now = Date.now();
  const row = db.prepare('SELECT * FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > ?)').get(token, now);
  if (!row) return null;
  if (row.player_id) {
    touchPlayerLastSeen(row.player_id);
  }
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

  if (player) {
    try {
      db.prepare('UPDATE players SET last_login_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);
      lastSeenThrottle.set(player.id, Date.now());
    } catch (e) {}
  }

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

  if (player) {
    try {
      db.prepare('UPDATE players SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(player.id);
      lastSeenThrottle.set(player.id, Date.now());
    } catch (e) {}
  }

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
  try {
    db.prepare('UPDATE players SET last_login_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP' + (timezone && timezone !== player.timezone ? ', timezone = ?' : '') + ' WHERE id = ?')
      .run(...(timezone && timezone !== player.timezone ? [timezone, player.id] : [player.id]));
    lastSeenThrottle.set(player.id, Date.now());
  } catch (e) {
    console.warn('Error updating player login timestamp:', e.message);
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

app.post('/api/players/activity/ping', (req, res) => {
  const sess = getSession(req);
  if (sess && sess.playerId) {
    try {
      db.prepare('UPDATE players SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(sess.playerId);
      lastSeenThrottle.set(sess.playerId, Date.now());
    } catch (e) {}
    return res.json({ success: true, player_id: sess.playerId, last_seen_at: new Date().toISOString() });
  }
  res.json({ success: false, reason: 'No active player session' });
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
// Get groups with member counts (Restricted to member groups for players; all groups for admins/guests)
app.get('/api/groups', (req, res) => {
  const sess = getSession(req);
  try {
    let groups;
    if (sess && sess.role === 'player' && sess.playerId) {
      groups = db.prepare(`
        SELECT g.*, COUNT(gp_all.player_id) as player_count
        FROM groups g
        INNER JOIN group_players gp_user ON g.id = gp_user.group_id AND gp_user.player_id = ?
        LEFT JOIN group_players gp_all ON g.id = gp_all.group_id
        GROUP BY g.id
        ORDER BY g.name ASC
      `).all(sess.playerId);
    } else {
      groups = db.prepare(`
        SELECT g.*, COUNT(gp.player_id) as player_count
        FROM groups g
        LEFT JOIN group_players gp ON g.id = gp.group_id
        GROUP BY g.id
        ORDER BY g.name ASC
      `).all();
    }
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new group (Admin only)
app.post('/api/groups', requireAdmin, (req, res) => {
  const { name, teams_filter, start_gw, ntfy_topic } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  const filterVal = (Array.isArray(teams_filter) && teams_filter.length > 0)
    ? JSON.stringify(teams_filter)
    : (typeof teams_filter === 'string' ? teams_filter : 'ALL');
  const startGwVal = (start_gw !== undefined && start_gw !== null && start_gw !== '') ? Math.max(1, Math.min(38, parseInt(start_gw, 10) || 1)) : 1;
  const topicVal = ntfy_topic && ntfy_topic.trim() ? ntfy_topic.trim() : slugifyTopic(name.trim(), Date.now());

  try {
    const stmt = db.prepare('INSERT INTO groups (name, teams_filter, start_gw, ntfy_topic) VALUES (?, ?, ?, ?)');
    const info = stmt.run(name.trim(), filterVal, startGwVal, topicVal);
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), teams_filter: filterVal, start_gw: startGwVal, ntfy_topic: topicVal, player_count: 0 });
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
  const { name, teams_filter, start_gw, ntfy_topic } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  const filterVal = (Array.isArray(teams_filter) && teams_filter.length > 0)
    ? JSON.stringify(teams_filter)
    : (typeof teams_filter === 'string' ? teams_filter : 'ALL');

  try {
    const current = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!current) return res.status(404).json({ error: 'Group not found' });

    const startGwVal = (start_gw !== undefined && start_gw !== null)
      ? Math.max(1, Math.min(38, parseInt(start_gw, 10) || 1))
      : (current.start_gw || 1);
    const topicVal = (ntfy_topic !== undefined && ntfy_topic !== null)
      ? String(ntfy_topic).trim()
      : (current.ntfy_topic || slugifyTopic(name.trim(), groupId));

    const stmt = db.prepare('UPDATE groups SET name = ?, teams_filter = ?, start_gw = ?, ntfy_topic = ? WHERE id = ?');
    stmt.run(name.trim(), filterVal, startGwVal, topicVal, groupId);
    res.json({ id: groupId, name: name.trim(), teams_filter: filterVal, start_gw: startGwVal, ntfy_topic: topicVal });
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

// Get players in a specific group (Restricted to group members for players; all groups for admins/guests)
app.get('/api/groups/:id/players', (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const sess = getSession(req);
  if (sess && sess.role === 'player' && sess.playerId) {
    const isMember = db.prepare('SELECT 1 FROM group_players WHERE group_id = ? AND player_id = ?').get(groupId, sess.playerId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not authorized to view players for this group' });
    }
  }

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
      SELECT p.id, p.name, p.passcode, p.timezone, p.ntfy_topic, p.last_login_at, p.last_seen_at, p.created_at,
        COALESCE(json_group_array(gp.group_id), '[]') as group_ids,
        MAX(pr.updated_at) as last_prediction_at,
        COUNT(CASE WHEN pr.home_score IS NOT NULL AND pr.away_score IS NOT NULL THEN 1 END) as total_predictions
      FROM players p
      LEFT JOIN group_players gp ON p.id = gp.player_id
      LEFT JOIN predictions pr ON p.id = pr.player_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all();

    const formatted = players.map(p => {
      let groupIds = [];
      try {
        groupIds = [...new Set(JSON.parse(p.group_ids).filter(id => id !== null))];
      } catch (e) {
        groupIds = [];
      }
      const pObj = {
        ...p,
        group_ids: groupIds,
        total_predictions: p.total_predictions || 0
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
  const sess = getSession(req);
  if (sess && sess.role === 'player' && sess.playerId && groupId) {
    const isMember = db.prepare('SELECT 1 FROM group_players WHERE group_id = ? AND player_id = ?').get(groupId, sess.playerId);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not authorized to view predictions for this group' });
    }
  }

  try {
    let rows;
    if (groupId) {
      rows = db.prepare(`
        SELECT p.match_id, p.player_id, p.home_score, p.away_score
        FROM predictions p
        INNER JOIN group_players gp ON gp.player_id = p.player_id
        WHERE gp.group_id = ?
      `).all(groupId);
    } else if (sess && sess.role === 'player' && sess.playerId) {
      rows = db.prepare(`
        SELECT DISTINCT p.match_id, p.player_id, p.home_score, p.away_score
        FROM predictions p
        INNER JOIN group_players gp_user ON gp_user.player_id = ?
        INNER JOIN group_players gp_peer ON gp_peer.group_id = gp_user.group_id AND gp_peer.player_id = p.player_id
      `).all(sess.playerId);
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

    try {
      db.prepare('UPDATE players SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(player_id);
      lastSeenThrottle.set(Number(player_id), Date.now());
    } catch (e) {}

    res.json({ success: true, match_id, player_id, home_score: hScore, away_score: aScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WAGERS & STAKES ENDPOINTS ──────────────────────────────────────────────
// Get all wagers, player stakes, and settings for a group (Public/Player/Admin)
app.get('/api/wagers', (req, res) => {
  const groupId = parseInt(req.query.group_id, 10);
  if (!groupId) {
    return res.status(400).json({ error: 'group_id query parameter is required' });
  }
  try {
    const wagers = getGroupWagers(groupId);
    const settings = getGroupWagerSettings(groupId);
    const player_stakes = getGroupPlayerStakes(groupId);
    res.json({ success: true, group_id: groupId, wagers, settings, player_stakes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update member stakes in bulk across all scope games (Admin Only)
app.put('/api/wagers/player-stakes', requireAdmin, (req, res) => {
  const { group_id, stakes, match_ids } = req.body;
  if (!group_id || !Array.isArray(stakes)) {
    return res.status(400).json({ error: 'group_id and stakes array are required' });
  }

  try {
    const updatedStakes = setGroupPlayerStakes(Number(group_id), stakes, match_ids);
    res.json({ success: true, group_id: Number(group_id), player_stakes: updatedStakes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk set wagers for matches (Admin Only)
app.post('/api/wagers/bulk', requireAdmin, (req, res) => {
  const { group_id, player_id, amount, match_ids } = req.body;
  if (!group_id || player_id === undefined || amount === undefined || !Array.isArray(match_ids)) {
    return res.status(400).json({ error: 'group_id, player_id, amount, and match_ids array are required' });
  }

  const validMatchIds = match_ids.map(Number);

  try {
    const result = bulkSetGroupWagers(Number(group_id), Number(player_id), Number(amount), validMatchIds);
    res.json({
      success: true,
      group_id: Number(group_id),
      player_id: Number(player_id),
      amount: Number(amount),
      updated_count: result.changes,
      total_requested: match_ids.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update or set wager for a single match (Admin Only)
app.put('/api/wagers', requireAdmin, (req, res) => {
  const { group_id, match_id, player_id, amount } = req.body;
  if (!group_id || !match_id || player_id === undefined || amount === undefined) {
    return res.status(400).json({ error: 'group_id, match_id, player_id, and amount are required' });
  }

  try {
    setSingleWager(Number(group_id), Number(match_id), Number(player_id), Number(amount));
    res.json({ success: true, group_id: Number(group_id), match_id: Number(match_id), player_id: Number(player_id), amount: Number(amount) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update group wager settings (default stake and weekly split percent) (Admin Only)
app.put('/api/wagers/settings', requireAdmin, (req, res) => {
  const { group_id, default_stake, weekly_split_percent } = req.body;
  if (!group_id) {
    return res.status(400).json({ error: 'group_id is required' });
  }

  try {
    const updated = setGroupWagerSettings(Number(group_id), { default_stake, weekly_split_percent });
    res.json({ success: true, settings: updated });
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

// ─── DATABASE BACKUPS ENDPOINTS ──────────────────────────────────────────────
app.post('/api/admin/backups', requireAdmin, async (req, res) => {
  try {
    const result = await backupDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/backups', requireAdmin, (req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WHAT-IF STANDINGS SIMULATOR ENDPOINT ────────────────────────────────────
app.get('/api/whatif/standings', (req, res) => {
  try {
    const sess = getSession(req);
    if (!sess) {
      return res.status(401).json({ error: 'Authentication required to view What-If prediction simulator' });
    }
    const playerId = req.query.playerId || (sess ? sess.playerId : null);
    const mode = req.query.mode || 'completed';
    const startGw = req.query.startGw || 1;
    const gwLimit = req.query.gwLimit || 'all';

    const result = calculateBackendWhatIfStandings(db, {
      playerId,
      mode,
      startGw,
      gwLimit
    });

    res.json(result);
  } catch (err) {
    console.error('What-If standings calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate What-If standings: ' + err.message });
  }
});

// ─── PAS ACCURACY SCORE SETTINGS ENDPOINTS ────────────────────────────────────
// Get current PAS weightages, active source (db/env/default), and defaults
app.get('/api/whatif/pas-settings', (req, res) => {
  try {
    const details = getPasSettingsDetails(db);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve PAS settings: ' + err.message });
  }
});

// Save custom PAS weightages into database (Admin only)
app.put('/api/whatif/pas-settings', requireAdmin, (req, res) => {
  try {
    const { match, rank, points, rho, mars } = req.body;

    if (match !== undefined) setAppSetting('pas_weight_match', match);
    if (rank !== undefined) setAppSetting('pas_weight_rank', rank);
    if (points !== undefined) setAppSetting('pas_weight_points', points);
    if (rho !== undefined) setAppSetting('pas_weight_rho', rho);
    if (mars !== undefined) setAppSetting('pas_weight_mars', mars);

    const details = getPasSettingsDetails(db);
    res.json({ success: true, ...details });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save PAS settings: ' + err.message });
  }
});

// Reset PAS weightages to environment or system defaults (Admin only)
app.post('/api/whatif/pas-settings/reset', requireAdmin, (req, res) => {
  try {
    deleteAppSetting('pas_weight_match');
    deleteAppSetting('pas_weight_rank');
    deleteAppSetting('pas_weight_points');
    deleteAppSetting('pas_weight_rho');
    deleteAppSetting('pas_weight_mars');

    const details = getPasSettingsDetails(db);
    res.json({ success: true, message: 'Reset to defaults/environment', ...details });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset PAS settings: ' + err.message });
  }
});

// ─── NTFY NOTIFICATIONS ENDPOINTS ──────────────────────────────────────────
// Get current ntfy notification settings and topics
app.get('/api/notifications/settings', (req, res) => {
  try {
    const config = getNtfyConfig();
    const sess = getSession(req);

    // Get groups with their ntfy topic
    let groups;
    if (sess && sess.role === 'player' && sess.playerId) {
      groups = db.prepare(`
        SELECT g.id, g.name, g.ntfy_topic
        FROM groups g
        INNER JOIN group_players gp ON g.id = gp.group_id AND gp.player_id = ?
        ORDER BY g.name ASC
      `).all(sess.playerId);
    } else {
      groups = db.prepare('SELECT id, name, ntfy_topic FROM groups ORDER BY name ASC').all();
    }

    const groupsWithUrls = groups.map(g => ({
      ...g,
      subscribe_url: `${config.serverUrl}/${g.ntfy_topic}`
    }));

    let playerTopic = null;
    if (sess && sess.playerId) {
      const p = db.prepare('SELECT ntfy_topic FROM players WHERE id = ?').get(sess.playerId);
      playerTopic = p?.ntfy_topic || null;
    }

    res.json({
      ...config,
      groups: groupsWithUrls,
      player_topic: playerTopic,
      player_subscribe_url: playerTopic ? `${config.serverUrl}/${playerTopic}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update global ntfy notification settings (Admin only)
app.put('/api/notifications/settings', requireAdmin, (req, res) => {
  try {
    const { enabled, server_url, app_url, reminder_hours, kickoff_minutes, include_heatmaps } = req.body;

    if (enabled !== undefined) setAppSetting('ntfy_enabled', enabled ? '1' : '0');
    if (server_url !== undefined) setAppSetting('ntfy_server', String(server_url).trim().replace(/\/+$/, ''));
    if (app_url !== undefined) setAppSetting('ntfy_app_url', String(app_url).trim().replace(/\/+$/, ''));
    if (reminder_hours !== undefined) {
      const arr = Array.isArray(reminder_hours) ? reminder_hours.join(',') : String(reminder_hours);
      setAppSetting('ntfy_reminder_hours', arr);
    }
    if (kickoff_minutes !== undefined) {
      const mins = Math.max(1, Math.min(120, parseInt(kickoff_minutes, 10) || 15));
      setAppSetting('ntfy_kickoff_minutes', String(mins));
    }
    if (include_heatmaps !== undefined) {
      setAppSetting('ntfy_include_heatmaps', include_heatmaps ? '1' : '0');
    }

    const updated = getNtfyConfig();
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update or regenerate ntfy topic for a group (Admin only)
app.put('/api/groups/:id/ntfy', requireAdmin, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  let newTopic = req.body.ntfy_topic ? String(req.body.ntfy_topic).trim() : null;
  if (!newTopic) {
    newTopic = slugifyTopic(group.name, group.id);
  }

  // Ensure topic is URL safe
  newTopic = newTopic.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');

  try {
    db.prepare('UPDATE groups SET ntfy_topic = ? WHERE id = ?').run(newTopic, groupId);
    const config = getNtfyConfig();
    res.json({
      success: true,
      group_id: groupId,
      ntfy_topic: newTopic,
      subscribe_url: `${config.serverUrl}/${newTopic}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update personal ntfy topic for authenticated player
app.put('/api/players/me/ntfy', requirePlayerOrAdmin, (req, res) => {
  const playerId = req.session.playerId;
  if (!playerId) return res.status(400).json({ error: 'No player associated with session' });

  let newTopic = req.body.ntfy_topic ? String(req.body.ntfy_topic).trim() : null;
  if (newTopic) {
    newTopic = newTopic.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  }

  try {
    db.prepare('UPDATE players SET ntfy_topic = ? WHERE id = ?').run(newTopic, playerId);
    const config = getNtfyConfig();
    res.json({
      success: true,
      player_id: playerId,
      ntfy_topic: newTopic,
      subscribe_url: newTopic ? `${config.serverUrl}/${newTopic}` : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a test notification to a topic or league
app.post('/api/notifications/test', requirePlayerOrAdmin, async (req, res) => {
  try {
    const { topic, group_id, test_type } = req.body;
    let targetTopic = topic;
    let group = null;

    if (group_id) {
      group = db.prepare('SELECT id, ntfy_topic, name FROM groups WHERE id = ?').get(Number(group_id));
      if (!targetTopic && group) targetTopic = group.ntfy_topic;
    }

    if (!targetTopic) {
      return res.status(400).json({ error: 'Target topic is required' });
    }

    const config = getNtfyConfig();
    const groupName = group ? group.name : 'League';

    if (test_type === 'kickoff') {
      let heatmapBuffer = null;
      let heatmapFilename = null;
      try {
        const { generateMatchHeatmapPng } = await import('./heatmap_generator.js');
        const { png } = generateMatchHeatmapPng({
          fixture: { id: 99991, event: 9 },
          homeTeam: { short: 'ARS', name: 'Arsenal', code: 3, id: 1 },
          awayTeam: { short: 'CHE', name: 'Chelsea', code: 8, id: 6 },
          playersWithPreds: [
            { name: 'Alice', pred_h: 2, pred_a: 1 },
            { name: 'Bob', pred_h: 1, pred_a: 1 },
            { name: 'Charlie', pred_h: 3, pred_a: 1 },
            { name: 'Dave', pred_h: 0, pred_a: 2 }
          ],
          leagueName: groupName,
          isFullTime: false
        });
        heatmapBuffer = png;
        heatmapFilename = 'test_kickoff_heatmap.png';
      } catch (e) {
        console.warn('Failed to generate test kickoff heatmap:', e.message);
      }

      const result = await sendNtfyNotification({
        serverUrl: config.serverUrl,
        topic: targetTopic,
        title: '🔒 Kickoff: ARS vs CHE',
        message: [
          '![ARS](https://resources.premierleague.com/premierleague/badges/50/t3.png) **ARS** vs **CHE** ![CHE](https://resources.premierleague.com/premierleague/badges/50/t8.png)',
          '### 🔒 Inputs Locked — Match Underway!',
          '**Arsenal** vs **Chelsea**',
          `*Gameweek 9 · League: ${groupName}*`,
          '',
          '---',
          '### 📋 Group Predictions:',
          '• **Alice**: `2 - 1`',
          '• **Bob**: `1 - 1`',
          '• **Charlie**: `3 - 1`',
          '• **Dave**: `0 - 2`',
          '• **Emma**: *(No prediction)*'
        ].join('\n'),
        priority: 4,
        tags: 'soccer,lock,whistle,bar_chart',
        icon: 'https://resources.premierleague.com/premierleague/badges/70/t3.png',
        markdown: true,
        attachmentBuffer: heatmapBuffer,
        attachmentFilename: heatmapFilename
      });
      return res.json({ success: true, topic: targetTopic, result, test_type: 'kickoff' });
    } else if (test_type === 'finished') {
      const allRules = getScoringRules();
      const tiers = Array.isArray(allRules) ? allRules.filter(r => r.rule_type === 'tier') : [];
      const t1 = tiers.find(t => String(t.id) === '1') || { name: 'Vishwaguru', icon: '🔮', pts: 10 };
      const t2 = tiers.find(t => String(t.id) === '2') || { name: 'Manager', icon: '🤹', pts: 7 };
      const t3 = tiers.find(t => String(t.id) === '3') || { name: 'FM Enthusiast', icon: '🧑‍💻', pts: 5 };
      const t4 = tiers.find(t => String(t.id) === '4') || { name: 'Pundit', icon: '🗣️', pts: 3 };
      const t5 = tiers.find(t => String(t.id) === '5') || { name: 'Casual Fan', icon: '🍟', pts: 1 };
      const t6 = tiers.find(t => String(t.id) === '6') || { name: 'Infantino', icon: '🤡', pts: 0 };

      let heatmapBuffer = null;
      let heatmapFilename = null;
      try {
        const { generateMatchHeatmapPng } = await import('./heatmap_generator.js');
        const { png } = generateMatchHeatmapPng({
          fixture: { id: 99991, event: 9, team_h_score: 2, team_a_score: 1 },
          homeTeam: { short: 'ARS', name: 'Arsenal', code: 3, id: 1 },
          awayTeam: { short: 'CHE', name: 'Chelsea', code: 8, id: 6 },
          playersWithPreds: [
            { name: 'Alice', pred_h: 2, pred_a: 1 },
            { name: 'Charlie', pred_h: 3, pred_a: 1 },
            { name: 'Bob', pred_h: 1, pred_a: 1 },
            { name: 'Dave', pred_h: 0, pred_a: 2 }
          ],
          actualScore: { home: 2, away: 1 },
          leagueName: groupName,
          isFullTime: true
        });
        heatmapBuffer = png;
        heatmapFilename = 'test_final_heatmap.png';
      } catch (e) {
        console.warn('Failed to generate test final heatmap:', e.message);
      }

      const result = await sendNtfyNotification({
        serverUrl: config.serverUrl,
        topic: targetTopic,
        title: '🏁 Full-Time: ARS 2 - 1 CHE',
        message: [
          '![ARS](https://resources.premierleague.com/premierleague/badges/50/t3.png) **ARS 2 - 1 CHE** ![CHE](https://resources.premierleague.com/premierleague/badges/50/t8.png)',
          '### 🏁 Final: Arsenal 2 - 1 Chelsea',
          `*Gameweek 9 · League: ${groupName}*`,
          '',
          '---',
          '### 🏆 Points Earned This Match:',
          `• **Alice**: \`2 - 1\` → **+${t1.pts} pts** ${t1.icon} *(${t1.name})*`,
          `• **Charlie**: \`3 - 1\` → **+${t3.pts} pts** ${t3.icon} *(${t3.name})*`,
          `• **Bob**: \`1 - 1\` → **+0 pts** ${t6.icon} *(${t6.name})*`,
          `• **Dave**: \`0 - 2\` → **+0 pts** ${t6.icon} *(${t6.name})*`,
          '• **Emma**: *(No prediction)* → **+0 pts**'
        ].join('\n'),
        priority: 3,
        tags: 'soccer,checkered_flag,trophy,bar_chart',
        icon: 'https://resources.premierleague.com/premierleague/badges/70/t3.png',
        markdown: true,
        attachmentBuffer: heatmapBuffer,
        attachmentFilename: heatmapFilename
      });
      return res.json({ success: true, topic: targetTopic, result, test_type: 'finished' });
    }

    const result = await sendNtfyNotification({
      serverUrl: config.serverUrl,
      topic: targetTopic,
      title: '🔔 Test Notification from EPL Predictor',
      message: `Connection successful for ${groupName}!\nYou are subscribed to match kickoff locks, full-time points, and prediction reminders.`,
      priority: 3,
      tags: 'tada,soccer,white_check_mark',
      markdown: true
    });

    res.json({ success: true, topic: targetTopic, result, test_type: 'connection' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test notification: ' + err.message });
  }
});

// Manually trigger prediction reminders for active Gameweek (Admin only)
app.post('/api/notifications/remind-predictions', requireAdmin, async (req, res) => {
  try {
    const fixturesCache = getFplCache('fixtures');
    if (!fixturesCache || !fixturesCache.data) {
      return res.status(400).json({ error: 'No fixture data available to process reminders' });
    }

    const fixtures = JSON.parse(fixturesCache.data);
    const config = getNtfyConfig();
    const { getTeamsMap } = await import('./notifications.js');
    const teamsMap = getTeamsMap();

    const sentCount = await checkAndSendPredictionReminders(fixtures, teamsMap, config, { force: true });
    res.json({ success: true, sent_count: sentCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger prediction reminders: ' + err.message });
  }
});

// Get recent notifications log (Admin only)
app.get('/api/notifications/history', requireAdmin, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT * FROM sent_notifications
      ORDER BY id DESC
      LIMIT 50
    `).all();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EPL Predictor Server running on port ${PORT}`);
  scheduleNightlyBackup();
  startNotificationScheduler();
});

