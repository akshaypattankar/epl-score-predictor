// api.js - Backend API Client & FPL Proxy with Auth & Team Crest Support
const FALLBACK_TEAMS = {
  1: 'Arsenal', 2: 'Aston Villa', 3: 'Bournemouth', 4: 'Brentford', 5: 'Brighton',
  6: 'Chelsea', 7: 'Crystal Palace', 8: 'Everton', 9: 'Fulham', 10: 'Ipswich Town',
  11: 'Leicester City', 12: 'Liverpool', 13: 'Man City', 14: 'Man United',
  15: 'Newcastle', 16: 'Nott\'m Forest', 17: 'Southampton', 18: 'Spurs',
  19: 'West Ham', 20: 'Wolves',
};

const FALLBACK_TEAM_CODES = {
  1: 3, 2: 7, 3: 91, 4: 94, 5: 36,
  6: 8, 7: 31, 8: 11, 9: 54, 10: 40,
  11: 13, 12: 14, 13: 43, 14: 1, 15: 4,
  16: 17, 17: 20, 18: 6, 19: 21, 20: 39
};

let teamMap = null;
let authToken = (typeof localStorage !== 'undefined' ? localStorage.getItem('epl_auth_token') : null);

export const CLUB_DIRECTORY = Object.entries(FALLBACK_TEAMS).map(([id, name]) => ({
  id: Number(id),
  name,
  short: name.slice(0, 3).toUpperCase(),
  code: FALLBACK_TEAM_CODES[id] || Number(id),
}));

export function normalizeTeamName(name) {
  if (!name) return '';
  const str = String(name).trim().toLowerCase();
  if (str.includes('arsenal')) return 'Arsenal';
  if (str.includes('villa')) return 'Aston Villa';
  if (str.includes('bournemouth')) return 'Bournemouth';
  if (str.includes('brentford')) return 'Brentford';
  if (str.includes('brighton')) return 'Brighton';
  if (str.includes('chelsea')) return 'Chelsea';
  if (str.includes('crystal') || str.includes('palace')) return 'Crystal Palace';
  if (str.includes('everton')) return 'Everton';
  if (str.includes('fulham')) return 'Fulham';
  if (str.includes('ipswich')) return 'Ipswich Town';
  if (str.includes('leicester')) return 'Leicester City';
  if (str.includes('liverpool')) return 'Liverpool';
  if (str.includes('man city') || str.includes('manchester city')) return 'Man City';
  if (str.includes('man utd') || str.includes('man united') || str.includes('manchester united')) return 'Man United';
  if (str.includes('newcastle')) return 'Newcastle';
  if (str.includes('nott') || str.includes('forest')) return "Nott'm Forest";
  if (str.includes('southampton')) return 'Southampton';
  if (str.includes('spurs') || str.includes('tottenham')) return 'Spurs';
  if (str.includes('west ham')) return 'West Ham';
  if (str.includes('wolves') || str.includes('wolverhampton')) return 'Wolves';
  return String(name).trim();
}

export function getClubDetails(identifier) {
  if (!identifier) return null;
  if (typeof identifier === 'number') {
    const name = FALLBACK_TEAMS[identifier];
    if (!name) return null;
    return {
      id: identifier,
      name,
      short: name.slice(0, 3).toUpperCase(),
      code: FALLBACK_TEAM_CODES[identifier] || identifier,
    };
  }
  const normalized = normalizeTeamName(identifier);
  const id = Object.keys(FALLBACK_TEAMS).find(
    k => FALLBACK_TEAMS[k] === normalized
  );
  if (id) {
    const numId = Number(id);
    return {
      id: numId,
      name: FALLBACK_TEAMS[numId],
      short: FALLBACK_TEAMS[numId].slice(0, 3).toUpperCase(),
      code: FALLBACK_TEAM_CODES[numId] || numId,
    };
  }
  return { id: 0, name: identifier, short: identifier.slice(0, 3).toUpperCase(), code: 0 };
}

export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem('epl_auth_token', token);
  else localStorage.removeItem('epl_auth_token');
}

export function getAuthToken() {
  return authToken || localStorage.getItem('epl_auth_token') || null;
}

function getAuthHeaders(headers = {}) {
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseJsonResponse(res, defaultErrMsg = 'Request failed') {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned status ${res.status} (${res.statusText || 'Non-JSON response'}). Please ensure the backend server is running.`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || defaultErrMsg);
  return data;
}

// ─── AUTHENTICATION API ──────────────────────────────────────────────────────
export async function apiAdminLogin(password, playerName = '', timezone = 'UTC') {
  const payload = { password, timezone };
  if (playerName && playerName.trim()) {
    payload.player_name = playerName.trim();
  }
  const res = await fetch('/api/auth/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(res, 'Admin login failed');
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function apiAdminSetPlayer(playerNameOrId) {
  const payload = {};
  if (typeof playerNameOrId === 'number') {
    payload.player_id = playerNameOrId;
  } else if (playerNameOrId) {
    payload.player_name = playerNameOrId.trim();
  }
  const res = await fetch('/api/auth/admin/player', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return await parseJsonResponse(res, 'Failed to update admin player profile');
}

export async function apiPlayerLogin(playerNameOrId, passcode, timezone = 'UTC') {
  const payload = { passcode, timezone };
  if (typeof playerNameOrId === 'number') {
    payload.player_id = playerNameOrId;
  } else {
    payload.name = (playerNameOrId || '').trim();
  }
  const res = await fetch('/api/auth/player', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonResponse(res, 'Player login failed');
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function apiSaveTimezone(timezone) {
  try {
    const res = await fetch('/api/auth/timezone', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ timezone }),
    });
    return await res.json();
  } catch (err) {
    return { success: false };
  }
}

export async function apiVerifyAuth() {
  const token = getAuthToken();
  if (!token) return { role: 'guest' };
  try {
    const res = await fetch('/api/auth/verify', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { role: 'guest' };
    return await res.json();
  } catch (err) {
    return { role: 'guest' };
  }
}

export async function apiLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch (err) { }
  setAuthToken(null);
}

export async function apiResetPasscode(playerId) {
  const res = await fetch(`/api/players/${playerId}/reset-passcode`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset passcode');
  return data;
}

// ─── FPL API & CACHE METADATA ───────────────────────────────────────────────
let fplCacheMeta = {
  state: 'NORMAL',
  updatedAt: Date.now(),
  cacheStatus: 'HIT',
  ttl: 6 * 60 * 60 * 1000,
};

export function getFplCacheMeta() {
  return { ...fplCacheMeta };
}

export function resetFplCacheMetaToNormal() {
  fplCacheMeta.state = 'NORMAL';
}

async function fetchFPLData(path) {
  const targetUrl = `https://fantasy.premierleague.com/api${path}`;
  const endpoints = [
    `/api/fpl${path}`,
    `/api${path}`,
    `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
    targetUrl
  ];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        cache: 'default',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        // Capture cache metadata if provided by backend proxy
        const cacheStatus = res.headers.get('X-FPL-Cache');
        const matchState = res.headers.get('X-FPL-State');
        const updatedAt = res.headers.get('X-FPL-Updated-At');
        const ttl = res.headers.get('X-FPL-TTL');

        if (path.includes('fixtures')) {
          if (matchState) fplCacheMeta.state = matchState;
          if (updatedAt) fplCacheMeta.updatedAt = Number(updatedAt);
          if (cacheStatus) fplCacheMeta.cacheStatus = cacheStatus;
          if (ttl) fplCacheMeta.ttl = Number(ttl);
        }

        return await res.json();
      }
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to fetch FPL path: ${path}`);
}

export async function fetchTeams() {
  if (teamMap) return teamMap;
  try {
    const data = await fetchFPLData('/bootstrap-static/');
    teamMap = Object.fromEntries(
      data.teams.map(t => [t.id, { id: t.id, name: t.name, short: t.short_name, code: t.code }])
    );
  } catch (err) {
    console.warn('FPL bootstrap fetch failed - using fallback team names', err);
    teamMap = Object.fromEntries(
      Object.entries(FALLBACK_TEAMS).map(([id, name]) => [
        Number(id), { id: Number(id), name, short: name.slice(0, 3).toUpperCase(), code: FALLBACK_TEAM_CODES[id] || Number(id) }
      ])
    );
  }
  return teamMap;
}

export function getCrestImg(code, name = '') {
  if (!code) return `<span class="team-crest-emoji">⚽</span>`;
  const svgUrl = `https://fplbox.python-beardie.ts.net/assets/team_crests/svg_crests/${code}.svg`;
  const pngUrl = `https://fplbox.python-beardie.ts.net/assets/team_crests/png_crests/${code}.png`;
  return `<img class="team-crest-img" src="${svgUrl}" alt="${name}" onerror="this.onerror=null; this.src='${pngUrl}';" />`;
}

export async function fetchFixtures() {
  const teams = await fetchTeams();
  const raw = await fetchFPLData('/fixtures/');

  const byGW = {};
  for (const f of raw) {
    const gw = f.event;
    if (!gw) continue;
    if (!byGW[gw]) byGW[gw] = [];
    const home = teams[f.team_h] ?? { name: `Team ${f.team_h}`, short: `T${f.team_h}`, code: f.team_h };
    const away = teams[f.team_a] ?? { name: `Team ${f.team_a}`, short: `T${f.team_a}`, code: f.team_a };
    byGW[gw].push({
      id: f.id,
      event: gw,
      kickoff_time: f.kickoff_time,
      team_h: f.team_h,
      team_a: f.team_a,
      home_name: home.name,
      away_name: away.name,
      home_short: home.short,
      away_short: away.short,
      home_code: home.code,
      away_code: away.code,
      actual_home_score: f.team_h_score,
      actual_away_score: f.team_a_score,
      finished: f.finished,
      finished_provisional: f.finished_provisional ?? false,
      started: f.started,
    });
  }

  const gwNumbers = Object.keys(byGW).map(Number).sort((a, b) => a - b);
  return { gwNumbers, byGW, teams };
}

// ─── GROUPS API ─────────────────────────────────────────────────────────────
export async function apiFetchGroups() {
  const res = await fetch('/api/groups');
  if (!res.ok) throw new Error('Failed to fetch groups');
  return res.json();
}

export async function apiCreateGroup(name, teamsFilter = 'ALL') {
  const res = await fetch('/api/groups', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, teams_filter: teamsFilter }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create group');
  return data;
}

export async function apiRenameGroup(id, name, teamsFilter = 'ALL') {
  const res = await fetch(`/api/groups/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, teams_filter: teamsFilter }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to rename group');
  return data;
}

export async function apiDeleteGroup(id) {
  const res = await fetch(`/api/groups/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete group');
  return data;
}

// ─── PLAYERS & MASTER DIRECTORY API ──────────────────────────────────────────
export async function apiFetchMasterPlayers() {
  const res = await fetch('/api/players', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch master directory');
  return res.json();
}

export async function apiCreateMasterPlayer(name, groupIds = []) {
  const res = await fetch('/api/players', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, group_ids: groupIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create player');
  return data;
}

export async function apiRenameMasterPlayer(id, name) {
  const res = await fetch(`/api/players/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to rename player');
  return data;
}

export async function apiDeleteMasterPlayer(id) {
  const res = await fetch(`/api/players/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete player');
  return data;
}

export async function apiAssignPlayerToGroup(playerId, groupId) {
  const res = await fetch(`/api/players/${playerId}/groups`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ group_id: groupId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to assign player to group');
  return data;
}

export async function apiRemovePlayerFromGroup(playerId, groupId) {
  const res = await fetch(`/api/players/${playerId}/groups/${groupId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove player from group');
  return data;
}

export async function apiFetchGroupPlayers(groupId) {
  const res = await fetch(`/api/groups/${groupId}/players`);
  if (!res.ok) throw new Error('Failed to fetch group players');
  return res.json();
}

// ─── PREDICTIONS API ────────────────────────────────────────────────────────
export async function apiFetchPredictions(groupId) {
  const url = groupId ? `/api/predictions?groupId=${groupId}` : '/api/predictions';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch predictions');
  return res.json();
}

export async function apiSavePrediction(matchId, playerId, groupId, homeScore, awayScore) {
  const res = await fetch('/api/predictions', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      match_id: matchId,
      player_id: playerId,
      group_id: groupId,
      home_score: homeScore === '' || homeScore === null ? null : Number(homeScore),
      away_score: awayScore === '' || awayScore === null ? null : Number(awayScore),
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save prediction');
  return data;
}

// ─── SCORING RULES API ───────────────────────────────────────────────────────
export async function apiFetchScoringRules() {
  const res = await fetch('/api/scoring-rules');
  if (!res.ok) throw new Error('Failed to fetch scoring rules');
  return res.json();
}

export async function apiUpdateScoringRules(rules) {
  const res = await fetch('/api/scoring-rules', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ rules }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update scoring rules');
  return data;
}

export async function apiResetScoringRules() {
  const res = await fetch('/api/scoring-rules/reset', {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reset scoring rules');
  return data;
}

export async function apiFetchSvgAssets() {
  try {
    const res = await fetch('/api/svg-assets');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch dynamic SVG assets list:', err.message);
    return [];
  }
}


