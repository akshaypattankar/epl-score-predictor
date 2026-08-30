// app.js - EPL Score Predictor Main Application with Auth, Guest Privacy, Polished Themes & Team-Restricted Groups
import {
  fetchFixtures,
  getCrestImg,
  getClubDetails,
  normalizeTeamName,
  CLUB_DIRECTORY,
  getAuthToken,
  apiAdminLogin,
  apiAdminSetPlayer,
  apiPlayerLogin,
  apiVerifyAuth,
  apiLogout,
  apiResetPasscode,
  apiFetchGroups,
  apiCreateGroup,
  apiRenameGroup,
  apiDeleteGroup,
  apiFetchGroupPlayers,
  apiFetchMasterPlayers,
  apiCreateMasterPlayer,
  apiRenameMasterPlayer,
  apiDeleteMasterPlayer,
  apiAssignPlayerToGroup,
  apiRemovePlayerFromGroup,
  apiFetchPredictions,
  apiSavePrediction,
  apiSaveTimezone,
  getFplCacheMeta,
  resetFplCacheMetaToNormal,
  apiFetchScoringRules,
  apiUpdateScoringRules,
  apiResetScoringRules
} from './api.js';
import { evaluatePrediction, ptsBadgeClass, tierLabel, SCORING_TIERS, SCORING_BONUSES, getPredictionBreakdown, renderExampleContainer, updateScoringRulesState } from './scoring.js';
import { initRulesEditorModal, openRulesEditorModal, renderIconElement, generateLowestScenarioPreset } from './rulesEditor.js';
import { exportRulesToPdf, exportRulesToJpeg } from './rulesExporter.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  activeView: 'dashboard', // 'dashboard' | 'scoring' | 'management'
  fixtures: {},        // { [gw]: fixture[] }
  gwNumbers: [],
  teams: {},           // team dict with codes & names
  activeGW: null,
  groups: [],          // [{ id, name, teams_filter, player_count }]
  activeGroup: null,   // { id, name, teams_filter }
  players: [],         // [{ id, group_id, name }] (active group players)
  masterPlayers: [],   // [{ id, name, group_ids: [number], passcode?: string }] (master directory)
  predictions: {},     // { `${match_id}_${player_id}`: { predicted_home, predicted_away } }
  selectedTeam: 'ALL',
  selectedTeams: [],   // Array of selected team names, e.g. ['Arsenal', 'Chelsea']. Empty array [] = All teams
  playerSearchQuery: '',
  timezone: localStorage.getItem('epl_timezone') || 'UTC',
  chartMode: localStorage.getItem('epl_chart_mode') || 'ribbon', // 'ribbon' | 'stepped' | 'linear'
  chartDrilldownGW: null, // null (Season Overview) or number e.g. 1 (isolated drilldown view)
  chartExpandedGWs: null, // Initialized to default active current GW expanded, e.g. new Set([activeGW])
  auth: {
    role: 'guest',    // 'guest' | 'player' | 'admin'
    activePlayerId: null,
    activePlayerName: '',
    token: null,
  },
  pendingAdminTargetView: null,
};

// ─── Color Theory Golden-Ratio Contrasting Player Palette System ───────────
/**
 * Generates perceptually distinct, maximally contrasting tones across players.
 * Uses the Golden Angle (137.508°) on the HSL color wheel so no two players
 * in a group have same or similar hues, while tuning lightness and saturation
 * for high contrast and legibility on dark glass backgrounds.
 */
const sessionBaseHue = Math.floor(Math.random() * 360);
const sessionPlayerColorMap = new Map();

/**
 * Converts HSL values to a 6-digit hex color code.
 */
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Fine-tunes saturation and lightness per hue region based on human visual perception (Helmholtz-Kohlrausch effect)
 * so that colors across the spectrum have balanced perceived brightness on dark backgrounds.
 */
function getTunedHsl(hue) {
  const h = ((hue % 360) + 360) % 360;
  let s = 88;
  let l = 60;

  if (h >= 40 && h <= 95) {
    // Yellows, Ambers, Chartreuse - slightly lower lightness to avoid washed out neon
    l = 52;
    s = 92;
  } else if (h >= 215 && h <= 290) {
    // Blues, Indigos, Deep Violets - boost lightness for crisp readability on dark glass
    l = 66;
    s = 90;
  } else if (h >= 340 || h <= 25) {
    // Coral, Crimson, Flame Red
    l = 60;
    s = 92;
  } else if (h >= 140 && h <= 200) {
    // Emerald, Teal, Cyan
    l = 56;
    s = 88;
  } else {
    // Magenta, Purple, Rose
    l = 62;
    s = 88;
  }

  return { h, s, l };
}

/**
 * Re-indexes all active group players to guarantee maximally distinct,
 * contrasting hues distributed via Golden Angle stepping.
 */
function recalculateGroupPlayerColors(playersList) {
  if (!Array.isArray(playersList) || playersList.length === 0) return;
  sessionPlayerColorMap.clear();

  // Stable sort by numeric ID
  const sorted = [...playersList].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

  sorted.forEach((player, idx) => {
    // Golden angle distribution: (base + idx * 137.507764°) % 360°
    const hue = (sessionBaseHue + (idx * 137.507764)) % 360;
    const { h, s, l } = getTunedHsl(hue);
    const hex = hslToHex(h, s, l);

    if (player.id != null) {
      sessionPlayerColorMap.set(`id_${player.id}`, hex);
    }
    if (player.name) {
      sessionPlayerColorMap.set(`name_${player.name.toLowerCase().trim()}`, hex);
    }
  });
}

function getPlayerColor(playerOrIdOrName) {
  if (playerOrIdOrName == null) {
    const { h, s, l } = getTunedHsl(sessionBaseHue);
    return hslToHex(h, s, l);
  }

  let idKey = null;
  let nameKey = null;

  if (typeof playerOrIdOrName === 'object') {
    if (playerOrIdOrName.id != null) idKey = `id_${playerOrIdOrName.id}`;
    if (playerOrIdOrName.name) nameKey = `name_${playerOrIdOrName.name.toLowerCase().trim()}`;
  } else if (typeof playerOrIdOrName === 'number') {
    idKey = `id_${playerOrIdOrName}`;
  } else if (typeof playerOrIdOrName === 'string') {
    if (/^\d+$/.test(playerOrIdOrName.trim())) {
      idKey = `id_${playerOrIdOrName.trim()}`;
    } else {
      nameKey = `name_${playerOrIdOrName.toLowerCase().trim()}`;
    }
  }

  if (idKey && sessionPlayerColorMap.has(idKey)) return sessionPlayerColorMap.get(idKey);
  if (nameKey && sessionPlayerColorMap.has(nameKey)) return sessionPlayerColorMap.get(nameKey);

  // Dynamic fallback for any unmapped player
  const nextIdx = sessionPlayerColorMap.size;
  const hue = (sessionBaseHue + (nextIdx * 137.507764)) % 360;
  const { h, s, l } = getTunedHsl(hue);
  const color = hslToHex(h, s, l);

  if (idKey) sessionPlayerColorMap.set(idKey, color);
  if (nameKey) sessionPlayerColorMap.set(nameKey, color);

  return color;
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(56, 189, 248, ${alpha})`;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(56, 189, 248, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenHex(hex, factor = 0.45) {
  if (!hex || typeof hex !== 'string') return '#0f172a';
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return '#0f172a';
  const r = Math.round(((num >> 16) & 255) * factor);
  const g = Math.round(((num >> 8) & 255) * factor);
  const b = Math.round((num & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function getPlayerColorShades(playerOrIdOrName) {
  const primary = getPlayerColor(playerOrIdOrName);
  return {
    primary,
    border: hexToRgba(primary, 0.45),
    glow: hexToRgba(primary, 0.25),
    subtleGlow: hexToRgba(primary, 0.15),
    bgSubtle: hexToRgba(primary, 0.08),
    bgCardTop: hexToRgba(primary, 0.18),
    badgeBg: `radial-gradient(circle at 35% 35%, ${hexToRgba(primary, 0.35)} 0%, ${hexToRgba(primary, 0.08)} 100%)`,
    badgeBorder: hexToRgba(primary, 0.55),
    chipBg: hexToRgba(primary, 0.14),
    chipBorder: hexToRgba(primary, 0.35),
    textGradient: `linear-gradient(135deg, var(--text-main) 25%, ${primary} 100%)`
  };
}

function isMatchFinished(fixture) {
  if (!fixture) return false;
  return Boolean(fixture.finished === true || fixture.finished_provisional === true);
}

function isMatchOngoing(fixture) {
  if (!fixture) return false;
  if (isMatchFinished(fixture)) return false;
  if (fixture.started === true) return true;
  if (fixture.kickoff_time && new Date() >= new Date(fixture.kickoff_time)) return true;
  return false;
}

function getMatchScoreInfo(fixture) {
  if (!fixture) return { home: null, away: null, hasScore: false, isLive: false, isFinished: false };
  if (isMatchFinished(fixture)) {
    const h = fixture.actual_home_score !== null && fixture.actual_home_score !== undefined ? Number(fixture.actual_home_score) : null;
    const a = fixture.actual_away_score !== null && fixture.actual_away_score !== undefined ? Number(fixture.actual_away_score) : null;
    return {
      home: h,
      away: a,
      hasScore: h !== null && a !== null,
      isLive: false,
      isFinished: true
    };
  }
  if (isMatchOngoing(fixture)) {
    const h = (fixture.actual_home_score !== null && fixture.actual_home_score !== undefined) ? Number(fixture.actual_home_score) : 0;
    const a = (fixture.actual_away_score !== null && fixture.actual_away_score !== undefined) ? Number(fixture.actual_away_score) : 0;
    return {
      home: h,
      away: a,
      hasScore: true,
      isLive: true,
      isFinished: false
    };
  }
  return {
    home: null,
    away: null,
    hasScore: false,
    isLive: false,
    isFinished: false
  };
}

function isLocked(fixture) {
  if (!fixture) return false;
  if (fixture.started === true || fixture.finished === true || fixture.finished_provisional === true) return true;
  return new Date() >= new Date(fixture.kickoff_time);
}

function isPlayerEditable(playerId) {
  if (state.auth.role === 'admin') return true;
  if (state.auth.role === 'player' && state.auth.activePlayerId === Number(playerId)) return true;
  return false;
}

function formatKO(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const tz = state.timezone || 'UTC';
  try {
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    let tzName = '';
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
      const p = parts.find(x => x.type === 'timeZoneName');
      if (p) tzName = ' ' + p.value;
    } catch (e) {
      tzName = ' ' + (tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace('_', ' '));
    }
    return `${datePart} ${timePart}${tzName}`;
  } catch (e) {
    return d.toUTCString().slice(0, 22);
  }
}

function startClock() {
  const el = document.getElementById('utcClock');
  if (!el) return;
  function tick() {
    const now = new Date();
    const tz = state.timezone || 'UTC';
    try {
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz });
      let tzName = '';
      try {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(now);
        const p = parts.find(x => x.type === 'timeZoneName');
        if (p) tzName = ' ' + p.value;
      } catch (e) {
        tzName = ' ' + (tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace('_', ' '));
      }
      el.textContent = `${timeStr}${tzName}`;
    } catch (e) {
      el.textContent = now.toUTCString().split(' ').slice(4, 5)[0] + ' UTC';
    }
  }
  tick();
  setInterval(tick, 1000);
}

// Helper: parse group team filter into an array or null (for 'ALL')
function getGroupTeamsFilter(group) {
  if (!group || !group.teams_filter || group.teams_filter === 'ALL') return null;
  try {
    const parsed = typeof group.teams_filter === 'string' ? JSON.parse(group.teams_filter) : group.teams_filter;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (e) {
    return null;
  }
}

// Helper: check if team matches any team in list (handles aliases like Man Utd vs Man United)
function isTeamInList(teamName, list) {
  if (!teamName || !Array.isArray(list)) return false;
  const targetNorm = normalizeTeamName(teamName);
  return list.some(item => normalizeTeamName(item) === targetNorm);
}

// Helper: filter fixtures according to active group's teams_filter
function filterFixturesByGroup(fixtureList, group = state.activeGroup) {
  const groupFilter = getGroupTeamsFilter(group);
  if (!groupFilter) return fixtureList;
  return fixtureList.filter(f => isTeamInList(f.home_name, groupFilter) || isTeamInList(f.away_name, groupFilter));
}

// Helper: filter fixtures according to active group's teams_filter AND active team filter (selectedTeams)
function filterFixturesByGroupAndTeam(fixtureList) {
  let fixtures = filterFixturesByGroup(fixtureList);
  const selectedTeams = getSelectedTeams();
  if (selectedTeams.length > 0) {
    fixtures = fixtures.filter(f => selectedTeams.includes(f.home_name) || selectedTeams.includes(f.away_name));
  }
  return fixtures;
}

// Helper: check if a team is within active group's scope
function isTeamInGroupScope(teamName, group = state.activeGroup) {
  if (!teamName || teamName === 'ALL') return true;
  const groupFilter = getGroupTeamsFilter(group);
  if (!groupFilter) return true; // 'ALL' scope: all teams are in scope
  return isTeamInList(teamName, groupFilter);
}

// Helper: check if a fixture is within active group's scope
function isFixtureInGroupScope(fixture, group = state.activeGroup) {
  if (!fixture) return true;
  const groupFilter = getGroupTeamsFilter(group);
  if (!groupFilter) return true; // 'ALL' scope: all fixtures are in scope
  return isTeamInList(fixture.home_name, groupFilter) || isTeamInList(fixture.away_name, groupFilter);
}

// Helper: check if all in-scope fixtures for a group in a Gameweek are finished
function isGWFinishedForGroup(gw, group = state.activeGroup) {
  const gwNum = Number(gw);
  if (!state.fixtures || !state.fixtures[gwNum]) return false;
  const rawGwFixtures = state.fixtures[gwNum] || [];
  const scopedFixtures = filterFixturesByGroup(rawGwFixtures, group);
  if (scopedFixtures.length === 0) return false;
  return scopedFixtures.every(f => isMatchFinished(f));
}

// Helper: determine auto active GW (advances 48h before next kickoff if current GW in-scope games are finished)
function getAutoActiveGW(group = state.activeGroup) {
  if (!state.gwNumbers || state.gwNumbers.length === 0) return null;
  const now = Date.now();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  let chosenGW = state.gwNumbers[0];

  for (let i = 0; i < state.gwNumbers.length; i++) {
    const currentGW = state.gwNumbers[i];
    const isFinished = isGWFinishedForGroup(currentGW, group);

    if (!isFinished) {
      return currentGW;
    }

    if (i < state.gwNumbers.length - 1) {
      const nextGW = state.gwNumbers[i + 1];
      const rawNextFixtures = state.fixtures[nextGW] || [];
      const scopedNextFixtures = filterFixturesByGroup(rawNextFixtures, group);
      const listNext = scopedNextFixtures.length > 0 ? scopedNextFixtures : rawNextFixtures;

      let earliestNextKickoff = null;
      for (const f of listNext) {
        if (f.kickoff_time) {
          const kt = new Date(f.kickoff_time).getTime();
          if (!isNaN(kt)) {
            if (earliestNextKickoff === null || kt < earliestNextKickoff) {
              earliestNextKickoff = kt;
            }
          }
        }
      }

      if (earliestNextKickoff !== null) {
        if (now >= earliestNextKickoff - FORTY_EIGHT_HOURS_MS) {
          chosenGW = nextGW;
        } else {
          return currentGW;
        }
      } else {
        return currentGW;
      }
    } else {
      return currentGW;
    }
  }

  return chosenGW;
}

function checkAutoGWTransition() {
  if (!state.gwNumbers || state.gwNumbers.length === 0) return;
  const autoGW = getAutoActiveGW();
  const currentNum = Number(state.activeGW);
  if (autoGW && autoGW !== currentNum) {
    if (!state.activeGW || (isGWFinishedForGroup(currentNum) && autoGW > currentNum)) {
      state.activeGW = autoGW;
      localStorage.setItem('epl_active_gw', autoGW);
      renderGWTabs();
    }
  }
}


// ─── AUTHENTICATION STATE & MODALS ───────────────────────────────────────────
async function initAuth() {
  const verified = await apiVerifyAuth();
  if (verified.timezone) {
    state.timezone = verified.timezone;
    localStorage.setItem('epl_timezone', verified.timezone);
    const tzSelect = document.getElementById('timezoneSelect');
    if (tzSelect) tzSelect.value = verified.timezone;
  }
  if (verified.role === 'admin') {
    state.auth = {
      role: 'admin',
      activePlayerId: verified.playerId || null,
      activePlayerName: verified.name || 'Admin',
      token: getAuthToken()
    };
  } else if (verified.role === 'player') {
    state.auth = {
      role: 'player',
      activePlayerId: verified.playerId,
      activePlayerName: verified.name,
      token: getAuthToken()
    };
  } else {
    state.auth = { role: 'guest', activePlayerId: null, activePlayerName: '', token: null };
  }
  renderAuthHeader();
  initAuthModalEvents();
  initAdminPlayerEvents();
}

function renderAuthHeader() {
  const badge = document.getElementById('authStatusBadge');
  const loginBtn = document.getElementById('authLoginBtn');
  const logoutBtn = document.getElementById('authLogoutBtn');
  const guestBanner = document.getElementById('guestNoticeBanner');
  const mgmtBtn = document.getElementById('navManagementBtn');
  const groupBox = document.getElementById('groupSelectBox');
  const adminPlayerBox = document.getElementById('adminPlayerBox');
  if (!badge || !loginBtn || !logoutBtn) return;

  if (state.auth.role === 'admin') {
    badge.className = 'auth-status-badge admin';
    const playingText = state.auth.activePlayerId ? ` • 👤 ${state.auth.activePlayerName}` : '';
    badge.textContent = `👑 Admin${playingText}`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    if (guestBanner) guestBanner.style.display = 'none';
    if (mgmtBtn) mgmtBtn.style.display = 'inline-flex';
    if (groupBox) groupBox.style.display = 'block';
    if (adminPlayerBox) {
      adminPlayerBox.style.display = 'block';
      populateAdminPlayerDropdown();
    }
  } else if (state.auth.role === 'player') {
    badge.className = 'auth-status-badge player';
    badge.textContent = `👤 Logged in: ${state.auth.activePlayerName}`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    if (guestBanner) guestBanner.style.display = 'none';
    if (mgmtBtn) mgmtBtn.style.display = 'none';
    if (groupBox) groupBox.style.display = 'block';
    if (adminPlayerBox) adminPlayerBox.style.display = 'none';
  } else {
    badge.className = 'auth-status-badge';
    badge.textContent = '👤 Guest (View Only)';
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
    if (guestBanner && state.activeView === 'dashboard') guestBanner.style.display = 'flex';
    if (mgmtBtn) mgmtBtn.style.display = 'none';
    if (groupBox) groupBox.style.display = 'none';
    if (adminPlayerBox) adminPlayerBox.style.display = 'none';
  }
}

function populateAdminPlayerDropdown() {
  const select = document.getElementById('adminPlayerSelect');
  if (!select) return;

  const playersList = state.masterPlayers.length > 0 ? state.masterPlayers : state.players;
  const currentId = state.auth.activePlayerId;

  let options = `<option value="" ${!currentId ? 'selected' : ''}>👑 Playing as: None (Admin Only)</option>`;
  options += playersList.map(p =>
    `<option value="${p.id}" ${currentId === p.id ? 'selected' : ''}>⚽ Playing as: ${p.name}</option>`
  ).join('');

  select.innerHTML = options;
}

function initAdminPlayerEvents() {
  const select = document.getElementById('adminPlayerSelect');
  if (!select) return;

  select.addEventListener('change', async (e) => {
    const val = e.target.value;
    const pId = val ? parseInt(val, 10) : null;
    const player = pId ? state.masterPlayers.find(p => p.id === pId) : null;

    try {
      await apiAdminSetPlayer(pId);
      state.auth.activePlayerId = pId;
      state.auth.activePlayerName = player ? player.name : 'Admin';
      renderAuthHeader();
      renderDashboardComponents();
    } catch (err) {
      alert(err.message);
    }
  });
}

function initAuthModalEvents() {
  const choiceModal = document.getElementById('authChoiceModal');
  const playerModal = document.getElementById('playerLoginModal');
  const adminModal = document.getElementById('adminLoginModal');

  const loginBtn = document.getElementById('authLoginBtn');
  const logoutBtn = document.getElementById('authLogoutBtn');
  const bannerLoginBtn = document.getElementById('bannerLoginBtn');

  const closeChoice = document.getElementById('closeChoiceModalBtn');
  const closePlayer = document.getElementById('closePlayerModalBtn');
  const closeAdmin = document.getElementById('closeAdminModalBtn');

  const choosePlayerBtn = document.getElementById('choosePlayerLoginBtn');
  const chooseAdminBtn = document.getElementById('chooseAdminLoginBtn');

  const playerForm = document.getElementById('playerLoginForm');
  const adminForm = document.getElementById('adminLoginForm');

  const openChoiceModal = () => {
    choiceModal.style.display = 'flex';
  };

  loginBtn?.addEventListener('click', openChoiceModal);
  bannerLoginBtn?.addEventListener('click', openChoiceModal);

  logoutBtn?.addEventListener('click', async () => {
    await apiLogout();
    stopLivePollingAndRevertToStandard();
    state.auth = { role: 'guest', activePlayerId: null, activePlayerName: '', token: null };
    renderAuthHeader();
    await reloadMasterData();
    renderDashboardComponents();
    if (state.activeView === 'management') {
      state.activeView = 'dashboard';
      renderViewByName('dashboard');
    }
  });

  closeChoice?.addEventListener('click', () => choiceModal.style.display = 'none');
  closePlayer?.addEventListener('click', () => playerModal.style.display = 'none');
  closeAdmin?.addEventListener('click', () => adminModal.style.display = 'none');

  [choiceModal, playerModal, adminModal].forEach(modal => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });

  choosePlayerBtn?.addEventListener('click', () => {
    choiceModal.style.display = 'none';
    playerModal.style.display = 'flex';
    const nameInput = document.getElementById('loginPlayerNameInput');
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    document.getElementById('loginPasscodeInput').value = '';
    document.getElementById('playerLoginError').style.display = 'none';
  });

  chooseAdminBtn?.addEventListener('click', () => {
    choiceModal.style.display = 'none';
    adminModal.style.display = 'flex';
    document.getElementById('adminPasswordInput').value = '';
    const adminPlayerInput = document.getElementById('adminPlayerNameInput');
    if (adminPlayerInput) adminPlayerInput.value = '';
    document.getElementById('adminLoginError').style.display = 'none';
  });

  playerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pName = document.getElementById('loginPlayerNameInput')?.value.trim();
    const code = document.getElementById('loginPasscodeInput')?.value.trim();
    const errDiv = document.getElementById('playerLoginError');

    try {
      const res = await apiPlayerLogin(pName, code, state.timezone);
      state.auth = { role: 'player', activePlayerId: res.player.id, activePlayerName: res.player.name, token: res.token };
      if (res.timezone) {
        state.timezone = res.timezone;
        localStorage.setItem('epl_timezone', res.timezone);
        const tzSelect = document.getElementById('timezoneSelect');
        if (tzSelect) tzSelect.value = res.timezone;
      }
      playerModal.style.display = 'none';
      renderAuthHeader();
      await reloadMasterData();
      if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
      populateGroupDropdown();
      renderDashboardComponents();
    } catch (err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
    }
  });

  adminForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('adminPasswordInput').value;
    const pName = document.getElementById('adminPlayerNameInput')?.value.trim() || '';
    const errDiv = document.getElementById('adminLoginError');

    try {
      const res = await apiAdminLogin(pwd, pName, state.timezone);
      state.auth = {
        role: 'admin',
        activePlayerId: res.player ? res.player.id : null,
        activePlayerName: res.player ? res.player.name : 'Admin',
        token: res.token
      };
      if (res.timezone) {
        state.timezone = res.timezone;
        localStorage.setItem('epl_timezone', res.timezone);
        const tzSelect = document.getElementById('timezoneSelect');
        if (tzSelect) tzSelect.value = res.timezone;
      }
      adminModal.style.display = 'none';
      renderAuthHeader();
      await reloadMasterData();
      if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
      populateGroupDropdown();
      renderDashboardComponents();
      if (state.pendingAdminTargetView) {
        renderViewByName(state.pendingAdminTargetView);
        state.pendingAdminTargetView = null;
      }
    } catch (err) {
      errDiv.textContent = err.message;
      errDiv.style.display = 'block';
    }
  });
}

// ─── Timezone Selector ────────────────────────────────────────────────────────
function initTimezoneSelector() {
  const select = document.getElementById('timezoneSelect');
  if (!select) return;

  if (!localStorage.getItem('epl_timezone')) {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const match = Array.from(select.options).some(o => o.value === browserTz);
      if (match) {
        state.timezone = browserTz;
        localStorage.setItem('epl_timezone', browserTz);
      }
    } catch (e) { }
  }

  select.value = state.timezone;

  select.addEventListener('change', async (e) => {
    state.timezone = e.target.value;
    localStorage.setItem('epl_timezone', state.timezone);
    if (state.auth && state.auth.token) {
      await apiSaveTimezone(state.timezone);
    }
    renderMatrix();
    renderTeamBreakdown();
  });
}

// ─── Theme Switcher (Clean 2/3 Tone Dark Themes) ─────────────────────────────
function initThemeSelector() {
  const select = document.getElementById('themeSelect');
  if (!select) return;

  const savedTheme = localStorage.getItem('epl_theme_2tone') || 'midnight';
  select.value = savedTheme;
  applyTheme(savedTheme);

  select.addEventListener('change', (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    localStorage.setItem('epl_theme_2tone', theme);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof renderCumulativeChart === 'function') {
    renderCumulativeChart();
  }
}

// ─── Leaderboard Calculation ──────────────────────────────────────────────────
function calcLeaderboard() {
  const results = state.players.map((p) => {
    const row = {
      id: p.id,
      name: p.name,
      color: getPlayerColor(p),
      total: 0,
      bullseyes: 0,
      correctOutcomes: 0,
      gwPts: {},
    };
    for (const t of SCORING_TIERS) {
      row[`t${t.tier}`] = 0;
    }
    return row;
  });

  for (const [gw, rawFixtures] of Object.entries(state.fixtures)) {
    const fixtures = filterFixturesByGroupAndTeam(rawFixtures);
    for (const f of fixtures) {
      const scoreInfo = getMatchScoreInfo(f);
      if (!scoreInfo.hasScore) continue;
      for (const r of results) {
        const pred = state.predictions[`${f.id}_${r.id}`];
        if (!pred || pred.predicted_home === null || pred.predicted_away === null || pred.predicted_home === undefined || pred.predicted_home === '' || pred.predicted_away === '') continue;
        const res = evaluatePrediction(
          scoreInfo.home, scoreInfo.away,
          Number(pred.predicted_home), Number(pred.predicted_away)
        );
        if (!res) continue;
        r.total += res.total;
        r.gwPts[gw] = (r.gwPts[gw] ?? 0) + res.total;
        if (res.isExactScore) r.bullseyes++;
        if (res.isCorrectOutcome) r.correctOutcomes++;

        if (res.tier) {
          r[`t${res.tier}`] = (r[`t${res.tier}`] || 0) + 1;
        }
      }
    }
  }

  results.sort((a, b) => b.total - a.total || (b.t1 || 0) - (a.t1 || 0) || (b.t2 || 0) - (a.t2 || 0) || (b.t3 || 0) - (a.t3 || 0));
  results.forEach((r, i) => r.rank = i + 1);
  return results;
}

// ─── Data Loading Helpers ─────────────────────────────────────────────────────
async function reloadMasterData() {
  const [groups, masterPlayers] = await Promise.all([
    apiFetchGroups(),
    apiFetchMasterPlayers()
  ]);
  state.groups = groups;
  state.masterPlayers = masterPlayers;

  if (state.auth.role === 'admin') {
    populateAdminPlayerDropdown();
  }

  const savedGroupId = parseInt(localStorage.getItem('epl_active_group_id'), 10);
  if (savedGroupId && groups.some(g => g.id === savedGroupId)) {
    state.activeGroup = groups.find(g => g.id === savedGroupId);
  } else if (!state.activeGroup && groups.length > 0) {
    state.activeGroup = groups[0];
  } else if (state.activeGroup) {
    const existing = groups.find(g => g.id === state.activeGroup.id);
    state.activeGroup = existing || groups[0] || null;
  }
}

async function loadActiveGroupData(groupId) {
  if (!groupId) {
    state.players = [];
    state.predictions = {};
    return;
  }

  try {
    const players = await apiFetchGroupPlayers(groupId);
    state.players = players;
    recalculateGroupPlayerColors(state.players);

    const rawPreds = await apiFetchPredictions(groupId);
    const predDict = {};
    for (const p of rawPreds) {
      predDict[`${p.match_id}_${p.player_id}`] = {
        predicted_home: p.home_score,
        predicted_away: p.away_score,
      };
    }
    state.predictions = predDict;

  } catch (err) {
    console.error('Error loading active group data:', err);
  }
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

function renderModeIndicator() {
  const indicatorEl = document.getElementById('fplModeIndicator');
  if (!indicatorEl) return;

  const meta = getFplCacheMeta();
  const isLive = meta.state === 'LIVE';
  const timeAgo = formatTimeAgo(meta.updatedAt);

  indicatorEl.className = `fpl-mode-indicator ${isLive ? 'live' : 'standard'}`;
  indicatorEl.innerHTML = `
    <span class="mode-pill">
      <span class="mode-dot"></span>
      <span class="mode-title">${isLive ? 'Live Mode' : 'Standard Mode'}</span>
      <span class="mode-badge-sub">${isLive ? '5m sync' : 'Kickoff trigger'}</span>
    </span>
    <span class="mode-divider">•</span>
    <span class="mode-sync-text">Synced ${timeAgo}</span>
  `;
}

let livePollInterval = null;
let kickoffCheckTimer = null;
let kickoffEventsInitialized = false;
let lastActivityTimestamp = Date.now();
const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

function isUserSessionActive() {
  return state.auth && (state.auth.role === 'player' || state.auth.role === 'admin');
}

function registerUserActivity() {
  lastActivityTimestamp = Date.now();
}

function stopLivePollingAndRevertToStandard() {
  if (livePollInterval) {
    clearInterval(livePollInterval);
    livePollInterval = null;
  }
  resetFplCacheMetaToNormal();
  renderModeIndicator();
}

async function syncFixturesData() {
  try {
    const { gwNumbers, byGW, teams } = await fetchFixtures();
    state.gwNumbers = gwNumbers;
    state.fixtures = byGW;
    state.teams = teams;
    renderDashboardComponents();
  } catch (e) {
    console.warn('Fixtures sync notice:', e.message);
  }
}

function checkAndTriggerLivePolling() {
  // If user is guest or logged out, stop live polling & revert to standard mode!
  if (!isUserSessionActive()) {
    stopLivePollingAndRevertToStandard();
    return;
  }

  // If user has been inactive for > 10 minutes, revert to standard mode
  if (Date.now() - lastActivityTimestamp > INACTIVITY_LIMIT_MS) {
    stopLivePollingAndRevertToStandard();
    return;
  }

  const meta = getFplCacheMeta();
  if (meta.state === 'LIVE') {
    if (!livePollInterval) {
      livePollInterval = setInterval(async () => {
        const isInactive = Date.now() - lastActivityTimestamp > INACTIVITY_LIMIT_MS;
        if (!document.hidden && isUserSessionActive() && !isInactive) {
          await syncFixturesData();
        } else {
          stopLivePollingAndRevertToStandard();
        }
      }, 5 * 60 * 1000);
    }
  } else {
    if (livePollInterval) {
      clearInterval(livePollInterval);
      livePollInterval = null;
    }
  }
  scheduleNextKickoffCheck();
}

function scheduleNextKickoffCheck() {
  if (kickoffCheckTimer) {
    clearTimeout(kickoffCheckTimer);
    kickoffCheckTimer = null;
  }

  const meta = getFplCacheMeta();
  if (meta.state === 'LIVE') return; // Live polling handles active matches
  if (!isUserSessionActive()) return; // Only active player/admin sessions schedule kickoff triggers

  const now = Date.now();
  let nextKickoffMs = null;

  if (state.fixtures) {
    for (const gwFixtures of Object.values(state.fixtures)) {
      for (const f of gwFixtures) {
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
    }
  }

  if (nextKickoffMs !== null) {
    const delay = Math.max(1000, nextKickoffMs - now + 2000); // 2s after kickoff
    kickoffCheckTimer = setTimeout(async () => {
      if (isUserSessionActive() && (Date.now() - lastActivityTimestamp <= INACTIVITY_LIMIT_MS)) {
        console.log('⏰ Kickoff trigger reached! Checking FPL for Live Mode...');
        await syncFixturesData();
      }
    }, delay);
  }
}

function initKickoffAndVisibilityEvents() {
  if (kickoffEventsInitialized) return;
  kickoffEventsInitialized = true;

  // Listen for user interaction events to track session activity
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, registerUserActivity, { passive: true });
  });

  // Periodically check for 10-minute session inactivity
  setInterval(() => {
    if (isUserSessionActive() && (Date.now() - lastActivityTimestamp > INACTIVITY_LIMIT_MS)) {
      console.log('⌛ 10 minutes of inactivity reached. Reverting live polling to Standard Mode.');
      stopLivePollingAndRevertToStandard();
    }
    renderModeIndicator();
  }, 30000);

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      registerUserActivity();
      if (!isUserSessionActive()) {
        stopLivePollingAndRevertToStandard();
        return;
      }

      const meta = getFplCacheMeta();
      const now = Date.now();

      if (meta.state === 'LIVE' && (now - meta.updatedAt) >= 5 * 60 * 1000) {
        await syncFixturesData();
      } else if (meta.state !== 'LIVE') {
        let passedKickoff = false;
        if (state.fixtures) {
          for (const gwFixtures of Object.values(state.fixtures)) {
            for (const f of gwFixtures) {
              if (f.finished || f.finished_provisional) continue;
              if (f.kickoff_time) {
                const kickoff = new Date(f.kickoff_time).getTime();
                if (!isNaN(kickoff) && kickoff <= now && meta.updatedAt < kickoff) {
                  passedKickoff = true;
                  break;
                }
              }
            }
            if (passedKickoff) break;
          }
        }
        if (passedKickoff) {
          await syncFixturesData();
        }
      }
    }
  });
}

function renderDashboardComponents() {
  checkAutoGWTransition();
  renderMatrix();
  renderLeaderboard();
  renderSnapshot(calcLeaderboard());
  renderTeamBreakdown();
  renderCumulativeChart();
  renderModeIndicator();
  checkAndTriggerLivePolling();
}

// ─── View Navigation (SPA) ────────────────────────────────────────────────────
function renderViewByName(targetView) {
  if (targetView === 'management' && state.auth.role !== 'admin') {
    targetView = 'dashboard';
  }
  state.activeView = targetView;
  const dashBtn = document.getElementById('navDashboardBtn');
  const scoringBtn = document.getElementById('navScoringBtn');
  const mgmtBtn = document.getElementById('navManagementBtn');

  const dashView = document.getElementById('dashboardView');
  const scoringView = document.getElementById('scoringView');
  const mgmtView = document.getElementById('managementView');

  [dashBtn, scoringBtn, mgmtBtn].forEach(btn => btn?.classList.remove('active'));
  [dashView, scoringView, mgmtView].forEach(v => { if (v) v.style.display = 'none'; });

  renderAuthHeader();

  if (targetView === 'dashboard') {
    dashBtn?.classList.add('active');
    if (dashView) dashView.style.display = 'block';
    renderDashboardComponents();
  } else if (targetView === 'scoring') {
    scoringBtn?.classList.add('active');
    if (scoringView) scoringView.style.display = 'block';
    renderScoringViewSummary();
  } else if (targetView === 'management') {
    mgmtBtn?.classList.add('active');
    if (mgmtView) mgmtView.style.display = 'block';
    renderManagementPage();
  }
}

function initNavigation() {
  const dashBtn = document.getElementById('navDashboardBtn');
  const scoringBtn = document.getElementById('navScoringBtn');
  const mgmtBtn = document.getElementById('navManagementBtn');

  dashBtn?.addEventListener('click', () => renderViewByName('dashboard'));
  scoringBtn?.addEventListener('click', () => renderViewByName('scoring'));
  mgmtBtn?.addEventListener('click', () => {
    if (state.auth.role !== 'admin') {
      renderViewByName('dashboard');
      return;
    }
    renderViewByName('management');
  });
}

// ─── Group Dropdown ──────────────────────────────────────────────────────────
function populateGroupDropdown() {
  const select = document.getElementById('groupSelect');
  if (!select) return;

  select.innerHTML = state.groups.map(g => {
    return `<option value="${g.id}" ${state.activeGroup && state.activeGroup.id === g.id ? 'selected' : ''}>${g.name}</option>`;
  }).join('');
}

function initGroupEvents() {
  const select = document.getElementById('groupSelect');
  if (!select) return;

  select.addEventListener('change', async (e) => {
    const groupId = parseInt(e.target.value, 10);
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    state.activeGroup = group;
    localStorage.setItem('epl_active_group_id', groupId);
    await loadActiveGroupData(groupId);

    const autoGW = getAutoActiveGW(group);
    if (autoGW) {
      state.activeGW = autoGW;
      localStorage.setItem('epl_active_gw', autoGW);
    }

    renderGWTabs();
    renderDashboardComponents();
  });
}

// ─── Team Filter Multi-Select ────────────────────────────────────────────────
function getSelectedTeams() {
  return state.selectedTeams || [];
}

function hasActiveTeamFilter() {
  return Array.isArray(state.selectedTeams) && state.selectedTeams.length > 0;
}

function setSelectedTeams(teams) {
  const teamList = Object.values(state.teams).map(t => t.name);
  const validTeams = (Array.isArray(teams) ? teams : []).filter(t => teamList.includes(t));
  state.selectedTeams = validTeams;
  state.selectedTeam = validTeams.length === 1 ? validTeams[0] : (validTeams.length > 1 ? validTeams.join(', ') : 'ALL');
  localStorage.setItem('epl_selected_teams', JSON.stringify(state.selectedTeams));
  localStorage.setItem('epl_selected_team', state.selectedTeam);
  updateTeamMultiSelectUI();
  renderDashboardComponents();
}

function toggleTeamFilter(teamName) {
  const current = getSelectedTeams();
  let updated = [];
  if (current.includes(teamName)) {
    updated = current.filter(t => t !== teamName);
  } else {
    updated = [...current, teamName];
  }
  setSelectedTeams(updated);
}

function clearTeamFilter() {
  setSelectedTeams([]);
}

function populateTeamFilter() {
  const teamList = Object.values(state.teams).sort((a, b) => a.name.localeCompare(b.name));
  const dropdownList = document.getElementById('teamDropdownList');
  if (!dropdownList) return;

  // Initialize saved selected teams
  const savedTeamsJson = localStorage.getItem('epl_selected_teams');
  const savedSingle = localStorage.getItem('epl_selected_team');
  if (savedTeamsJson) {
    try {
      const parsed = JSON.parse(savedTeamsJson);
      if (Array.isArray(parsed)) {
        state.selectedTeams = parsed.filter(t => teamList.some(tm => tm.name === t));
      }
    } catch (e) {
      state.selectedTeams = [];
    }
  } else if (savedSingle && savedSingle !== 'ALL' && teamList.some(tm => tm.name === savedSingle)) {
    state.selectedTeams = [savedSingle];
  } else {
    state.selectedTeams = [];
  }
  state.selectedTeam = state.selectedTeams.length === 1 ? state.selectedTeams[0] : (state.selectedTeams.length > 1 ? state.selectedTeams.join(', ') : 'ALL');

  // Populate dropdown items
  dropdownList.innerHTML = teamList.map(t => {
    const isSelected = state.selectedTeams.includes(t.name);
    const isInScope = isTeamInGroupScope(t.name);
    const scopeTag = !isInScope ? '<span class="team-option-scope-tag" title="Outside active group scope">Out of Scope</span>' : '';
    const details = getClubDetails(t.name) || t;
    const short = details.short || details.shortName || t.short || t.name.slice(0, 3).toUpperCase();
    const venueSub = details.stadium ? `<span class="team-option-venue-sub" title="Stadium: ${details.stadium}, ${details.city}">🏟️ ${details.stadium}${details.city ? ` · 📍 ${details.city}` : ''}</span>` : '';
    return `
      <div class="team-option-item ${isSelected ? 'selected' : ''}" data-team="${t.name}" role="option" aria-selected="${isSelected}" title="${t.name} (${short}) · 🏟️ ${details.stadium || 'Stadium'}, ${details.city || 'City'}">
        <div class="team-option-row">
          <span class="team-option-checkbox-custom"></span>
          <span class="team-option-crest">${getCrestImg(t.code, t.name)}</span>
          <div class="team-option-text-group">
            <span class="team-option-name" style="font-weight:700; font-family:var(--font-title);">${short}</span>
            ${venueSub}
          </div>
          ${scopeTag}
          <button type="button" class="team-option-only-btn" data-only-team="${t.name}" title="Filter only ${short}">Only</button>
        </div>
      </div>
    `;
  }).join('');

  updateTeamMultiSelectUI();
  initTeamMultiSelectEvents(teamList);
}

function updateTeamMultiSelectUI() {
  const displayEl = document.getElementById('teamMultiSelectDisplay');
  const countSummary = document.getElementById('teamFilterCountSummary');
  const scopeBtn = document.getElementById('teamSelectScopeBtn');
  const btn = document.getElementById('teamMultiSelectBtn');
  if (!displayEl) return;

  const count = state.selectedTeams.length;
  const groupFilter = getGroupTeamsFilter(state.activeGroup);

  if (scopeBtn) {
    scopeBtn.style.display = groupFilter ? 'inline-block' : 'none';
  }

  if (count === 0) {
    displayEl.innerHTML = `
      <span class="team-filter-all-icon">⚽</span>
      <span class="team-filter-text">All Teams (20)</span>
    `;
    btn?.classList.remove('active');
  } else if (count === 1) {
    const team = state.selectedTeams[0];
    const teamObj = Object.values(state.teams).find(t => t.name === team);
    const code = teamObj?.code;
    const details = getClubDetails(team) || teamObj;
    const short = details?.short || details?.shortName || teamObj?.short || team.slice(0, 3).toUpperCase();
    displayEl.innerHTML = `
      <span class="team-option-crest" style="width:20px;height:20px;">${getCrestImg(code, team)}</span>
      <span class="team-filter-text" style="font-weight:700; color:var(--text-main);" title="${team} (${short})">
        ${short}
      </span>
      <span class="team-filter-pill-remove" data-remove-team="${team}" title="Clear ${team}">✕</span>
    `;
    btn?.classList.add('active');
  } else if (count <= 3) {
    displayEl.innerHTML = state.selectedTeams.map(team => {
      const teamObj = Object.values(state.teams).find(t => t.name === team);
      const code = teamObj?.code;
      const details = getClubDetails(team) || teamObj;
      const short = details?.short || details?.shortName || teamObj?.short || team.slice(0, 3).toUpperCase();
      return `
        <span class="team-filter-pill" title="${team}">
          <span class="team-option-crest" style="width:14px;height:14px;">${getCrestImg(code, team)}</span>
          <span>${short}</span>
          <span class="team-filter-pill-remove" data-remove-team="${team}" title="Remove ${team}">✕</span>
        </span>
      `;
    }).join('');
    btn?.classList.add('active');
  } else {
    displayEl.innerHTML = `
      <span class="team-filter-count-badge">${count} Teams</span>
      <span class="team-filter-text">Selected</span>
      <span class="team-filter-pill-remove" data-clear-all="true" title="Clear all">✕</span>
    `;
    btn?.classList.add('active');
  }

  // Update dropdown options
  document.querySelectorAll('.team-option-item').forEach(item => {
    const teamName = item.dataset.team;
    const isSelected = state.selectedTeams.includes(teamName);
    if (isSelected) {
      item.classList.add('selected');
      item.setAttribute('aria-selected', 'true');
    } else {
      item.classList.remove('selected');
      item.setAttribute('aria-selected', 'false');
    }
  });

  if (countSummary) {
    countSummary.textContent = count === 0 ? 'All 20 teams shown' : `${count} of 20 teams selected`;
  }
}

let teamMultiSelectInitialized = false;

function initTeamMultiSelectEvents(teamList) {
  if (teamMultiSelectInitialized) return;
  teamMultiSelectInitialized = true;

  const container = document.getElementById('teamMultiSelect');
  const btn = document.getElementById('teamMultiSelectBtn');
  const dropdown = document.getElementById('teamMultiSelectDropdown');
  const searchInput = document.getElementById('teamSearchInput');
  const searchClearBtn = document.getElementById('teamSearchClearBtn');
  const selectAllBtn = document.getElementById('teamSelectAllBtn');
  const clearAllBtn = document.getElementById('teamClearAllBtn');
  const selectScopeBtn = document.getElementById('teamSelectScopeBtn');
  const applyBtn = document.getElementById('teamFilterApplyBtn');
  const dropdownList = document.getElementById('teamDropdownList');

  function openDropdown() {
    dropdown.style.display = 'block';
    container.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    searchInput?.focus();
  }

  function closeDropdown() {
    dropdown.style.display = 'none';
    container.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (searchInput) {
      searchInput.value = '';
      filterTeamOptions('');
      if (searchClearBtn) searchClearBtn.style.display = 'none';
    }
  }

  function toggleDropdown() {
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      openDropdown();
    } else {
      closeDropdown();
    }
  }

  btn?.addEventListener('click', (e) => {
    const removeTeam = e.target.closest('[data-remove-team]')?.getAttribute('data-remove-team');
    if (removeTeam) {
      e.stopPropagation();
      toggleTeamFilter(removeTeam);
      return;
    }
    const clearAll = e.target.closest('[data-clear-all]');
    if (clearAll) {
      e.stopPropagation();
      clearTeamFilter();
      return;
    }
    toggleDropdown();
  });

  applyBtn?.addEventListener('click', () => {
    closeDropdown();
  });

  // Search filter
  function filterTeamOptions(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('.team-option-item').forEach(item => {
      const name = item.dataset.team.toLowerCase();
      const short = item.querySelector('.team-option-short')?.textContent.toLowerCase() || '';
      if (!q || name.includes(q) || short.includes(q)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value;
    filterTeamOptions(val);
    if (searchClearBtn) {
      searchClearBtn.style.display = val ? 'inline-block' : 'none';
    }
  });

  searchClearBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      filterTeamOptions('');
      searchClearBtn.style.display = 'none';
      searchInput.focus();
    }
  });

  // Actions
  selectAllBtn?.addEventListener('click', () => {
    const allNames = Object.values(state.teams).map(t => t.name);
    setSelectedTeams(allNames);
  });

  clearAllBtn?.addEventListener('click', () => {
    clearTeamFilter();
  });

  selectScopeBtn?.addEventListener('click', () => {
    const groupFilter = getGroupTeamsFilter(state.activeGroup);
    if (groupFilter) {
      setSelectedTeams(groupFilter);
    }
  });

  // Toggling & selecting options
  dropdownList?.addEventListener('click', (e) => {
    const onlyBtn = e.target.closest('[data-only-team]');
    if (onlyBtn) {
      e.stopPropagation();
      const onlyTeam = onlyBtn.getAttribute('data-only-team');
      if (onlyTeam) {
        setSelectedTeams([onlyTeam]);
      }
      return;
    }

    const item = e.target.closest('.team-option-item');
    if (!item) return;
    const teamName = item.dataset.team;
    if (teamName) {
      toggleTeamFilter(teamName);
    }
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!container?.contains(e.target)) {
      closeDropdown();
    }
  });

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && container?.classList.contains('open')) {
      closeDropdown();
    }
  });

  // Clear Team Filter button in breakdown card
  document.getElementById('clearTeamFilterBtn')?.addEventListener('click', () => {
    clearTeamFilter();
  });
}

// ─── Render: GW Tabs ──────────────────────────────────────────────────────────
function renderGWTabs() {
  const container = document.getElementById('gwTabs');
  if (!container) return;
  container.innerHTML = '';

  const activeNum = Number(state.activeGW);

  const label = document.getElementById('gwCurrentLabel');
  if (label && state.activeGW) {
    label.textContent = `GW ${activeNum} of ${state.gwNumbers.length}`;
  }

  for (const gw of state.gwNumbers) {
    const isFinished = isGWFinishedForGroup(gw);
    const btn = document.createElement('button');
    btn.className = `gw-tab${gw === activeNum ? ' active' : ''}${isFinished ? ' completed' : ''}`;
    btn.innerHTML = isFinished ? `GW ${gw} <span class="gw-tab-check">✓</span>` : `GW ${gw}`;
    btn.id = `gwTab_${gw}`;
    if (isFinished) {
      btn.setAttribute('title', `GW ${gw} (All scoped games finished)`);
    }
    btn.addEventListener('click', () => {
      state.activeGW = gw;
      localStorage.setItem('epl_active_gw', gw);
      renderGWTabs();
      renderMatrix();
    });
    container.appendChild(btn);
    if (gw === activeNum) {
      setTimeout(() => {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 50);
    }
  }
}

function initGWSkipControls() {
  document.getElementById('gwPrevBtn')?.addEventListener('click', () => {
    if (!state.gwNumbers.length || !state.activeGW) return;
    const activeNum = Number(state.activeGW);
    const idx = state.gwNumbers.indexOf(activeNum);
    if (idx > 0) {
      state.activeGW = state.gwNumbers[idx - 1];
      localStorage.setItem('epl_active_gw', state.activeGW);
      renderGWTabs();
      renderMatrix();
    }
  });

  document.getElementById('gwNextBtn')?.addEventListener('click', () => {
    if (!state.gwNumbers.length || !state.activeGW) return;
    const activeNum = Number(state.activeGW);
    const idx = state.gwNumbers.indexOf(activeNum);
    if (idx !== -1 && idx < state.gwNumbers.length - 1) {
      state.activeGW = state.gwNumbers[idx + 1];
      localStorage.setItem('epl_active_gw', state.activeGW);
      renderGWTabs();
      renderMatrix();
    }
  });
}

// ─── Render: Snapshot Leaderboard ────────────────────────────────────────────
function renderSnapshot(lb) {
  const container = document.getElementById('leaderboardSnapshot');
  if (!container) return;

  // Guest view privacy check
  if (state.auth.role === 'guest') {
    container.innerHTML = `
      <div class="glass-card" style="grid-column: 1/-1; text-align:center; padding: 18px; color: var(--text-muted);">
        🔒 <strong>Leaderboard Snapshot Hidden for Guests:</strong> Log in with a 6-character player passcode to view rankings!
      </div>`;
    return;
  }

  if (lb.length === 0) {
    container.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align:center; color:var(--text-muted);">No players in this group yet.</div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = lb.slice(0, 3).map(r => {
    const isYou = state.auth.activePlayerId === r.id;
    const shades = getPlayerColorShades(r);

    const activeTiers = SCORING_TIERS.map(t => {
      const count = r[`t${t.tier}`] || 0;
      return {
        icon: renderIconElement(t.icon, t.icon_type, 14),
        count,
        cls: `t${t.tier}`,
        title: `${t.name} (${t.pts} pts)`
      };
    }).filter(t => t.count > 0);

    const tierChipsHtml = activeTiers.length > 0
      ? `<div class="snapshot-tier-counts">
          ${activeTiers.map(t => `<span class="snapshot-tier-chip active ${t.cls}" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};" title="${t.title}: ${t.count}">${t.icon} <strong style="color:${shades.primary};">${t.count}</strong></span>`).join('')}
        </div>`
      : '';

    return `
      <div class="snapshot-card rank-${r.rank} ${isYou ? 'active-player-card' : ''}" style="border-top: 3px solid ${shades.primary}; background-image: radial-gradient(circle at top right, ${shades.glow}, transparent 65%);">
        <div class="rank-medal-badge rank-${r.rank}" style="background:${shades.badgeBg}; border-color:${shades.badgeBorder}; box-shadow: 0 0 10px ${shades.glow};" title="Rank #${r.rank}">
          <span class="rank-medal-icon">${medals[r.rank - 1] ?? `#${r.rank}`}</span>
        </div>
        <div class="snapshot-info">
          <div class="snapshot-header-row">
            <span class="snapshot-name" style="color: ${shades.primary}; font-weight:700;" title="${r.name}">${r.name}</span>
          </div>
          <div class="snapshot-pts-row">
            <span class="snapshot-pts" style="background:${shades.textGradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${r.total}</span>
            <span class="snapshot-pts-unit">pts</span>
            ${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};">You</span>` : ''}
          </div>
          <div class="snapshot-meta">GW ${state.activeGW ?? '?'}</div>
        </div>
        ${tierChipsHtml}
      </div>
    `;
  }).join('');
}

// ─── Status Logo Renderer ──────────────────────────────────────────────────
function getStatusLogoHtml(f, isGuest = false) {
  const timeLocked = isLocked(f);
  const fixtureInScope = isFixtureInGroupScope(f);
  const isMatchInScope = isGuest || fixtureInScope;
  const koFormatted = formatKO(f.kickoff_time);

  // Check if active player has submitted a score for this match
  const activePlayerId = state.auth?.activePlayerId;
  let hasActivePrediction = false;
  if (activePlayerId) {
    const pred = state.predictions[`${f.id}_${activePlayerId}`];
    hasActivePrediction = pred &&
      pred.predicted_home !== null && pred.predicted_home !== undefined && pred.predicted_home !== '' &&
      pred.predicted_away !== null && pred.predicted_away !== undefined && pred.predicted_away !== '';
  }

  // 1. Grey locked: predictions not allowed because match is outside active group scope
  if (!isMatchInScope) {
    return `<span class="status-logo status-out-of-scope status-grey-locked" title="Locked - Match is outside active group scope (Predictions disabled)" aria-label="Locked: Out of Scope" role="img">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        <line x1="4" y1="4" x2="20" y2="20"></line>
      </svg>
    </span>`;
  }

  // 2. Finished Match (Full Time)
  if (isMatchFinished(f)) {
    return `<span class="status-logo status-finished" title="Full Time / Match Concluded (${koFormatted})" aria-label="Match Concluded" role="img">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    </span>`;
  }

  // 3. Live / Ongoing Match in progress
  if (isMatchOngoing(f)) {
    return `<span class="status-logo status-live" title="Live Match In Progress (${koFormatted})" aria-label="Live Match In Progress" role="img">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon>
      </svg>
    </span>`;
  }

  // 4. Red locked: player missed entering predictions before kickoff
  if (timeLocked) {
    if (!hasActivePrediction && !isGuest && activePlayerId) {
      return `<span class="status-logo status-locked status-red-locked" title="Locked - Missed prediction deadline (${koFormatted})" aria-label="Locked: Missed Deadline" role="img">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </span>`;
    }
    return `<span class="status-logo status-locked status-submitted-locked" title="Closed - Kickoff passed (${koFormatted})" aria-label="Closed: Kickoff passed" role="img">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </span>`;
  }

  // 5. Green unlocked: unlocked and allowed for entry (prediction entered & saved)
  if (hasActivePrediction) {
    return `<span class="status-logo status-open status-green-unlocked" title="Unlocked & Saved - Prediction entered (Kickoff: ${koFormatted})" aria-label="Unlocked and prediction entered" role="img">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
      </svg>
    </span>`;
  }

  // 6. Yellow unlocked: open for entry based on established rules (prediction pending)
  return `<span class="status-logo status-open-rules status-yellow-unlocked" title="Open for entry - Prediction pending (Kickoff: ${koFormatted})" aria-label="Open for entry" role="img">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
    </svg>
  </span>`;
}

// ─── Render: Team Breakdown & Match Table ──────────────────────────────────────
function renderTeamBreakdown() {
  const card = document.getElementById('teamBreakdownCard');
  if (!card) return;

  const selectedTeams = getSelectedTeams();
  if (selectedTeams.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  if (selectedTeams.length === 1) {
    const team = selectedTeams[0];
    const club = getClubDetails(team) || Object.values(state.teams).find(t => t.name === team);
    document.getElementById('teamBreakdownTitle').innerHTML = `${club?.fullName || team} <span class="team-title-short" style="color:var(--accent-cyan); font-size:0.9rem; font-weight:700;">(${club?.shortName || club?.short || ''})</span>`;
    document.getElementById('teamBreakdownSubtitle').innerHTML = `
      <span style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
        ${club?.stadium ? `<span class="meta-chip" title="Home Stadium">🏟️ ${club.stadium}</span>` : ''}
        ${club?.city ? `<span class="meta-chip" title="Club City">📍 ${club.city}</span>` : ''}
        <span style="color:var(--text-muted); font-size:0.8rem;">Participant predictions & breakdown</span>
      </span>
    `;
    const code = club?.code || Object.values(state.teams).find(t => t.name === team)?.code;
    document.getElementById('teamBadgeIcon').innerHTML = getCrestImg(code, team);
  } else {
    document.getElementById('teamBreakdownTitle').textContent = selectedTeams.length <= 3
      ? `${selectedTeams.join(' & ')} Matches & Predictions`
      : `${selectedTeams.length} Selected Teams Matches & Predictions`;
    document.getElementById('teamBreakdownSubtitle').textContent = `Participant performance on matches involving: ${selectedTeams.join(', ')}`;
    const crestsHtml = `<div class="team-badge-stack">` +
      selectedTeams.slice(0, 3).map(t => {
        const c = Object.values(state.teams).find(tm => tm.name === t)?.code;
        return `<span class="team-badge-stack-item">${getCrestImg(c, t)}</span>`;
      }).join('') +
      (selectedTeams.length > 3 ? `<span class="team-badge-stack-more">+${selectedTeams.length - 3}</span>` : '') +
      `</div>`;
    document.getElementById('teamBadgeIcon').innerHTML = crestsHtml;
  }

  const isGuest = state.auth.role === 'guest';
  const players = isGuest ? [] : state.players;

  const allTeamFixtures = [];
  const seenFixtureIds = new Set();

  for (const gw of state.gwNumbers) {
    const rawGwFixtures = state.fixtures[gw] ?? [];
    for (const f of rawGwFixtures) {
      if (seenFixtureIds.has(f.id)) continue;
      const isHomeSelected = selectedTeams.includes(f.home_name);
      const isAwaySelected = selectedTeams.includes(f.away_name);
      if (isHomeSelected || isAwaySelected) {
        seenFixtureIds.add(f.id);
        allTeamFixtures.push(f);
      }
    }
  }

  // Render Participant Stats Grid
  const participantGrid = document.getElementById('teamParticipantGrid');
  if (isGuest) {
    participantGrid.innerHTML = `
      <div style="grid-column: 1/-1; padding: 12px; color: var(--text-muted); font-size: 0.88rem;">
        🔒 Participant predictions and statistics are hidden for guest users.
      </div>`;
  } else {
    participantGrid.innerHTML = players.map((p) => {
      let pts = 0, played = 0;
      const tierCounts = {};
      for (const t of SCORING_TIERS) {
        tierCounts[t.tier] = 0;
      }

      for (const f of allTeamFixtures) {
        const scoreInfo = getMatchScoreInfo(f);
        if (!scoreInfo.hasScore) continue;
        const pred = state.predictions[`${f.id}_${p.id}`];
        if (!pred || pred.predicted_home === null || pred.predicted_away === null || pred.predicted_home === undefined || pred.predicted_home === '' || pred.predicted_away === '') continue;

        const res = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pred.predicted_home), Number(pred.predicted_away));
        if (!res) continue;
        pts += res.total;
        played++;
        if (res.tier) {
          tierCounts[res.tier] = (tierCounts[res.tier] || 0) + 1;
        }
      }

      const shades = getPlayerColorShades(p);
      const isYou = state.auth.activePlayerId === p.id;
      const initials = p.name ? p.name.slice(0, 2).toUpperCase() : '??';

      const activeTiers = SCORING_TIERS.map(t => {
        const count = tierCounts[t.tier] || 0;
        return {
          icon: renderIconElement(t.icon, t.icon_type, 14),
          count,
          cls: `t${t.tier}`,
          title: `${t.name} (${t.pts} pts)`
        };
      }).filter(t => t.count > 0);

      const tierChipsHtml = activeTiers.length > 0
        ? `<div class="snapshot-tier-counts">
            ${activeTiers.map(t => `<span class="snapshot-tier-chip active ${t.cls}" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};" title="${t.title}: ${t.count}">${t.icon} <strong style="color:${shades.primary};">${t.count}</strong></span>`).join('')}
          </div>`
        : '';

      return `
        <div class="snapshot-card ${isYou ? 'active-player-card' : ''}" style="border-top: 3px solid ${shades.primary}; background-image: radial-gradient(circle at top right, ${shades.glow}, transparent 65%);">
          <div class="rank-medal-badge" style="background: ${shades.badgeBg}; border-color: ${shades.badgeBorder}; box-shadow: 0 0 10px ${shades.glow};" title="${p.name}">
            <span class="rank-medal-icon" style="font-size: 0.85rem; font-weight: 800; color: ${shades.primary}; font-family: var(--font-title);">${initials}</span>
          </div>
          <div class="snapshot-info">
            <div class="snapshot-header-row">
              <span class="snapshot-name" style="color: ${shades.primary}; font-weight:700;" title="${p.name}">${p.name}</span>
            </div>
            <div class="snapshot-pts-row">
              <span class="snapshot-pts" style="background:${shades.textGradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;">${pts}</span>
              <span class="snapshot-pts-unit">pts</span>
              ${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};">You</span>` : ''}
            </div>
            <div class="snapshot-meta">${played} match${played === 1 ? '' : 'es'}</div>
          </div>
          ${tierChipsHtml}
        </div>
      `;
    }).join('');
  }

  // Render Team Match Table
  const thead = document.getElementById('teamMatchesHead');
  thead.innerHTML = `
    <th class="gw-col-header" style="min-width:60px; white-space:nowrap; text-align:center;">GW</th>
    <th class="col-match" style="text-align:left; white-space:nowrap;">Matchup</th>
    <th class="col-result" style="white-space:nowrap; min-width:85px; text-align:center;">Status</th>
    ${players.map((p) => {
    const isYou = state.auth.activePlayerId === p.id;
    const shades = getPlayerColorShades(p);
    return `<th style="text-align:center; color:${shades.primary}!important; background:${shades.bgSubtle}; border-bottom:2px solid ${shades.border}; white-space:nowrap;">
        <span class="player-color-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${shades.primary};margin-right:5px;vertical-align:middle;box-shadow:0 0 6px ${shades.glow};"></span>
        ${p.name}${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};">You</span>` : ''}
      </th>`;
  }).join('')}
  `;

  const tbody = document.getElementById('teamMatchesBody');
  if (allTeamFixtures.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${3 + players.length}" style="text-align:center; padding:20px; color:var(--text-muted);">No fixtures found for selected teams.</td></tr>`;
    return;
  }

  tbody.innerHTML = allTeamFixtures.map(f => {
    const timeLocked = isLocked(f);
    const fixtureInScope = isFixtureInGroupScope(f);
    const isMatchInScope = isGuest || fixtureInScope;
    const locked = timeLocked || !isMatchInScope;
    const scoreInfo = getMatchScoreInfo(f);

    let resultText = '';
    if (scoreInfo.isFinished && scoreInfo.hasScore) {
      resultText = `<span class="actual-score-badge" title="Official Premier League Result">${scoreInfo.home}&nbsp;–&nbsp;${scoreInfo.away}</span>`;
    } else if (scoreInfo.isLive) {
      resultText = `<span class="actual-score-badge live" title="Live Match in Progress: ${scoreInfo.home} – ${scoreInfo.away}"><span class="live-pulse-dot"></span>${scoreInfo.home}&nbsp;–&nbsp;${scoreInfo.away}</span>`;
    } else {
      resultText = getStatusLogoHtml(f, isGuest);
    }

    const playerCells = players.map((p) => {
      const pred = state.predictions[`${f.id}_${p.id}`];
      const pH = pred?.predicted_home ?? '';
      const pA = pred?.predicted_away ?? '';
      const isAdmin = state.auth.role === 'admin';
      const canEdit = (isAdmin || !timeLocked) && isPlayerEditable(p.id) && (isMatchInScope || isAdmin);
      const hasPred = pH !== '' && pA !== '' && pred?.predicted_home !== null && pred?.predicted_away !== null && pred?.predicted_home !== undefined && pred?.predicted_away !== undefined;

      let res = null;
      if (scoreInfo.hasScore && hasPred) {
        res = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pH), Number(pA));
      } else if (scoreInfo.hasScore && !hasPred && (timeLocked || scoreInfo.isLive || scoreInfo.isFinished)) {
        res = { total: 0, tier: 6, isExactScore: false, isCorrectOutcome: false, base: 0, highScoringBonus: 0, drawBonus: 0 };
      }

      const ptsBadge = res ? `<span class="pts-badge pts-interactive ${ptsBadgeClass(res)}${scoreInfo.isLive ? ' pts-live' : ''}" data-match="${f.id}" data-player="${p.id}" tabindex="0" role="button" aria-label="Points breakdown for ${p.name}" title="${(scoreInfo.isLive ? '[LIVE] ' : '')}${tierLabel(res.tier)} (${res.total} pts against ${scoreInfo.home}–${scoreInfo.away})">${res.total}</span>` : '';

      if (!canEdit) {
        return `
          <td style="text-align:center; white-space:nowrap;">
            <div style="font-family:var(--font-title); font-weight:700; font-size:0.95rem; white-space:nowrap; ${!isMatchInScope ? 'color:var(--text-dim); opacity:0.7;' : ''}">${pH !== '' ? `${pH}&nbsp;–&nbsp;${pA}` : (locked ? '-' : '?')}</div>
            ${ptsBadge}
          </td>
        `;
      } else {
        return `
          <td style="text-align:center; white-space:nowrap;">
            <div style="display:inline-flex; align-items:center; gap:4px; justify-content:center;">
              <input type="number" min="0" max="99" class="score-input"
                id="tb_inp_${f.id}_${p.id}_h"
                value="${pH}"
                data-match="${f.id}" data-player="${p.id}" data-side="h"
                aria-label="${p.name} home score">
              <span style="color:var(--text-dim); font-size:0.8rem; font-weight:700;">–</span>
              <input type="number" min="0" max="99" class="score-input"
                id="tb_inp_${f.id}_${p.id}_a"
                value="${pA}"
                data-match="${f.id}" data-player="${p.id}" data-side="a"
                aria-label="${p.name} away score">
            </div>
          </td>
        `;
      }
    }).join('');

    const homeTitle = `${f.home_name} (${f.home_short || ''}) - 🏟️ ${f.home_stadium || 'Stadium'}${f.home_city ? ', ' + f.home_city : ''}`;
    const awayTitle = `${f.away_name} (${f.away_short || ''}) - 🏟️ ${f.away_stadium || 'Stadium'}${f.away_city ? ', ' + f.away_city : ''}`;

    return `
      <tr class="${!isMatchInScope ? 'row-out-of-scope' : ''}">
        <td class="gw-cell" style="font-weight:700; color:var(--accent-purple); white-space:nowrap; text-align:center;">GW ${f.event}</td>
        <td class="col-match">
          <div class="match-info">
            <div class="match-teams">
              <span class="match-team home-team">
                ${getCrestImg(f.home_code, f.home_name)}
                <span class="team-click-link ${selectedTeams.includes(f.home_name) ? 'active-filter' : ''}" data-team="${f.home_name}" title="${homeTitle}">
                  <span class="team-name-full">${f.home_name}</span>
                  <span class="team-name-short">${f.home_short || f.home_name.slice(0, 3).toUpperCase()}</span>
                </span>
              </span>
              <span class="match-vs">vs</span>
              <span class="match-team away-team">
                ${getCrestImg(f.away_code, f.away_name)}
                <span class="team-click-link ${selectedTeams.includes(f.away_name) ? 'active-filter' : ''}" data-team="${f.away_name}" title="${awayTitle}">
                  <span class="team-name-full">${f.away_name}</span>
                  <span class="team-name-short">${f.away_short || f.away_name.slice(0, 3).toUpperCase()}</span>
                </span>
              </span>
            </div>
            <div class="match-meta-line">
              <span class="match-ko">${formatKO(f.kickoff_time)}</span>
              ${f.home_stadium ? `<span class="match-venue" title="Venue: ${f.home_stadium}, ${f.home_city}">🏟️ ${f.home_stadium}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="col-result">${resultText}</td>
        ${playerCells}
      </tr>
    `;
  }).join('');

  attachInputHandlers();
  attachTeamLinkHandlers();
}

function attachTeamLinkHandlers() {
  document.querySelectorAll('.team-click-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const selected = e.target.dataset.team || e.target.closest('.team-click-link')?.dataset.team;
      if (!selected) return;
      if (state.selectedTeams.length === 1 && state.selectedTeams[0] === selected) {
        clearTeamFilter();
      } else {
        setSelectedTeams([selected]);
      }
    });
  });
}

// ─── Render: Gameweek Matrix ──────────────────────────────────────────────────
function renderMatrix() {
  const gw = state.activeGW;
  if (!gw) return;

  const isGuest = state.auth.role === 'guest';
  const rawFixtures = state.fixtures[gw] ?? [];
  const groupFilter = getGroupTeamsFilter(state.activeGroup);
  let fixtures = isGuest ? rawFixtures : filterFixturesByGroup(rawFixtures);

  const selectedTeams = getSelectedTeams();
  const hasTeamFilter = selectedTeams.length > 0;

  if (hasTeamFilter) {
    fixtures = rawFixtures.filter(f => selectedTeams.includes(f.home_name) || selectedTeams.includes(f.away_name));
  }

  let titleAddon = '';
  if (selectedTeams.length === 1) {
    const details = getClubDetails(selectedTeams[0]);
    titleAddon = ` (${details?.shortName || selectedTeams[0]})`;
  } else if (selectedTeams.length > 1) {
    titleAddon = ` (${selectedTeams.length} Teams)`;
  }

  const subtitleText = isGuest
    ? '📌 Premier League Fixture Schedule & Official Scores'
    : `📅 GW ${gw} Predictions${titleAddon}`;

  document.getElementById('matrixTitle').textContent = subtitleText;

  const completed = fixtures.filter(f => isMatchFinished(f)).length;
  const live = fixtures.filter(f => isMatchOngoing(f)).length;
  const yetToPlay = fixtures.filter(f => !isMatchFinished(f) && !isMatchOngoing(f)).length;

  const scopeChip = (!isGuest && groupFilter)
    ? `<span class="meta-chip" style="color:var(--accent-gold);border-color:var(--accent-gold)">🎯 Scope: ${groupFilter.length} Teams</span>`
    : (!isGuest ? `<span class="meta-chip">⚽ All Teams Scope</span>` : '');

  let filterChip = '';
  if (selectedTeams.length === 1) {
    const details = getClubDetails(selectedTeams[0]);
    filterChip = `<span class="meta-chip" style="color:var(--accent-cyan);border-color:var(--accent-cyan)">⚽ Team: ${selectedTeams[0]} (${details?.shortName || ''})</span>`;
  } else if (selectedTeams.length > 1) {
    filterChip = `<span class="meta-chip" style="color:var(--accent-cyan);border-color:var(--accent-cyan)">⚽ Teams: ${selectedTeams.length}</span>`;
  }

  const adminChip = state.auth.role === 'admin'
    ? `<span class="meta-chip" style="color:var(--accent-cyan);border-color:var(--accent-cyan)" title="Admin Override Active: You can edit predictions for any player & completed matches">👑 Admin Edits Enabled</span>`
    : '';

  const liveChip = live > 0
    ? `<span class="meta-chip" style="color:#ff5572;border-color:rgba(255,85,114,0.4);">⚡ ${live} live</span>`
    : '';

  document.getElementById('matrixMeta').innerHTML = `
    ${adminChip}
    ${scopeChip}
    ${filterChip}
    ${liveChip}
    <span class="meta-chip">✅ ${completed} completed</span>
    <span class="meta-chip">⏳ ${yetToPlay} yet to play</span>
  `;

  let players = isGuest ? [] : [...state.players];
  if (!isGuest && state.auth.activePlayerId) {
    const youIdx = players.findIndex(p => p.id === state.auth.activePlayerId);
    if (youIdx > 0) {
      const [youPlayer] = players.splice(youIdx, 1);
      players.unshift(youPlayer);
    }
  }
  const head = document.getElementById('matrixHead');

  if (isGuest) {
    head.innerHTML = `
      <tr>
        <th class="col-match">Matchup</th>
        <th class="col-ko">Kickoff Time</th>
        <th class="col-status">Status</th>
        <th class="col-result">Official Result</th>
      </tr>
    `;
  } else {
    head.innerHTML = `
      <tr>
        <th class="col-match" rowspan="2">Match</th>
        <th class="col-status" rowspan="2">Status</th>
        ${players.map((p) => {
      const shades = getPlayerColorShades(p);
      const isYou = state.auth.activePlayerId === p.id;
      return `
            <th colspan="3" class="th-friend-group" style="color:${shades.primary}!important; border-bottom: 2px solid ${shades.border}; background:${shades.bgSubtle} !important;">
              <span class="player-color-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${shades.primary};margin-right:6px;vertical-align:middle;box-shadow:0 0 6px ${shades.glow};"></span>
              <span class="player-header-name">${p.name}</span>${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};">You</span>` : ''}
            </th>
          `;
    }).join('')}
        <th class="col-result" rowspan="2">Result</th>
      </tr>
      <tr>
        ${players.map(() => `
          <th class="col-sub-h" title="Home score prediction">H</th>
          <th class="col-sub-a" title="Away score prediction">A</th>
          <th class="col-sub-pts" title="Points scored">Pts <span class="pts-info-help" data-rules-help="true" title="Click or tap to view scoring rules">ℹ️</span></th>
        `).join('')}
      </tr>
    `;
  }

  const tbody = document.getElementById('matrixBody');

  if (!isGuest && players.length === 0) {
    const msg = state.auth.role === 'admin'
      ? 'No players found in this group yet. Click "Manage Leagues & Players" to add people!'
      : 'No players found in this group yet. Ask your league admin to add players!';
    tbody.innerHTML = `<tr><td colspan="10" class="loading-state">${msg}</td></tr>`;
    renderMatrixFooter(players, fixtures, isGuest);
    return;
  }

  if (fixtures.length === 0) {
    const emptyMsg = isGuest
      ? (hasTeamFilter ? `No fixtures found for selected team(s) in GW ${gw}.` : `No fixtures found for GW ${gw}.`)
      : `No fixtures matching current scope/filter for GW ${gw}.`;
    tbody.innerHTML = `<tr><td colspan="${isGuest ? 4 : (4 + players.length * 3)}" class="loading-state">${emptyMsg}</td></tr>`;
    renderMatrixFooter(players, fixtures, isGuest);
    return;
  }

  tbody.innerHTML = fixtures.map(f => {
    const timeLocked = isLocked(f);
    const fixtureInScope = isFixtureInGroupScope(f);
    const isMatchInScope = isGuest || fixtureInScope;
    const locked = timeLocked || !isMatchInScope;
    const scoreInfo = getMatchScoreInfo(f);

    const statusHtml = getStatusLogoHtml(f, isGuest);

    let actualHtml = '';
    if (scoreInfo.isFinished && scoreInfo.hasScore) {
      actualHtml = `<span class="actual-score-badge" title="Official Premier League Result">${scoreInfo.home}&nbsp;–&nbsp;${scoreInfo.away}</span>`;
    } else if (scoreInfo.isLive) {
      actualHtml = `<span class="actual-score-badge live" title="Live Match in Progress: ${scoreInfo.home} – ${scoreInfo.away}"><span class="live-pulse-dot"></span>${scoreInfo.home}&nbsp;–&nbsp;${scoreInfo.away}</span>`;
    } else {
      actualHtml = `<span class="actual-score-badge pending" title="${!isMatchInScope ? 'Locked: Outside group scope' : 'Open for predictions'}">-</span>`;
    }

    const homeTitle = `${f.home_name} (${f.home_short || ''}) - 🏟️ ${f.home_stadium || 'Stadium'}${f.home_city ? ', ' + f.home_city : ''}`;
    const awayTitle = `${f.away_name} (${f.away_short || ''}) - 🏟️ ${f.away_stadium || 'Stadium'}${f.away_city ? ', ' + f.away_city : ''}`;

    if (isGuest) {
      return `
        <tr class="${!isMatchInScope ? 'row-out-of-scope' : ''}">
          <td class="col-match">
            <div class="match-info">
              <div class="match-teams">
                <span class="match-team home-team">
                  ${getCrestImg(f.home_code, f.home_name)}
                  <span class="team-click-link ${selectedTeams.includes(f.home_name) ? 'active-filter' : ''}" data-team="${f.home_name}" title="${homeTitle}">
                    <span class="team-name-full">${f.home_name}</span>
                    <span class="team-name-short">${f.home_short || f.home_name.slice(0, 3).toUpperCase()}</span>
                  </span>
                </span>
                <span class="match-vs">vs</span>
                <span class="match-team away-team">
                  ${getCrestImg(f.away_code, f.away_name)}
                  <span class="team-click-link ${selectedTeams.includes(f.away_name) ? 'active-filter' : ''}" data-team="${f.away_name}" title="${awayTitle}">
                    <span class="team-name-full">${f.away_name}</span>
                    <span class="team-name-short">${f.away_short || f.away_name.slice(0, 3).toUpperCase()}</span>
                  </span>
                </span>
              </div>
              <div class="match-meta-line">
                ${f.home_stadium ? `<span class="match-venue" title="Venue: ${f.home_stadium}, ${f.home_city}">🏟️ ${f.home_stadium}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="col-ko">${formatKO(f.kickoff_time)}</td>
          <td class="col-status">${statusHtml}</td>
          <td class="col-result">${actualHtml}</td>
        </tr>
      `;
    }

    const playerCells = players.map((p) => {
      const pred = state.predictions[`${f.id}_${p.id}`];
      const pH = pred?.predicted_home ?? '';
      const pA = pred?.predicted_away ?? '';
      const isAdmin = state.auth.role === 'admin';
      const canEdit = (isAdmin || !timeLocked) && isPlayerEditable(p.id) && (isMatchInScope || isAdmin);
      const hasPred = pH !== '' && pA !== '' && pred?.predicted_home !== null && pred?.predicted_away !== null && pred?.predicted_home !== undefined && pred?.predicted_away !== undefined;

      let result = null;
      if (scoreInfo.hasScore && hasPred) {
        result = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pH), Number(pA));
      } else if (scoreInfo.hasScore && !hasPred && (timeLocked || scoreInfo.isLive || scoreInfo.isFinished)) {
        result = { total: 0, tier: 6, isExactScore: false, isCorrectOutcome: false, base: 0, highScoringBonus: 0, drawBonus: 0 };
      }

      const ptsClass = result ? `${ptsBadgeClass(result)}${scoreInfo.isLive ? ' pts-live' : ''}` : 'pending';
      const tierObj = result ? SCORING_TIERS.find(t => t.tier === result.tier) : null;
      const tierIcon = tierObj ? renderIconElement(tierObj.icon, tierObj.icon_type, 14) : '';
      const hasBonus = result && (result.highScoringBonus > 0 || result.drawBonus > 0 || result.customBonusesTotal > 0);
      const ptsText = result
        ? `<span class="tier-pill-icon" style="font-size: 0.8rem; line-height: 1; margin-right: 2px;">${tierIcon}</span><span class="pts-val">${result.total}</span>${hasBonus ? '<span class="bonus-pill-icon" style="font-size: 0.75rem; margin-left: 2px;">🔥</span>' : ''}`
        : (locked ? '-' : '?');
      const ptsTitle = result
        ? (scoreInfo.isLive ? '[LIVE] ' : '') + tierLabel(result.tier) + (result.highScoringBonus ? ' +🔥' : '') + (result.drawBonus ? ' +✨' : '') + ` (${result.total} pts against ${scoreInfo.home}–${scoreInfo.away})`
        : (locked ? 'Awaiting kickoff' : 'Open for predictions');

      const inputTitle = (type, teamName) => {
        if (isAdmin && timeLocked) {
          return `Admin Override: Edit ${type} score prediction for ${teamName} (past/completed match)`;
        }
        if (!isMatchInScope && !isAdmin) return 'Locked: Outside group scope';
        if (timeLocked && !isAdmin) return 'Locked: Kickoff passed';
        return `Enter predicted ${type} score for ${teamName}`;
      };

      return `
        <td class="col-score col-score-h">
          <div class="score-inputs">
            <input type="number" min="0" max="99" class="score-input"
              id="inp_${f.id}_${p.id}_h"
              value="${pH}"
              data-match="${f.id}" data-player="${p.id}" data-side="h"
              ${!canEdit ? 'disabled' : ''}
              style="${!canEdit ? 'opacity: 0.65; cursor: not-allowed;' : ''}"
              title="${inputTitle('home', f.home_name)}"
              aria-label="${p.name} home score for ${f.home_name}">
          </div>
        </td>
        <td class="col-score col-score-a">
          <div class="score-inputs">
            <input type="number" min="0" max="99" class="score-input"
              id="inp_${f.id}_${p.id}_a"
              value="${pA}"
              data-match="${f.id}" data-player="${p.id}" data-side="a"
              ${!canEdit ? 'disabled' : ''}
              style="${!canEdit ? 'opacity: 0.65; cursor: not-allowed;' : ''}"
              title="${inputTitle('away', f.away_name)}"
              aria-label="${p.name} away score for ${f.away_name}">
          </div>
        </td>
        <td class="col-pts">
          <span class="pts-badge pts-interactive ${ptsClass}"
            data-match="${f.id}"
            data-player="${p.id}"
            tabindex="0"
            role="button"
            aria-label="Points breakdown for ${p.name}"
            title="${ptsTitle}">${ptsText}</span>
        </td>
      `;
    }).join('');

    return `
      <tr class="${!isMatchInScope ? 'row-out-of-scope' : ''}">
        <td class="col-match">
          <div class="match-info">
            <div class="match-teams">
              <span class="match-team home-team">
                ${getCrestImg(f.home_code, f.home_name)}
                <span class="team-click-link ${selectedTeams.includes(f.home_name) ? 'active-filter' : ''}" data-team="${f.home_name}" title="${homeTitle}">
                  <span class="team-name-full">${f.home_name}</span>
                  <span class="team-name-short">${f.home_short || f.home_name.slice(0, 3).toUpperCase()}</span>
                </span>
              </span>
              <span class="match-vs">vs</span>
              <span class="match-team away-team">
                ${getCrestImg(f.away_code, f.away_name)}
                <span class="team-click-link ${selectedTeams.includes(f.away_name) ? 'active-filter' : ''}" data-team="${f.away_name}" title="${awayTitle}">
                  <span class="team-name-full">${f.away_name}</span>
                  <span class="team-name-short">${f.away_short || f.away_name.slice(0, 3).toUpperCase()}</span>
                </span>
              </span>
            </div>
            <div class="match-meta-line">
              <span class="match-ko">${formatKO(f.kickoff_time)}</span>
              ${f.home_stadium ? `<span class="match-venue" title="Venue: ${f.home_stadium}, ${f.home_city}">🏟️ ${f.home_stadium}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="col-status">${statusHtml}</td>
        ${playerCells}
        <td class="col-result">${actualHtml}</td>
      </tr>
    `;
  }).join('');

  if (!isGuest) attachInputHandlers();
  attachTeamLinkHandlers();
  renderMatrixFooter(players, fixtures, isGuest);
}

function renderMatrixFooter(players, fixtures, isGuest) {
  const foot = document.getElementById('matrixFoot');
  if (!foot) return;

  if (isGuest || !players || players.length === 0 || !fixtures || fixtures.length === 0) {
    foot.innerHTML = '';
    return;
  }

  // Calculate cumulative total points for each player across all fixtures in active matrix
  const playerTotals = {};
  players.forEach(p => { playerTotals[p.id] = 0; });

  fixtures.forEach(f => {
    const scoreInfo = getMatchScoreInfo(f);
    if (!scoreInfo.hasScore) return;

    players.forEach(p => {
      const pred = state.predictions[`${f.id}_${p.id}`];
      if (pred && pred.predicted_home !== null && pred.predicted_away !== null &&
        pred.predicted_home !== undefined && pred.predicted_away !== undefined &&
        pred.predicted_home !== '' && pred.predicted_away !== '') {
        const res = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pred.predicted_home), Number(pred.predicted_away));
        if (res && res.total) {
          playerTotals[p.id] += res.total;
        }
      }
    });
  });

  foot.innerHTML = `
    <tr class="matrix-foot-row">
      <td colspan="2" class="matrix-foot-label-cell">
        <div class="matrix-foot-label">
          <span>Total Points</span>
        </div>
      </td>
      ${players.map(p => {
    const shades = getPlayerColorShades(p);
    const total = playerTotals[p.id] || 0;
    return `
          <td colspan="3" class="matrix-foot-player-cell" style="background:${shades.bgSubtle}; border-top:2px solid ${shades.border}; border-right:1px solid rgba(255, 255, 255, 0.08);">
            <div class="matrix-foot-pts-badge" style="color:${shades.primary}; border-color:${shades.chipBorder}; background:${shades.chipBg};">
              <span class="matrix-foot-pts-num">${total}</span>
              <span class="matrix-foot-pts-unit">pts</span>
            </div>
          </td>
        `;
  }).join('')}
      <td class="matrix-foot-empty-cell"></td>
    </tr>
  `;
}

function updateMatrixTotals() {
  const gw = state.activeGW;
  if (!gw) return;
  const isGuest = state.auth.role === 'guest';
  if (isGuest) return;

  const rawFixtures = state.fixtures[gw] ?? [];
  const selectedTeams = getSelectedTeams();
  let fixtures = isGuest ? rawFixtures : filterFixturesByGroup(rawFixtures);
  if (selectedTeams.length > 0) {
    fixtures = rawFixtures.filter(f => selectedTeams.includes(f.home_name) || selectedTeams.includes(f.away_name));
  }

  let players = [...state.players];
  if (state.auth.activePlayerId) {
    const youIdx = players.findIndex(p => p.id === state.auth.activePlayerId);
    if (youIdx > 0) {
      const [youPlayer] = players.splice(youIdx, 1);
      players.unshift(youPlayer);
    }
  }

  renderMatrixFooter(players, fixtures, isGuest);
}

// ─── Input Handlers (Server Auto-Save) ────────────────────────────────────────
function attachInputHandlers() {
  document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('blur', handleInputBlur);
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10);
      if (!isNaN(v) && v < 0) input.value = 0;
      if (!isNaN(v) && v > 99) input.value = 99;
    });
  });
}

async function handleInputBlur(e) {
  const input = e.target;
  const matchId = parseInt(input.dataset.match, 10);
  const playerId = parseInt(input.dataset.player, 10);
  if (!state.activeGroup) return;

  if (!isPlayerEditable(playerId)) return;

  // Scope & Lock validation
  const fixture = state.fixtures[state.activeGW]?.find(f => f.id === matchId) ||
    Object.values(state.fixtures).flat().find(f => f.id === matchId);
  const isAdmin = state.auth.role === 'admin';
  if (fixture) {
    if (isLocked(fixture) && !isAdmin) return;
    if (!isFixtureInGroupScope(fixture) && !isAdmin) {
      console.warn('Prediction rejected: Match is outside group scope.');
      return;
    }
  }

  const hInput = document.getElementById(`inp_${matchId}_${playerId}_h`) || document.getElementById(`tb_inp_${matchId}_${playerId}_h`);
  const aInput = document.getElementById(`inp_${matchId}_${playerId}_a`) || document.getElementById(`tb_inp_${matchId}_${playerId}_a`);

  const hVal = hInput?.value ?? '';
  const aVal = aInput?.value ?? '';

  try {
    await apiSavePrediction(matchId, playerId, state.activeGroup.id, hVal, aVal);

    const key = `${matchId}_${playerId}`;
    state.predictions[key] = {
      predicted_home: hVal !== '' ? parseInt(hVal, 10) : null,
      predicted_away: aVal !== '' ? parseInt(aVal, 10) : null,
    };

    [hInput, aInput].forEach(inp => {
      if (!inp) return;
      inp.classList.add('saved-flash');
      setTimeout(() => inp.classList.remove('saved-flash'), 800);
    });

    showSaveToast();

    updatePtsBadge(matchId, playerId);
    updateMatrixTotals();
    renderLeaderboard();
    renderSnapshot(calcLeaderboard());
    renderCumulativeChart();
    if (hasActiveTeamFilter()) renderTeamBreakdown();
  } catch (err) {
    console.error('Failed to save prediction to server:', err);
    alert(err.message);
  }
}

function updatePtsBadge(matchId, playerId) {
  const fixture = state.fixtures[state.activeGW]?.find(f => f.id === matchId);
  if (!fixture) return;
  const pred = state.predictions[`${matchId}_${playerId}`];
  const pIdx = state.players.findIndex(p => p.id === playerId);
  if (pIdx === -1) return;

  const row = document.querySelector(`[id="inp_${matchId}_${playerId}_h"]`)?.closest('tr');
  if (!row) return;

  const scoreInfo = getMatchScoreInfo(fixture);
  const pH = pred?.predicted_home ?? '';
  const pA = pred?.predicted_away ?? '';
  const hasPred = pH !== '' && pA !== '' && pred?.predicted_home !== null && pred?.predicted_away !== null && pred?.predicted_home !== undefined && pred?.predicted_away !== undefined;

  let result = null;
  if (scoreInfo.hasScore && hasPred) {
    result = evaluatePrediction(
      scoreInfo.home, scoreInfo.away,
      Number(pH), Number(pA)
    );
  } else if (scoreInfo.hasScore && !hasPred && (isLocked(fixture) || scoreInfo.isLive || scoreInfo.isFinished)) {
    result = { total: 0, tier: 6, isExactScore: false, isCorrectOutcome: false, base: 0, highScoringBonus: 0, drawBonus: 0 };
  }

  const allBadges = row.querySelectorAll('.pts-badge');
  const badge = allBadges[pIdx];
  if (!badge) return;

  const ptsClass = result ? `${ptsBadgeClass(result)}${scoreInfo.isLive ? ' pts-live' : ''}` : 'pending';
  const tierObj = result ? SCORING_TIERS.find(t => t.tier === result.tier) : null;
  const tierIconHtml = tierObj ? renderIconElement(tierObj.icon, tierObj.icon_type, 14) : '';
  const hasBonus = result && (result.highScoringBonus > 0 || result.drawBonus > 0 || result.customBonusesTotal > 0);
  const badgeInner = result
    ? `<span class="tier-pill-icon" style="font-size: 0.8rem; line-height: 1; margin-right: 2px;">${tierIconHtml}</span><span class="pts-val">${result.total}</span>${hasBonus ? '<span class="bonus-pill-icon" style="font-size: 0.75rem; margin-left: 2px;">🔥</span>' : ''}`
    : (isLocked(fixture) ? '-' : '?');
  const ptsTitle = result
    ? (scoreInfo.isLive ? '[LIVE] ' : '') + tierLabel(result.tier) + (result.highScoringBonus ? ' +🔥' : '') + (result.drawBonus ? ' +✨' : '') + ` (${result.total} pts against ${scoreInfo.home}–${scoreInfo.away})`
    : (isLocked(fixture) ? 'Awaiting kickoff' : 'Open for predictions');

  badge.className = `pts-badge pts-interactive ${ptsClass}`;
  badge.innerHTML = badgeInner;
  badge.title = ptsTitle;
  badge.setAttribute('data-match', matchId);
  badge.setAttribute('data-player', playerId);
  badge.setAttribute('tabindex', '0');
  badge.setAttribute('role', 'button');

  const statusCell = row.querySelector('.col-status');
  if (statusCell) {
    statusCell.innerHTML = getStatusLogoHtml(fixture, state.auth.role === 'guest');
  }
}

function showSaveToast() {
  const toast = document.getElementById('saveToast');
  if (!toast) return;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ─── Render: Full Leaderboard ─────────────────────────────────────────────────
function renderLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;

  const selectedTeams = getSelectedTeams();
  const leaderboardSubtitle = document.getElementById('leaderboardSubtitle');
  const leaderboardMeta = document.getElementById('leaderboardMeta');

  if (leaderboardSubtitle) {
    if (selectedTeams.length === 1) {
      const details = getClubDetails(selectedTeams[0]);
      const shortLabel = details?.short || details?.shortName || '';
      leaderboardSubtitle.textContent = `Scoring tier breakdown and total points for matches involving ${selectedTeams[0]}${shortLabel ? ` (${shortLabel})` : ''}`;
    } else if (selectedTeams.length > 1) {
      leaderboardSubtitle.textContent = `Scoring tier breakdown and total points for matches involving ${selectedTeams.length} Selected Teams (${selectedTeams.join(', ')})`;
    } else {
      leaderboardSubtitle.textContent = `Scoring tier breakdown and total points for active group`;
    }
  }

  if (leaderboardMeta) {
    if (selectedTeams.length === 1) {
      const details = getClubDetails(selectedTeams[0]);
      const shortLabel = details?.short || details?.shortName || '';
      leaderboardMeta.innerHTML = `<span class="meta-chip" style="color:var(--accent-cyan);border-color:var(--accent-cyan)">⚽ Team: ${selectedTeams[0]}${shortLabel ? ` (${shortLabel})` : ''}</span>`;
    } else if (selectedTeams.length > 1) {
      leaderboardMeta.innerHTML = `<span class="meta-chip" style="color:var(--accent-cyan);border-color:var(--accent-cyan)">⚽ Teams: ${selectedTeams.length}</span>`;
    } else {
      leaderboardMeta.innerHTML = '';
    }
  }

  const thead = document.getElementById('leaderboardHead') || document.querySelector('#leaderboardTable thead');
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th class="lb-player-th" style="text-align: left; white-space: nowrap;">Player</th>
        ${SCORING_TIERS.map(t => `
          <th class="lb-tier-th" data-tier="${t.tier}" tabindex="0" role="button" aria-label="Tier ${t.tier} Rules: ${t.name}" title="Click or tap to learn what Tier ${t.tier} means">
            <div class="th-tier-title" style="display:flex; align-items:center; justify-content:center; gap:4px;">
              ${renderIconElement(t.icon, t.icon_type, 16)} <span>Tier ${t.tier}</span>
            </div>
            <div class="th-tier-sub">${t.pts} ${t.pts === 1 ? 'pt' : 'pts'}</div>
          </th>
        `).join('')}
        <th class="lb-total-th" title="Total Cumulative Points">
          <div class="th-tier-title">Total</div>
          <div class="th-tier-sub">Pts</div>
        </th>
      </tr>
    `;
  }

  if (state.auth.role === 'guest') {
    tbody.innerHTML = `
      <tr>
        <td colspan="${2 + SCORING_TIERS.length}" style="text-align:center; padding: 30px; color: var(--text-muted);">
          🔒 <strong>Leaderboard Table Hidden for Guests:</strong> Log in with a 6-character player passcode or admin password to view rankings and point totals.
        </td>
      </tr>`;
    return;
  }

  const lb = calcLeaderboard();
  if (lb.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${2 + SCORING_TIERS.length}" style="text-align:center; padding: 24px; color: var(--text-muted);">
          No player data available for this group.
        </td>
      </tr>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  tbody.innerHTML = lb.map(r => {
    const isYou = state.auth.activePlayerId === r.id;
    const shades = getPlayerColorShades(r);
    const rankDisplay = medals[r.rank - 1] ?? `#${r.rank}`;
    return `
      <tr class="${isYou ? 'active-player-row' : ''}" style="${isYou ? `background:${shades.bgSubtle}; border-left:3px solid ${shades.primary};` : ''}">
        <td class="lb-player-cell" style="white-space:nowrap;">
          <div class="lb-player-info" style="display:inline-flex; align-items:center; gap:8px; white-space:nowrap; flex-wrap:nowrap;">
            <span class="lb-rank-badge rank-${r.rank}">${rankDisplay}</span>
            <span class="player-color-dot" style="display:inline-block;width:8px;height:8px;min-width:8px;border-radius:50%;background:${shades.primary};box-shadow:0 0 6px ${shades.glow};flex-shrink:0;"></span>
            <span class="lb-player-name" style="color:${shades.primary};font-weight:700;white-space:nowrap;">${r.name}</span>
            ${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};flex-shrink:0;">You</span>` : ''}
          </div>
        </td>
        ${SCORING_TIERS.map(t => {
      const count = r[`t${t.tier}`] || 0;
      return `<td class="lb-tier-cell ${count === 0 ? 'lb-zero' : ''}" data-tier="${t.tier}" data-player-name="${r.name}" data-count="${count}" tabindex="0" role="button" aria-label="Tier ${t.tier} (${t.name}) count for ${r.name}: ${count}" title="Click or tap to learn what Tier ${t.tier} (${t.name}) means">${count}</td>`;
    }).join('')}
        <td class="lb-pts">${r.total}</td>
      </tr>
    `;
  }).join('');
}

// ─── Team Abbreviation & Kickoff Helpers ─────────────────────────────────────────
const CLUB_SHORT_CODES = {
  'Arsenal': 'ARS',
  'Aston Villa': 'AVL',
  'Bournemouth': 'BOU',
  'Brentford': 'BRE',
  'Brighton': 'BHA',
  'Brighton & Hove Albion': 'BHA',
  'Chelsea': 'CHE',
  'Crystal Palace': 'CRY',
  'Everton': 'EVE',
  'Fulham': 'FUL',
  'Ipswich Town': 'IPS',
  'Ipswich': 'IPS',
  'Leicester City': 'LEI',
  'Leicester': 'LEI',
  'Liverpool': 'LIV',
  'Man City': 'MCI',
  'Manchester City': 'MCI',
  'Man United': 'MUN',
  'Man Utd': 'MUN',
  'Manchester United': 'MUN',
  'Newcastle': 'NEW',
  'Newcastle United': 'NEW',
  "Nott'm Forest": 'NFO',
  'Nottingham Forest': 'NFO',
  'Southampton': 'SOU',
  'Spurs': 'TOT',
  'Tottenham': 'TOT',
  'Tottenham Hotspur': 'TOT',
  'West Ham': 'WHU',
  'West Ham United': 'WHU',
  'Wolves': 'WOL',
  'Wolverhampton': 'WOL',
  'Wolverhampton Wanderers': 'WOL'
};

function getTeamShortCode(teamName, fallbackShort) {
  if (fallbackShort && fallbackShort.length <= 4 && !fallbackShort.startsWith('T') && isNaN(fallbackShort)) {
    return fallbackShort.toUpperCase();
  }
  if (teamName && CLUB_SHORT_CODES[teamName]) {
    return CLUB_SHORT_CODES[teamName];
  }
  if (teamName) {
    const norm = normalizeTeamName(teamName);
    if (CLUB_SHORT_CODES[norm]) return CLUB_SHORT_CODES[norm];
    return norm.slice(0, 3).toUpperCase();
  }
  return fallbackShort || '???';
}

function formatMatchAxisDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const tz = state.timezone || 'UTC';
  try {
    const day = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: tz });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${day} ${time}`;
  } catch (e) {
    return d.toUTCString().slice(0, 11);
  }
}

export function getCrestUrl(code) {
  if (!code) return 'assets/pl-logo.png';
  return `assets/team_crests/png_crests/${code}.png`;
}

export function toggleChartExpandedGW(gw) {
  const num = Number(gw);
  if (!state.chartExpandedGWs) {
    const defaultGw = state.activeGW ? Number(state.activeGW) : (state.gwNumbers?.[0] ? Number(state.gwNumbers[0]) : 1);
    state.chartExpandedGWs = new Set([defaultGw]);
  }
  if (state.chartExpandedGWs.has(num)) {
    state.chartExpandedGWs.delete(num);
  } else {
    // Expand this gameweek alongside any already expanded gameweeks
    state.chartExpandedGWs.add(num);
  }
  renderCumulativeChart();
}

export function expandToCurrentGW() {
  if (!state.chartExpandedGWs) {
    state.chartExpandedGWs = new Set();
  } else {
    state.chartExpandedGWs.clear();
  }
  const currentGw = state.activeGW ? Number(state.activeGW) : (state.gwNumbers?.[0] ? Number(state.gwNumbers[0]) : 1);
  state.gwNumbers.forEach(g => {
    if (g <= currentGw) {
      state.chartExpandedGWs.add(g);
    }
  });
  renderCumulativeChart();
}

export function expandAllGWs() {
  if (!state.chartExpandedGWs) {
    state.chartExpandedGWs = new Set();
  }
  state.gwNumbers.forEach(g => {
    state.chartExpandedGWs.add(g);
  });
  renderCumulativeChart();
}

export function collapseAllGWs() {
  if (!state.chartExpandedGWs) {
    state.chartExpandedGWs = new Set();
  } else {
    state.chartExpandedGWs.clear();
  }
  renderCumulativeChart();
}

if (typeof window !== 'undefined') {
  window.toggleChartExpandedGW = toggleChartExpandedGW;
  window.expandToCurrentGW = expandToCurrentGW;
  window.expandAllGWs = expandAllGWs;
  window.collapseAllGWs = collapseAllGWs;
  window.getCrestUrl = getCrestUrl;
}

export function setChartDrilldown(gw) {
  if (gw === null || gw === 'all' || gw === 'none' || gw === undefined) {
    state.chartDrilldownGW = null;
  } else {
    const num = Number(gw);
    if (!isNaN(num) && state.gwNumbers.includes(num)) {
      state.chartDrilldownGW = num;
    } else {
      state.chartDrilldownGW = null;
    }
  }
  renderCumulativeChart();
}
if (typeof window !== 'undefined') {
  window.setChartDrilldown = setChartDrilldown;
}

// ─── Helper: Determine active or finished match/GW ────────────────────────────
const isMatchActiveOrFinished = (f) => {
  if (!f) return false;
  return Boolean(
    f.finished === true ||
    f.started === true ||
    isLocked(f) ||
    (f.actual_home_score !== null && f.actual_away_score !== null)
  );
};

const isGWActiveOrFinished = (gw) => {
  const rawGwFixtures = state.fixtures[gw] ?? [];
  const scopedFixtures = filterFixturesByGroupAndTeam(rawGwFixtures);
  const list = scopedFixtures.length > 0 ? scopedFixtures : filterFixturesByGroup(rawGwFixtures);
  return list.some(f => isMatchActiveOrFinished(f));
};

// ─── Main Entry Point: Leaderboard Chart ──────────────────────────────────────
function renderCumulativeChart() {
  const wrapper = document.getElementById('chartWrapper');
  const legendContainer = document.getElementById('chartLegend');
  if (!wrapper || !legendContainer) return;

  const drilldownBadge = document.getElementById('chartDrilldownBadge');
  const drilldownNav = document.getElementById('chartDrilldownNav');
  const overviewNav = document.getElementById('chartOverviewNav');
  const gwDrillSelect = document.getElementById('chartGwDrilldownSelect');
  const expandSelect = document.getElementById('chartInlineExpandSelect');
  const drilldownModeSelect = document.getElementById('chartDrilldownModeSelect');
  const chartSubtitle = document.getElementById('chartSubtitle');
  const controlsPanel = document.getElementById('chartControlsPanel');
  const legendPanel = document.getElementById('chartLegendPanel');

  if (state.auth.role === 'guest') {
    if (drilldownBadge) drilldownBadge.style.display = 'none';
    if (drilldownNav) drilldownNav.style.display = 'none';
    if (overviewNav) overviewNav.style.display = 'none';
    if (controlsPanel) controlsPanel.style.display = 'none';
    if (legendPanel) legendPanel.style.display = 'none';
    if (chartSubtitle) chartSubtitle.textContent = 'Cumulative total points tracked across all completed gameweeks';
    wrapper.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-muted);">
        🔒 <strong>Points Progression Chart Hidden for Guests:</strong> Log in with a player passcode to view cumulative charts.
      </div>`;
    legendContainer.innerHTML = '';
    return;
  }
  if (controlsPanel) controlsPanel.style.display = 'flex';

  // Check if we are in Isolated Gameweek Drilldown Mode
  if (state.chartDrilldownGW !== null && state.gwNumbers.includes(Number(state.chartDrilldownGW))) {
    const gw = Number(state.chartDrilldownGW);

    if (drilldownBadge) {
      drilldownBadge.style.display = 'inline-flex';
      drilldownBadge.innerHTML = `🔍 GW ${gw} Drilldown`;
    }
    if (drilldownNav) {
      drilldownNav.style.display = 'inline-flex';
    }
    if (overviewNav) {
      overviewNav.style.display = 'none';
    }
    if (gwDrillSelect) {
      gwDrillSelect.innerHTML = state.gwNumbers.map(g => `
        <option value="${g}" ${g === gw ? 'selected' : ''}>GW ${g}</option>
      `).join('');
    }

    renderGameweekMatchesChart(gw);
  } else {
    // Season Overview Mode with Inline Expand / Collapse
    state.chartDrilldownGW = null;
    if (drilldownBadge) drilldownBadge.style.display = 'none';
    if (drilldownNav) drilldownNav.style.display = 'none';
    if (overviewNav) overviewNav.style.display = 'inline-flex';

    if (state.chartExpandedGWs === null || state.chartExpandedGWs === undefined) {
      const defaultGw = state.activeGW ? Number(state.activeGW) : (state.gwNumbers?.[0] ? Number(state.gwNumbers[0]) : 1);
      state.chartExpandedGWs = new Set([defaultGw]);
    }

    if (drilldownModeSelect) {
      drilldownModeSelect.innerHTML = `
        <option value="none" selected>🔍 Drill Down: Off</option>
        ${state.gwNumbers.map(g => `
          <option value="${g}">🔍 Drill Down: GW ${g}</option>
        `).join('')}
      `;
    }

    renderAllGameweeksChart();
  }
}

// // ─── VIEW A: Season Progression Chart (with Inline Expand / Collapse) ─────────
function renderAllGameweeksChart() {
  const wrapper = document.getElementById('chartWrapper');
  const legendContainer = document.getElementById('chartLegend');
  const chartSubtitle = document.getElementById('chartSubtitle');
  const selectedTeams = getSelectedTeams();

  if (state.chartExpandedGWs === null || state.chartExpandedGWs === undefined) {
    const defaultGw = state.activeGW ? Number(state.activeGW) : (state.gwNumbers?.[0] ? Number(state.gwNumbers[0]) : 1);
    state.chartExpandedGWs = new Set([defaultGw]);
  }
  const expandedGwList = [...state.chartExpandedGWs].sort((a, b) => a - b);

  if (chartSubtitle) {
    if (selectedTeams.length === 1) {
      const details = getClubDetails(selectedTeams[0]);
      const shortLabel = details?.short || details?.shortName || '';
      chartSubtitle.textContent = `Cumulative points progression for ${selectedTeams[0]}${shortLabel ? ` (${shortLabel})` : ''} · Click any Gameweek to toggle matches`;
    } else if (selectedTeams.length > 1) {
      chartSubtitle.textContent = `Cumulative points progression for ${selectedTeams.length} Selected Teams · Click any Gameweek to toggle matches`;
    } else {
      chartSubtitle.textContent = `Cumulative points progression across the season · Click any Gameweek on the x-axis to expand or collapse matches`;
    }
  }

  // 1. Construct unified xItems sequence starting from Game 1 / GW 1
  const xItems = [];

  for (const gw of state.gwNumbers) {
    if (state.chartExpandedGWs.has(gw)) {
      const rawGwFixtures = state.fixtures[gw] ?? [];
      const fixtures = filterFixturesByGroupAndTeam(rawGwFixtures);
      const sortedMatches = [...fixtures].sort((a, b) => {
        const timeA = a.kickoff_time ? new Date(a.kickoff_time).getTime() : Infinity;
        const timeB = b.kickoff_time ? new Date(b.kickoff_time).getTime() : Infinity;
        if (timeA !== timeB) return timeA - timeB;
        return (a.id || 0) - (b.id || 0);
      });

      if (sortedMatches.length === 0) {
        xItems.push({
          type: 'gw',
          gw,
          isPlayed: isGWActiveOrFinished(gw)
        });
      } else {
        sortedMatches.forEach((f, mIdx) => {
          xItems.push({
            type: 'match',
            gw,
            matchIdx: mIdx,
            totalMatchesInGw: sortedMatches.length,
            fixture: f,
            isFirstInGw: mIdx === 0,
            isLastInGw: mIdx === sortedMatches.length - 1,
            isPlayed: isMatchActiveOrFinished(f),
            isLive: isMatchOngoing(f)
          });
        });
      }
    } else {
      xItems.push({
        type: 'gw',
        gw,
        isPlayed: isGWActiveOrFinished(gw)
      });
    }
  }

  const activeItemIndices = xItems
    .map((it, idx) => (it.isPlayed ? idx : -1))
    .filter(idx => idx !== -1);
  const maxPlayedItemIdx = activeItemIndices.length > 0 ? Math.max(...activeItemIndices) : 0;

  // 2. Compute progression along xItems for each player
  const playerData = state.players.map(p => {
    let cumulative = 0;
    const pointsByItem = [];

    for (let itIdx = 0; itIdx < xItems.length; itIdx++) {
      const it = xItems[itIdx];
      if (it.type === 'match') {
        const f = it.fixture;
        const scoreInfo = getMatchScoreInfo(f);
        let matchPts = 0;
        let tier = null;
        let bonuses = [];
        const pred = state.predictions[`${f.id}_${p.id}`];
        const hasPred = Boolean(pred && pred.predicted_home !== null && pred.predicted_away !== null && pred.predicted_home !== undefined && pred.predicted_home !== '' && pred.predicted_away !== '');

        if (scoreInfo.hasScore && hasPred) {
          const res = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pred.predicted_home), Number(pred.predicted_away));
          if (res) {
            matchPts = res.total;
            tier = res.tier;
            bonuses = res.activeBonuses || [];
          }
        }
        cumulative += matchPts;
        pointsByItem.push({
          type: 'match',
          gw: it.gw,
          matchIdx: it.matchIdx,
          fixture: f,
          hasPred,
          predHome: pred?.predicted_home,
          predAway: pred?.predicted_away,
          matchPts,
          matchTier: tier,
          matchBonuses: bonuses,
          cumulative
        });
      } else {
        // Collapsed GW item
        let gwPts = 0;
        const gwTiers = {};
        if (typeof SCORING_TIERS !== 'undefined' && Array.isArray(SCORING_TIERS)) {
          SCORING_TIERS.forEach(t => { gwTiers[`t${t.tier}`] = 0; });
        }

        if (it.isPlayed) {
          const rawGwFixtures = state.fixtures[it.gw] ?? [];
          const fixtures = filterFixturesByGroupAndTeam(rawGwFixtures);
          for (const f of fixtures) {
            const scoreInfo = getMatchScoreInfo(f);
            if (!scoreInfo.hasScore) continue;
            const pred = state.predictions[`${f.id}_${p.id}`];
            if (!pred || pred.predicted_home === null || pred.predicted_away === null || pred.predicted_home === undefined || pred.predicted_home === '' || pred.predicted_away === '') continue;

            const res = evaluatePrediction(scoreInfo.home, scoreInfo.away, Number(pred.predicted_home), Number(pred.predicted_away));
            if (res) {
              gwPts += res.total;
              if (res.tier) {
                gwTiers[`t${res.tier}`] = (gwTiers[`t${res.tier}`] || 0) + 1;
              }
            }
          }
        }
        cumulative += gwPts;
        pointsByItem.push({
          type: 'gw',
          gw: it.gw,
          gwPts,
          gwTiers,
          cumulative
        });
      }
    }

    return {
      id: p.id,
      name: p.name,
      color: getPlayerColor(p),
      total: cumulative,
      pointsByItem
    };
  });

  const legendPanel = document.getElementById('chartLegendPanel');
  if (playerData.length === 0 || xItems.length === 0) {
    wrapper.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">No player chart data available for this group.</div>`;
    legendContainer.innerHTML = '';
    if (legendPanel) legendPanel.style.display = 'none';
    return;
  }
  if (legendPanel) legendPanel.style.display = 'flex';

  const sortedLegendPlayers = [...playerData].sort((a, b) => {
    const isYouA = state.auth.activePlayerId === a.id;
    const isYouB = state.auth.activePlayerId === b.id;
    if (isYouA && !isYouB) return -1;
    if (!isYouA && isYouB) return 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  legendContainer.innerHTML = sortedLegendPlayers.map(p => {
    const isYou = state.auth.activePlayerId === p.id;
    return `
      <div class="chart-legend-chip ${isYou ? 'active' : ''}">
        <span class="legend-dot" style="background: ${p.color};"></span>
        <span>${p.name}${isYou ? ' (You)' : ''}</span>
        <span class="legend-pts">${p.total} pts</span>
      </div>
    `;
  }).join('');

  const numItems = xItems.length;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const padLeft = isMobile ? 55 : 65;
  const padRight = isMobile ? 25 : 30;
  const padTop = isMobile ? 30 : 28;
  const padBottom = isMobile ? 96 : 88;
  const svgWidth = Math.max(1000, numItems * (isMobile ? 26 : 28));
  const svgHeight = isMobile ? 440 : 380;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const isRibbon = state.chartMode === 'ribbon';

  let maxPlayerCumulative = Math.max(6, ...playerData.map(p => p.total));
  maxPlayerCumulative = maxPlayerCumulative <= 10
    ? Math.ceil(maxPlayerCumulative / 2) * 2
    : Math.ceil(maxPlayerCumulative / 5) * 5;

  // Max Cumulative League Total Points across all played items for ribbon mode
  const leagueCumulativeByItem = xItems.map((it, i) => {
    if (i > maxPlayedItemIdx) return 0;
    return playerData.reduce((sum, p) => sum + (p.pointsByItem[i]?.cumulative || 0), 0);
  });
  let maxLeagueCumulative = Math.max(10, ...leagueCumulativeByItem);
  maxLeagueCumulative = Math.ceil(maxLeagueCumulative / 5) * 5;

  const activeYMax = isRibbon ? maxLeagueCumulative : maxPlayerCumulative;
  const getX = (i) => padLeft + (numItems > 1 ? (i / (numItems - 1)) * chartW : chartW / 2);
  const getY = (val) => padTop + chartH - (val / activeYMax) * chartH;

  // 1. Y-Axis Grid Lines & Tick Labels
  let gridLinesSvg = '';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((activeYMax / ySteps) * i);
    const y = getY(val);
    gridLinesSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${svgWidth - padRight}" y2="${y}" stroke="${i === 0 ? 'var(--border-active)' : 'var(--border-glass)'}" stroke-dasharray="${i === 0 ? 'none' : '3,3'}" />
      <text class="chart-axis-tick" x="${padLeft - 10}" y="${y + 4}" fill="var(--text-dim)" font-size="11" font-weight="600" text-anchor="end" font-family="var(--font-main)">${val}</text>
    `;
  }

  const yAxisLineSvg = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="var(--border-active)" stroke-width="1.5" />`;

  const yLabelX = 20;
  const yLabelY = padTop + (chartH / 2);
  const yAxisLabelSvg = `
    <text class="chart-axis-label" x="${yLabelX}" y="${yLabelY}" transform="rotate(-90, ${yLabelX}, ${yLabelY})" fill="var(--text-muted)" font-size="11" font-weight="700" letter-spacing="0.12em" text-anchor="middle" font-family="var(--font-title)">${isRibbon ? 'CUMULATIVE POINTS' : 'POINTS'}</text>
  `;

  // 2. X-Axis Baseline & Multilevel Interactive Ticks
  const xAxisLineSvg = `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${svgWidth - padRight}" y2="${padTop + chartH}" stroke="var(--border-active)" stroke-width="1.5" />`;

  const yBase = padTop + chartH;
  let xLabelsSvg = '';
  xItems.forEach((it, i) => {
    const x = getX(i);
    const isPlayed = i <= maxPlayedItemIdx;

    if (it.type === 'match') {
      const f = it.fixture;
      const homeCrestUrl = getCrestUrl(f.home_code);
      const awayCrestUrl = getCrestUrl(f.away_code);
      xLabelsSvg += `
        <g class="chart-match-tick-group" data-item-idx="${i}" data-gw="${it.gw}" data-match-id="${f.id}" role="button" tabindex="0" style="cursor: pointer;" title="${f.home_name} vs ${f.away_name} (Click to collapse)">
          <rect class="chart-match-tick-bg" x="${x - 12}" y="${yBase + 4}" width="24" height="44" rx="4" fill="rgba(255,255,255,0.02)" stroke="transparent" />
          <line x1="${x}" y1="${yBase}" x2="${x}" y2="${yBase + 4}" stroke="${isPlayed ? 'var(--accent-cyan)' : 'var(--border-glass)'}" stroke-width="${isPlayed ? '1.5' : '1'}" />
          <image href="${homeCrestUrl}" x="${x - 7.5}" y="${yBase + 5}" width="15" height="15" preserveAspectRatio="xMidYMid meet" />
          <text class="chart-axis-tick" x="${x}" y="${yBase + 27}" fill="var(--text-dim)" font-size="7.5" font-weight="700" text-anchor="middle" font-family="var(--font-main)">vs</text>
          <image href="${awayCrestUrl}" x="${x - 7.5}" y="${yBase + 30}" width="15" height="15" preserveAspectRatio="xMidYMid meet" />
        </g>
      `;
    } else {
      xLabelsSvg += `
        <g class="chart-gw-tick-group" data-item-idx="${i}" data-gw="${it.gw}" role="button" tabindex="0" style="cursor: pointer;" title="GW ${it.gw} (Click to expand inline)">
          <rect class="chart-gw-tick-bg" x="${x - 13}" y="${yBase + 4}" width="26" height="42" rx="4" fill="rgba(255,255,255,0.02)" stroke="transparent" />
          <line x1="${x}" y1="${yBase}" x2="${x}" y2="${yBase + 5}" stroke="${isPlayed ? 'var(--accent-purple)' : 'var(--border-glass)'}" stroke-width="${isPlayed ? '1.5' : '1'}" />
          <text class="chart-axis-tick chart-gw-tick-text" x="${x}" y="${yBase + 24}" fill="${isPlayed ? 'var(--text-main)' : 'var(--text-dim)'}" font-size="10" font-weight="${isPlayed ? '700' : '500'}" text-anchor="middle" font-family="var(--font-main)">${it.gw}</text>
        </g>
      `;
    }
  });

  // Level 2: Gameweek Grouping Band
  let gwGroupsSvg = '';
  const expandedGws = new Set();
  xItems.forEach(it => {
    if (it.type === 'match') expandedGws.add(it.gw);
  });

  expandedGws.forEach(gwNum => {
    const matchIndices = xItems
      .map((it, idx) => (it.type === 'match' && it.gw === gwNum ? idx : -1))
      .filter(idx => idx !== -1);

    if (matchIndices.length > 0) {
      const firstIdx = matchIndices[0];
      const lastIdx = matchIndices[matchIndices.length - 1];
      const xLeft = getX(firstIdx) - 8;
      const xRight = getX(lastIdx) + 8;
      const yGroup = yBase + 49;
      const midX = (xLeft + xRight) / 2;

      gwGroupsSvg += `
        <g class="chart-gw-group-level" data-gw="${gwNum}" role="button" tabindex="0" style="cursor:pointer;" title="GW ${gwNum} (Click to collapse)" onclick="window.toggleChartExpandedGW(${gwNum})">
          <path d="M ${xLeft},${yGroup} L ${xLeft},${yGroup + 4} L ${xRight},${yGroup + 4} L ${xRight},${yGroup}" fill="none" stroke="var(--accent-purple)" stroke-width="1.2" opacity="0.65" />
          <rect x="${midX - 25}" y="${yGroup + 6}" width="50" height="18" rx="4" fill="rgba(168, 85, 247, 0.18)" stroke="rgba(168, 85, 247, 0.55)" stroke-width="1" />
          <text x="${midX}" y="${yGroup + 19}" fill="#e9d5ff" font-size="10" font-weight="800" text-anchor="middle" font-family="var(--font-title)" letter-spacing="0.05em">GW ${gwNum}</text>
        </g>
      `;
    }
  });

  xItems.forEach((it, i) => {
    const x = getX(i);
    if (it.type === 'gw') {
      gwGroupsSvg += `
        <text class="chart-axis-tick chart-gw-subtick-text" x="${x}" y="${yBase + 66}" fill="var(--text-dim)" font-size="8" font-weight="700" text-anchor="middle" font-family="var(--font-main)" opacity="0.75">GW</text>
      `;
    }
  });

  let linesSvg = '';
  let markersSvg = '';
  const hasActivePlayer = state.auth.activePlayerId != null && (state.auth.role === 'player' || (state.auth.role === 'admin' && state.auth.activePlayerId));

  const sortedPlayersForSvg = [...playerData].sort((a, b) => {
    const isYouA = state.auth.activePlayerId === a.id ? 1 : 0;
    const isYouB = state.auth.activePlayerId === b.id ? 1 : 0;
    return isYouA - isYouB;
  });

  function comparePlayersAtItem(a, b, itIdx) {
    const ptA = a.pointsByItem[itIdx] || { cumulative: 0, gwPts: 0 };
    const ptB = b.pointsByItem[itIdx] || { cumulative: 0, gwPts: 0 };

    if (ptB.cumulative !== ptA.cumulative) {
      return ptB.cumulative - ptA.cumulative;
    }
    if (typeof SCORING_TIERS !== 'undefined' && Array.isArray(SCORING_TIERS)) {
      for (const t of SCORING_TIERS) {
        const countA = ptA.cumulativeTiers?.[`t${t.tier}`] || 0;
        const countB = ptB.cumulativeTiers?.[`t${t.tier}`] || 0;
        if (countB !== countA) return countB - countA;
      }
    }
    if ((ptB.gwPts || 0) !== (ptA.gwPts || 0)) {
      return (ptB.gwPts || 0) - (ptA.gwPts || 0);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  if (isRibbon) {
    // ─── CUMULATIVE STACKED RIBBON CHART (POWER BI DESIGN) ──────────────────
    const N = playerData.length;
    const ribbonColW = numItems > 1 ? Math.min(32, Math.max(16, chartW / (numItems * 1.8))) : 38;
    const minSegmentH = 4; // subtle sliver for 0-pt players so ribbon tracks cleanly
    const totalMinH = N * minSegmentH;
    const availableH = Math.max(0, chartH - totalMinH);
    const ptsScale = maxLeagueCumulative > 0 ? availableH / maxLeagueCumulative : 0;

    // Calculate layout coordinates per item
    const ribbonLayout = []; // ribbonLayout[itIdx][playerId] = { yTop, yBot, h, xLeft, xRight, cx, rank, cumulative }

    xItems.forEach((it, i) => {
      ribbonLayout[i] = {};
      if (i > maxPlayedItemIdx) return;

      // Sort players by cumulative rank & scoring tier tie-breakers (Rank #1 at top)
      const rankedList = [...playerData].sort((a, b) => comparePlayersAtItem(a, b, i));

      // Calculate heights for each player based on CUMULATIVE points up to this item
      const segmentHeights = rankedList.map(p => {
        const cumPts = p.pointsByItem[i]?.cumulative || 0;
        return minSegmentH + (cumPts * ptsScale);
      });

      const totalColH = segmentHeights.reduce((sum, h) => sum + h, 0);
      const colBaseline = padTop + chartH;
      const colTop = colBaseline - totalColH;

      let currY = colTop;
      rankedList.forEach((p, rIdx) => {
        const segH = segmentHeights[rIdx];
        const pt = p.pointsByItem[i] || { cumulative: 0 };
        const cx = getX(i);

        ribbonLayout[i][p.id] = {
          xLeft: cx - ribbonColW / 2,
          xRight: cx + ribbonColW / 2,
          cx,
          yTop: currY,
          yBot: currY + segH,
          h: segH,
          rank: rIdx + 1,
          cumulative: pt.cumulative,
          player: p
        };
        currY += segH;
      });
    });

    // 1. Draw Connecting Ribbons between consecutive Items
    let ribbonGradientsSvg = '<defs>';
    let ribbonFillsSvg = '';
    let ribbonOutlinesSvg = '';

    for (let i = 0; i < maxPlayedItemIdx; i++) {
      sortedPlayersForSvg.forEach(p => {
        const seg1 = ribbonLayout[i]?.[p.id];
        const seg2 = ribbonLayout[i + 1]?.[p.id];
        if (!seg1 || !seg2) return;

        const isYou = state.auth.activePlayerId === p.id;
        const gradId = `ribbon_flow_${p.id}_${i}`;

        // Horizontal fading gradient across the ribbon flow
        ribbonGradientsSvg += `
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.75' : '0.45'}" />
            <stop offset="50%" stop-color="${p.color}" stop-opacity="${isYou ? '0.55' : '0.28'}" />
            <stop offset="100%" stop-color="${p.color}" stop-opacity="${isYou ? '0.75' : '0.45'}" />
          </linearGradient>
        `;

        const x1 = seg1.xRight - 0.5;
        const x2 = seg2.xLeft + 0.5;
        const y1_top = seg1.yTop + (seg1.h * 0.07);
        const y1_bot = seg1.yTop + (seg1.h * 0.93);
        const y2_top = seg2.yTop + (seg2.h * 0.07);
        const y2_bot = seg2.yTop + (seg2.h * 0.93);
        const dx = (x2 - x1) * 0.5;

        const fillD = `M ${x1},${y1_top} C ${x1 + dx},${y1_top} ${x2 - dx},${y2_top} ${x2},${y2_top} L ${x2},${y2_bot} C ${x2 - dx},${y2_bot} ${x1 + dx},${y1_bot} ${x1},${y1_bot} Z`;
        const topD = `M ${x1},${y1_top} C ${x1 + dx},${y1_top} ${x2 - dx},${y2_top} ${x2},${y2_top}`;
        const botD = `M ${x1},${y1_bot} C ${x1 + dx},${y1_bot} ${x2 - dx},${y2_bot} ${x2},${y2_bot}`;

        const darkAccent = darkenHex(p.color, 0.45);
        const ribbonStroke = darkAccent;
        const ribbonStrokeW = isYou ? '1.1' : '0.75';
        const ribbonStrokeOpacity = isYou ? '0.95' : '0.65';
        const ribbonShadow = isYou ? `style="filter: drop-shadow(0 0 3px ${darkAccent});"` : '';

        ribbonFillsSvg += `
          <path class="ribbon-band" d="${fillD}" fill="url(#${gradId})" stroke="none" />
        `;

        ribbonOutlinesSvg += `
          <path class="ribbon-contour" d="${topD}" fill="none" stroke="${ribbonStroke}" stroke-width="${ribbonStrokeW}" stroke-opacity="${ribbonStrokeOpacity}" stroke-linecap="round" ${ribbonShadow} />
          <path class="ribbon-contour" d="${botD}" fill="none" stroke="${ribbonStroke}" stroke-width="${ribbonStrokeW}" stroke-opacity="${ribbonStrokeOpacity}" stroke-linecap="round" ${ribbonShadow} />
        `;
      });
    }

    // Add pillar vertical gradients for each player
    sortedPlayersForSvg.forEach(p => {
      const isYou = state.auth.activePlayerId === p.id;
      ribbonGradientsSvg += `
        <linearGradient id="pillar_vgrad_${p.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.95' : '0.78'}" />
          <stop offset="100%" stop-color="${p.color}" stop-opacity="${isYou ? '0.72' : '0.50'}" />
        </linearGradient>
      `;
    });

    ribbonGradientsSvg += '</defs>';
    linesSvg = ribbonGradientsSvg + ribbonFillsSvg + ribbonOutlinesSvg;

    // 2. Draw Column Segments & Badges at each item
    for (let i = 0; i <= maxPlayedItemIdx; i++) {
      const it = xItems[i];
      sortedPlayersForSvg.forEach(p => {
        const seg = ribbonLayout[i]?.[p.id];
        if (!seg) return;

        const isYou = state.auth.activePlayerId === p.id;
        const darkAccent = darkenHex(p.color, 0.38);
        const strokeColor = darkAccent;
        const strokeW = isYou ? '1.1' : '0.75';
        const pillarShadow = isYou ? `style="filter: drop-shadow(0 0 3px ${darkAccent});"` : '';

        if (seg.h >= 15 && seg.cumulative > 0) {
          const fontSize = Math.min(12, Math.max(9.5, Math.min(seg.h * 0.52, ribbonColW * 0.48)));
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-gw="${it.gw}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="4" fill="url(#pillar_vgrad_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
              <text x="${seg.cx}" y="${seg.yTop + seg.h / 2}" dominant-baseline="central" fill="${darkAccent}" font-size="${fontSize}" font-weight="800" text-anchor="middle" font-family="var(--font-title)" letter-spacing="0.02em">${seg.cumulative}</text>
            </g>
          `;
        } else if (seg.h >= 10 && seg.cumulative > 0) {
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-gw="${it.gw}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="3" fill="url(#pillar_vgrad_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
              <text x="${seg.cx}" y="${seg.yTop + seg.h / 2}" dominant-baseline="central" fill="${darkAccent}" font-size="8.5" font-weight="800" text-anchor="middle" font-family="var(--font-title)">${seg.cumulative}</text>
            </g>
          `;
        } else {
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-gw="${it.gw}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="2" fill="url(#pillar_vgrad_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
            </g>
          `;
        }
      });
    }
  } else {
    // Stepped or Linear Chart across xItems
    let areaGradientsSvg = '<defs>';
    if (state.chartMode === 'stepped') {
      sortedPlayersForSvg.forEach(p => {
        const isYou = state.auth.activePlayerId === p.id;
        const gradId = `step_area_grad_${p.id}`;
        areaGradientsSvg += `
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.35' : '0.30'}" />
            <stop offset="100%" stop-color="${p.color}" stop-opacity="0.08" />
          </linearGradient>
        `;
      });
    }
    areaGradientsSvg += '</defs>';
    linesSvg = areaGradientsSvg + linesSvg;

    sortedPlayersForSvg.forEach(p => {
      const isYou = state.auth.activePlayerId === p.id;
      const isDotted = hasActivePlayer ? !isYou : false;
      const pts = p.pointsByItem;
      const playedPts = pts.filter((pt, i) => i <= maxPlayedItemIdx);

      const strokeWidth = isYou ? '3.5' : (hasActivePlayer ? '2' : '2.5');
      const strokeDash = isDotted ? 'stroke-dasharray="4,4"' : '';
      const opacity = isDotted ? '0.85' : '1';
      const shadowFilter = isYou
        ? `style="filter: drop-shadow(0 2px 6px ${p.color}88);"`
        : `style="filter: drop-shadow(0 1px 3px ${p.color}44);"`;

      if (playedPts.length >= 2) {
        let pathD = '';
        if (state.chartMode === 'linear') {
          const pathCoords = playedPts.map((pt, i) => `${getX(i)},${getY(pt.cumulative)}`).join(' L ');
          pathD = `M ${pathCoords}`;
        } else {
          pathD = `M ${getX(0)},${getY(playedPts[0].cumulative)}`;
          for (let i = 1; i < playedPts.length; i++) {
            const prevY = getY(playedPts[i - 1].cumulative);
            const currX = getX(i);
            const currY = getY(playedPts[i].cumulative);
            pathD += ` H ${currX} V ${currY}`;
          }
        }

        if (state.chartMode === 'stepped') {
          const firstX = getX(0);
          const lastX = getX(playedPts.length - 1);
          const baselineY = padTop + chartH;
          const areaD = `${pathD} L ${lastX},${baselineY} L ${firstX},${baselineY} Z`;
          linesSvg += `
            <path d="${areaD}" fill="url(#step_area_grad_${p.id})" opacity="${opacity}" />
          `;
        }

        linesSvg += `
          <path d="${pathD}" fill="none" stroke="${p.color}" stroke-width="${strokeWidth}" ${strokeDash} opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round" ${shadowFilter} />
        `;
      } else if (playedPts.length === 1) {
        const cx = getX(0);
        const cy = getY(playedPts[0].cumulative);
        markersSvg += `
          <circle cx="${cx}" cy="${cy}" r="${isYou ? '5.5' : '4.5'}" fill="${p.color}" stroke="#0f1629" stroke-width="2" class="chart-marker-node ${isYou ? 'chart-marker-node-you' : ''}" data-item-idx="0" />
        `;
      }

      playedPts.forEach((pt, i) => {
        const cx = getX(i);
        const cy = getY(pt.cumulative);
        const radius = isYou ? 4.5 : 3.5;
        const strokeW = isYou ? 2 : 1.5;
        const nodeClass = isYou ? 'chart-marker-node chart-marker-node-you' : 'chart-marker-node';

        markersSvg += `
          <g class="chart-marker-group" data-item-idx="${i}" data-gw="${xItems[i]?.gw}" style="cursor:pointer;">
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${p.color}" stroke="#0f1629" stroke-width="${strokeW}" class="${nodeClass}" data-item-idx="${i}" />
          </g>
        `;
      });
    });
  }

  const itemStandings = xItems.map((it, i) => {
    const isPlayed = i <= maxPlayedItemIdx;
    const rankedPlayers = [...playerData].sort((a, b) => comparePlayersAtItem(a, b, i));
    const list = rankedPlayers.map((p, rIdx) => {
      const pt = p.pointsByItem[i] || { cumulative: 0 };
      const prevPt = i > 0 ? (p.pointsByItem[i - 1] || { cumulative: 0 }) : null;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        pt,
        cumulative: pt.cumulative,
        prevCumulative: prevPt ? prevPt.cumulative : null,
        rank: rIdx + 1,
        isYou: state.auth.activePlayerId === p.id
      };
    });

    return {
      itemIdx: i,
      xItem: it,
      isPlayed,
      x: getX(i),
      players: list
    };
  });

  let crosshairsSvg = '';
  let hitboxesSvg = '';
  const colWidth = numItems > 1 ? chartW / (numItems - 1) : chartW;

  xItems.forEach((it, i) => {
    const cx = getX(i);
    crosshairsSvg += `
      <line id="chartCrosshair_${i}" class="chart-crosshair" x1="${cx}" y1="${padTop}" x2="${cx}" y2="${padTop + chartH}" stroke="rgba(56, 189, 248, 0.45)" stroke-width="1.5" stroke-dasharray="3,3" style="display:none;" />
    `;

    const boxX = numItems > 1
      ? (i === 0 ? padLeft - 10 : cx - colWidth / 2)
      : padLeft;
    const boxW = numItems > 1
      ? (i === 0 || i === numItems - 1 ? colWidth / 2 + 10 : colWidth)
      : chartW;

    hitboxesSvg += `
      <rect class="chart-col-hitbox" data-item-idx="${i}" data-gw="${it.gw}" x="${boxX}" y="${padTop}" width="${boxW}" height="${chartH}" fill="transparent" style="cursor: pointer;" />
    `;
  });

  wrapper.innerHTML = `
    <div class="chart-scroll-container" style="position: relative; display: inline-block; min-width: ${svgWidth}px; width: ${svgWidth}px;">
      <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" style="width:${svgWidth}px; min-width:${svgWidth}px; height:${svgHeight}px; display:block;">
        <!-- Grid & Axes -->
        ${gridLinesSvg}
        ${yAxisLineSvg}
        ${yAxisLabelSvg}
        ${xAxisLineSvg}
        ${gwGroupsSvg}
        ${xLabelsSvg}
        ${crosshairsSvg}
        <!-- Lines / Ribbons -->
        ${linesSvg}
        <!-- Data Markers & Nodes -->
        ${markersSvg}
        <!-- Column Hitboxes -->
        ${hitboxesSvg}
      </svg>
      <div class="chart-tooltip" style="display:none; position: absolute; pointer-events: none; z-index: 100;"></div>
    </div>
  `;

  attachAllGwTooltipHandlers(itemStandings, svgWidth);
}

function attachAllGwTooltipHandlers(itemStandings, svgWidth) {
  const container = document.querySelector('#chartWrapper .chart-scroll-container') || document.getElementById('chartWrapper');
  if (!container) return;

  const tooltip = container.querySelector('.chart-tooltip');
  if (!tooltip || !itemStandings?.length) return;

  function showGWTooltip(idx) {
    const data = itemStandings[idx];
    if (!data) return;

    document.querySelectorAll('.chart-crosshair').forEach((line, i) => {
      line.style.display = i === idx ? 'block' : 'none';
    });

    document.querySelectorAll('.chart-marker-node').forEach(node => {
      const nodeIdx = parseInt(node.getAttribute('data-item-idx'), 10);
      if (nodeIdx === idx) {
        node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '6.5' : '5.5');
      } else {
        node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '4.5' : '3.5');
      }
    });

    const it = data.xItem;

    if (it.type === 'match') {
      const f = it.fixture;
      const scoreInfo = getMatchScoreInfo(f);
      const scoreStr = scoreInfo.hasScore ? `${scoreInfo.home} – ${scoreInfo.away}` : 'vs';
      const homeShort = f.home_short || getClubDetails(f.home_name)?.short || f.home_name.slice(0, 3).toUpperCase();
      const awayShort = f.away_short || getClubDetails(f.away_name)?.short || f.away_name.slice(0, 3).toUpperCase();

      tooltip.innerHTML = `
        <div class="chart-tooltip-header">
          <span>⚽ GW ${it.gw} · Match ${it.matchIdx + 1} of ${it.totalMatchesInGw}</span>
        </div>
        <div class="chart-tooltip-matchup">
          <span class="tooltip-team-badge" title="${f.home_name}">
            ${getCrestImg(f.home_code, f.home_name)}
            <span>${homeShort}</span>
          </span>
          <span class="matchup-score ${scoreInfo.isLive ? 'is-live' : ''}">${scoreStr}</span>
          <span class="tooltip-team-badge" title="${f.away_name}">
            <span>${awayShort}</span>
            ${getCrestImg(f.away_code, f.away_name)}
          </span>
        </div>
        <div class="chart-tooltip-list">
          ${data.players.map(p => {
        let matchPtsStr = '';
        if (data.isPlayed) {
          const tierStr = p.pt.matchTier ? ` · T${p.pt.matchTier}` : '';
          matchPtsStr = `<span class="chart-tooltip-gw-pts" style="${p.pt.matchPts > 0 ? '' : 'color:var(--text-dim);'}" title="Points from this match">(+${p.pt.matchPts}${tierStr})</span>`;
        }
        return `
              <div class="chart-tooltip-row ${p.isYou ? 'is-you' : ''}">
                <div class="chart-tooltip-player" style="display:flex; align-items:center; gap:6px;">
                  <span style="font-size:0.72rem; color:var(--text-dim); font-weight:800; font-family:var(--font-title); min-width:18px;">#${p.rank || '–'}</span>
                  <span class="chart-tooltip-dot" style="background:${p.color};"></span>
                  <span style="color:${p.color}; font-weight:600;">${p.name}${p.isYou ? ' (You)' : ''}</span>
                </div>
                <div class="chart-tooltip-scores">
                  <span class="chart-tooltip-cum-pts" title="Total Points">${p.cumulative} pts</span>
                  ${matchPtsStr}
                </div>
              </div>
            `;
      }).join('')}
        </div>
        <div class="chart-tooltip-drilldown-hint">👆 Click match to collapse GW ${it.gw}</div>
      `;
    } else if (!data.isPlayed) {
      tooltip.innerHTML = `
        <div class="chart-tooltip-header">
          <span>📅 GW ${it.gw} (Upcoming)</span>
        </div>
        <div class="chart-tooltip-list">
          ${data.players.map(p => `
            <div class="chart-tooltip-row ${p.isYou ? 'is-you' : ''}">
              <div class="chart-tooltip-player" style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.72rem; color:var(--text-dim); font-weight:800; font-family:var(--font-title); min-width:18px;">#${p.rank || '–'}</span>
                <span class="chart-tooltip-dot" style="background:${p.color};"></span>
                <span style="color:${p.color}; font-weight:600;">${p.name}${p.isYou ? ' (You)' : ''}</span>
              </div>
              <div class="chart-tooltip-scores">
                <span class="chart-tooltip-cum-pts">${p.cumulative} pts</span>
                <span class="chart-tooltip-gw-pts" style="color:var(--text-dim);">(–)</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="chart-tooltip-drilldown-hint">👆 Click to expand GW ${it.gw} matches inline</div>
      `;
    } else {
      tooltip.innerHTML = `
        <div class="chart-tooltip-header">
          <span>📅 GW ${it.gw} Standings</span>
        </div>
        <div class="chart-tooltip-list">
          ${data.players.map(p => `
            <div class="chart-tooltip-row ${p.isYou ? 'is-you' : ''}">
              <div class="chart-tooltip-player" style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.72rem; color:var(--text-dim); font-weight:800; font-family:var(--font-title); min-width:18px;">#${p.rank || '–'}</span>
                <span class="chart-tooltip-dot" style="background:${p.color};"></span>
                <span style="color:${p.color}; font-weight:600;">${p.name}${p.isYou ? ' (You)' : ''}</span>
              </div>
              <div class="chart-tooltip-scores">
                <span class="chart-tooltip-cum-pts">${p.cumulative} pts</span>
                <span class="chart-tooltip-gw-pts" style="${p.pt.gwPts > 0 ? '' : 'color:var(--text-dim);'}">(+${p.pt.gwPts || 0})</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="chart-tooltip-drilldown-hint">👆 Click to expand GW ${it.gw} matches inline</div>
      `;
    }

    const targetX = data.x;
    const tooltipWidth = 240;

    if (targetX + tooltipWidth + 20 > svgWidth) {
      tooltip.style.left = `${Math.max(8, targetX - tooltipWidth - 14)}px`;
    } else {
      tooltip.style.left = `${targetX + 14}px`;
    }
    tooltip.style.top = '14px';
    tooltip.style.display = 'block';
  }

  function hideGWTooltip() {
    tooltip.style.display = 'none';
    document.querySelectorAll('.chart-crosshair').forEach(line => {
      line.style.display = 'none';
    });
    document.querySelectorAll('.chart-marker-node').forEach(node => {
      node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '4.5' : '3.5');
    });
  }

  container.querySelectorAll('.chart-col-hitbox, .chart-marker-group, .chart-gw-tick-group, .chart-match-tick-group, .ribbon-seg-group').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showGWTooltip(idx);
    });

    el.addEventListener('mousemove', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showGWTooltip(idx);
    });

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const gwVal = el.getAttribute('data-gw');
      if (gwVal && gwVal !== '0') {
        toggleChartExpandedGW(Number(gwVal));
      }
    });

    el.addEventListener('touchstart', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showGWTooltip(idx);
    }, { passive: true });
  });

  container.addEventListener('mouseleave', () => {
    hideGWTooltip();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      hideGWTooltip();
    }
  });
}

// ─── VIEW B: Gameweek Match-by-Match Chart (Isolated Drilldown) ────────────────
function renderGameweekMatchesChart(gw) {
  const wrapper = document.getElementById('chartWrapper');
  const legendContainer = document.getElementById('chartLegend');
  const chartSubtitle = document.getElementById('chartSubtitle');
  const selectedTeams = getSelectedTeams();

  const rawGwFixtures = state.fixtures[gw] ?? [];
  const fixtures = filterFixturesByGroupAndTeam(rawGwFixtures);

  if (chartSubtitle) {
    if (selectedTeams.length === 1) {
      const details = getClubDetails(selectedTeams[0]);
      chartSubtitle.textContent = `Match-by-match progression for GW ${gw} · Matches involving ${selectedTeams[0]} (${details?.shortName || ''})`;
    } else if (selectedTeams.length > 1) {
      chartSubtitle.textContent = `Match-by-match progression for GW ${gw} · Matches involving ${selectedTeams.length} Teams (${selectedTeams.join(', ')})`;
    } else {
      chartSubtitle.textContent = `Match-by-match points progression for GW ${gw} (${fixtures.length} matches sorted by kickoff)`;
    }
  }

  const legendPanel = document.getElementById('chartLegendPanel');
  if (fixtures.length === 0) {
    wrapper.innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--text-muted);">
        No matches found for GW ${gw} matching current group/team filter.<br/>
        <button class="btn btn-sm btn-outline" style="margin-top:14px;" onclick="window.setChartDrilldown(null)">← Back to Season Overview</button>
      </div>`;
    legendContainer.innerHTML = '';
    if (legendPanel) legendPanel.style.display = 'none';
    return;
  }
  if (legendPanel) legendPanel.style.display = 'flex';

  // 1. Sort matches chronologically by kickoff time
  const sortedMatches = [...fixtures].sort((a, b) => {
    const timeA = a.kickoff_time ? new Date(a.kickoff_time).getTime() : Infinity;
    const timeB = b.kickoff_time ? new Date(b.kickoff_time).getTime() : Infinity;
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || 0) - (b.id || 0);
  });

  // Construct match xItems for this GW
  const xItems = [];
  sortedMatches.forEach((f, mIdx) => {
    xItems.push({
      type: 'match',
      matchIdx: mIdx,
      totalMatchesInGw: sortedMatches.length,
      fixture: f,
      gw,
      isPlayed: isMatchActiveOrFinished(f),
      isLive: isMatchOngoing(f)
    });
  });

  const activeItemIndices = xItems
    .map((it, idx) => (it.isPlayed ? idx : -1))
    .filter(idx => idx !== -1);
  const maxPlayedItemIdx = activeItemIndices.length > 0 ? Math.max(...activeItemIndices) : 0;

  // 2. Compute match-by-match points for each player
  const playerData = state.players.map(p => {
    let gwCumulative = 0;
    const pointsByItem = [];

    xItems.forEach((it, idx) => {
      const f = it.fixture;
      const scoreInfo = getMatchScoreInfo(f);
      const pred = state.predictions[`${f.id}_${p.id}`];
      let matchPts = 0;
      let matchTier = null;
      let matchBonuses = [];
      let hasPred = false;
      let predHome = null;
      let predAway = null;

      if (pred && pred.predicted_home !== null && pred.predicted_away !== null && pred.predicted_home !== undefined && pred.predicted_home !== '' && pred.predicted_away !== '') {
        hasPred = true;
        predHome = Number(pred.predicted_home);
        predAway = Number(pred.predicted_away);
        if (scoreInfo.hasScore) {
          const res = evaluatePrediction(scoreInfo.home, scoreInfo.away, predHome, predAway);
          if (res) {
            matchPts = res.total;
            matchTier = res.tier;
            matchBonuses = res.activeBonuses || [];
          }
        }
      }

      gwCumulative += matchPts;

      pointsByItem.push({
        type: 'match',
        matchIdx: it.matchIdx,
        fixture: f,
        hasPred,
        predHome,
        predAway,
        matchPts,
        matchTier,
        matchBonuses,
        gwCumulative,
        cumulative: gwCumulative
      });
    });

    return {
      id: p.id,
      name: p.name,
      color: getPlayerColor(p),
      totalGw: gwCumulative,
      total: gwCumulative,
      pointsByItem
    };
  });

  // Render match-by-match Legend
  const sortedLegendPlayers = [...playerData].sort((a, b) => {
    const isYouA = state.auth.activePlayerId === a.id;
    const isYouB = state.auth.activePlayerId === b.id;
    if (isYouA && !isYouB) return -1;
    if (!isYouA && isYouB) return 1;
    if (b.totalGw !== a.totalGw) return b.totalGw - a.totalGw;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  legendContainer.innerHTML = sortedLegendPlayers.map(p => {
    const isYou = state.auth.activePlayerId === p.id;
    return `
      <div class="chart-legend-chip ${isYou ? 'active' : ''}">
        <span class="legend-dot" style="background: ${p.color};"></span>
        <span>${p.name}${isYou ? ' (You)' : ''}</span>
        <span class="legend-pts">${p.totalGw} pts</span>
      </div>
    `;
  }).join('');

  const numItems = xItems.length;
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const padLeft = isMobile ? 65 : 75;
  const padRight = isMobile ? 65 : 75;
  const padTop = isMobile ? 30 : 28;
  const padBottom = isMobile ? 120 : 112;
  const svgWidth = Math.max(1000, numItems * (isMobile ? 100 : 115) + padLeft + padRight);
  const svgHeight = isMobile ? 470 : 420;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const isRibbon = state.chartMode === 'ribbon';

  let maxPlayerCumulative = Math.max(6, ...playerData.map(p => p.totalGw));
  maxPlayerCumulative = maxPlayerCumulative <= 10 ? Math.ceil(maxPlayerCumulative / 2) * 2 : Math.ceil(maxPlayerCumulative / 5) * 5;

  const leagueCumulativeByItem = xItems.map((it, i) => {
    if (i > maxPlayedItemIdx) return 0;
    return playerData.reduce((sum, p) => sum + (p.pointsByItem[i]?.gwCumulative || 0), 0);
  });
  let maxLeagueCumulative = Math.max(10, ...leagueCumulativeByItem);
  maxLeagueCumulative = Math.ceil(maxLeagueCumulative / 5) * 5;

  const activeYMax = isRibbon ? maxLeagueCumulative : maxPlayerCumulative;
  const getX = (i) => padLeft + (numItems > 1 ? (i / (numItems - 1)) * chartW : chartW / 2);
  const getY = (val) => padTop + chartH - (val / activeYMax) * chartH;

  // 1. Y-Axis Grid Lines & Tick Labels
  let gridLinesSvg = '';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((activeYMax / ySteps) * i);
    const y = getY(val);
    gridLinesSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${svgWidth - padRight}" y2="${y}" stroke="${i === 0 ? 'var(--border-active)' : 'var(--border-glass)'}" stroke-dasharray="${i === 0 ? 'none' : '3,3'}" />
      <text class="chart-axis-tick" x="${padLeft - 10}" y="${y + 4}" fill="var(--text-dim)" font-size="11" font-weight="600" text-anchor="end" font-family="var(--font-main)">${val}</text>
    `;
  }

  const yAxisLineSvg = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="var(--border-active)" stroke-width="1.5" />`;

  const yLabelX = 20;
  const yLabelY = padTop + (chartH / 2);
  const yAxisLabelSvg = `
    <text class="chart-axis-label" x="${yLabelX}" y="${yLabelY}" transform="rotate(-90, ${yLabelX}, ${yLabelY})" fill="var(--text-muted)" font-size="11" font-weight="700" letter-spacing="0.12em" text-anchor="middle" font-family="var(--font-title)">${isRibbon ? 'CUMULATIVE POINTS' : `GW ${gw} POINTS`}</text>
  `;

  // 2. X-Axis Baseline & Rich Detailed Match Cards
  const xAxisLineSvg = `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${svgWidth - padRight}" y2="${padTop + chartH}" stroke="var(--border-active)" stroke-width="1.5" />`;

  const yBase = padTop + chartH;
  const colSpacing = numItems > 1 ? chartW / (numItems - 1) : chartW;
  const cardW = Math.min(84, Math.max(68, colSpacing - 12));
  const cardH = 70;

  let xLabelsSvg = '';
  xItems.forEach((it, i) => {
    const x = getX(i);
    const isPlayed = i <= maxPlayedItemIdx;
    const f = it.fixture;
    const homeShort = f.home_short || getClubDetails(f.home_name)?.short || f.home_name.slice(0, 3).toUpperCase();
    const awayShort = f.away_short || getClubDetails(f.away_name)?.short || f.away_name.slice(0, 3).toUpperCase();
    const homeCrestUrl = getCrestUrl(f.home_code);
    const awayCrestUrl = getCrestUrl(f.away_code);
    const scoreInfo = getMatchScoreInfo(f);
    const isLive = it.isLive;

    const cardX = x - (cardW / 2);
    const cardY = yBase + 6;

    let dateStr = '';
    let timeStr = '';
    if (f.kickoff_time) {
      const d = new Date(f.kickoff_time);
      const tz = state.timezone || 'UTC';
      try {
        dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
        timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      } catch (e) {
        dateStr = '';
        timeStr = '';
      }
    }

    const dateDisplay = dateStr ? (timeStr ? `${dateStr} · ${timeStr}` : dateStr) : `Match ${it.matchIdx + 1}`;
    const liveIndicatorSvg = isLive ? `<text x="${x}" y="${cardY + 54}" fill="#f87171" font-size="7" font-weight="800" text-anchor="middle" font-family="var(--font-title)">🔴 LIVE</text>` : '';

    xLabelsSvg += `
      <g class="chart-match-tick-group" data-item-idx="${i}" data-match-idx="${it.matchIdx}" role="button" tabindex="0" style="cursor: pointer;" title="${f.home_name} vs ${f.away_name} · Click to inspect match details">
        <!-- Detailed Match Card Background (Frameless / No Outline) -->
        <rect class="chart-match-tick-bg" x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="6" fill="${isLive ? 'rgba(239, 68, 68, 0.1)' : (isPlayed ? 'rgba(15, 23, 42, 0.65)' : 'rgba(15, 23, 42, 0.4)')}" />
        
        <!-- Date & Kickoff Time Header -->
        <text x="${x}" y="${cardY + 14}" fill="var(--text-dim)" font-size="7.5" font-weight="700" text-anchor="middle" font-family="var(--font-main)">${dateDisplay}</text>

        <!-- Crests & Matchup Center -->
        <image href="${homeCrestUrl}" x="${cardX + 7}" y="${cardY + 22}" width="18" height="18" preserveAspectRatio="xMidYMid meet" />
        <text x="${x}" y="${cardY + 35}" fill="${scoreInfo.hasScore ? 'var(--accent-cyan)' : 'var(--text-dim)'}" font-size="${scoreInfo.hasScore ? '10' : '8.5'}" font-weight="800" text-anchor="middle" font-family="var(--font-title)">${scoreInfo.hasScore ? `${scoreInfo.home} - ${scoreInfo.away}` : 'vs'}</text>
        <image href="${awayCrestUrl}" x="${cardX + cardW - 25}" y="${cardY + 22}" width="18" height="18" preserveAspectRatio="xMidYMid meet" />

        <!-- Team Short Codes -->
        <text x="${cardX + 16}" y="${cardY + 54}" fill="var(--text-main)" font-size="8.5" font-weight="700" text-anchor="middle" font-family="var(--font-title)">${homeShort}</text>
        ${liveIndicatorSvg}
        <text x="${cardX + cardW - 16}" y="${cardY + 54}" fill="var(--text-main)" font-size="8.5" font-weight="700" text-anchor="middle" font-family="var(--font-title)">${awayShort}</text>
      </g>
    `;
  });

  // Level 2: Spanning GW # bracket
  let gwGroupsSvg = '';
  if (xItems.length > 0) {
    const colWidth = numItems > 1 ? chartW / (numItems - 1) : chartW;
    const cardW = Math.min(84, Math.max(68, colWidth - 12));
    const cardH = 70;
    const xLeft = getX(0) - (cardW / 2);
    const xRight = getX(xItems.length - 1) + (cardW / 2);
    const yGroup = yBase + cardH + 10;
    const midX = (xLeft + xRight) / 2;

    gwGroupsSvg += `
      <g class="chart-gw-group-level" data-gw="${gw}">
        <path d="M ${xLeft},${yGroup} L ${xLeft},${yGroup + 4} L ${xRight},${yGroup + 4} L ${xRight},${yGroup}" fill="none" stroke="var(--accent-purple)" stroke-width="1.2" opacity="0.65" />
        <rect x="${midX - 55}" y="${yGroup + 6}" width="110" height="18" rx="4" fill="rgba(168, 85, 247, 0.18)" stroke="rgba(168, 85, 247, 0.55)" stroke-width="1" />
        <text x="${midX}" y="${yGroup + 19}" fill="#e9d5ff" font-size="9.5" font-weight="800" text-anchor="middle" font-family="var(--font-title)" letter-spacing="0.05em">GW ${gw} · ${sortedMatches.length} Matches</text>
      </g>
    `;
  }

  let linesSvg = '';
  let markersSvg = '';
  const hasActivePlayer = state.auth.activePlayerId != null && (state.auth.role === 'player' || (state.auth.role === 'admin' && state.auth.activePlayerId));

  const sortedPlayersForSvg = [...playerData].sort((a, b) => {
    const isYouA = state.auth.activePlayerId === a.id ? 1 : 0;
    const isYouB = state.auth.activePlayerId === b.id ? 1 : 0;
    return isYouA - isYouB;
  });

  function comparePlayersAtMatch(a, b, itIdx) {
    const ptA = a.pointsByItem[itIdx] || { gwCumulative: 0, matchPts: 0 };
    const ptB = b.pointsByItem[itIdx] || { gwCumulative: 0, matchPts: 0 };

    if (ptB.gwCumulative !== ptA.gwCumulative) {
      return ptB.gwCumulative - ptA.gwCumulative;
    }
    if ((ptB.matchPts || 0) !== (ptA.matchPts || 0)) {
      return (ptB.matchPts || 0) - (ptA.matchPts || 0);
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  if (isRibbon) {
    const N = playerData.length;
    const ribbonColW = numItems > 1 ? Math.min(36, Math.max(18, chartW / (numItems * 1.8))) : 38;
    const minSegmentH = 4;
    const totalMinH = N * minSegmentH;
    const availableH = Math.max(0, chartH - totalMinH);
    const ptsScale = maxLeagueCumulative > 0 ? availableH / maxLeagueCumulative : 0;

    const ribbonLayout = [];

    xItems.forEach((it, i) => {
      ribbonLayout[i] = {};
      if (i > maxPlayedItemIdx) return;

      const rankedList = [...playerData].sort((a, b) => comparePlayersAtMatch(a, b, i));

      const segmentHeights = rankedList.map(p => {
        const cumPts = p.pointsByItem[i]?.gwCumulative || 0;
        return minSegmentH + (cumPts * ptsScale);
      });

      const totalColH = segmentHeights.reduce((sum, h) => sum + h, 0);
      const colBaseline = padTop + chartH;
      const colTop = colBaseline - totalColH;

      let currY = colTop;
      rankedList.forEach((p, rIdx) => {
        const segH = segmentHeights[rIdx];
        const pt = p.pointsByItem[i] || { gwCumulative: 0 };
        const cx = getX(i);

        ribbonLayout[i][p.id] = {
          xLeft: cx - ribbonColW / 2,
          xRight: cx + ribbonColW / 2,
          cx,
          yTop: currY,
          yBot: currY + segH,
          h: segH,
          rank: rIdx + 1,
          gwCumulative: pt.gwCumulative,
          player: p
        };
        currY += segH;
      });
    });
    // 1. Draw Connecting Ribbons between consecutive matches
    let ribbonGradientsSvg = '<defs>';
    let ribbonFillsSvg = '';
    let ribbonOutlinesSvg = '';

    for (let i = 0; i < maxPlayedItemIdx; i++) {
      sortedPlayersForSvg.forEach(p => {
        const seg1 = ribbonLayout[i]?.[p.id];
        const seg2 = ribbonLayout[i + 1]?.[p.id];
        if (!seg1 || !seg2) return;

        const isYou = state.auth.activePlayerId === p.id;
        const gradId = `ribbon_flow_m_${p.id}_${i}`;

        ribbonGradientsSvg += `
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.75' : '0.45'}" />
            <stop offset="50%" stop-color="${p.color}" stop-opacity="${isYou ? '0.55' : '0.28'}" />
            <stop offset="100%" stop-color="${p.color}" stop-opacity="${isYou ? '0.75' : '0.45'}" />
          </linearGradient>
        `;

        const x1 = seg1.xRight - 0.5;
        const x2 = seg2.xLeft + 0.5;
        const y1_top = seg1.yTop + (seg1.h * 0.03);
        const y1_bot = seg1.yTop + (seg1.h * 0.97);
        const y2_top = seg2.yTop + (seg2.h * 0.03);
        const y2_bot = seg2.yTop + (seg2.h * 0.97);
        const dx = (x2 - x1) * 0.5;

        const fillD = `M ${x1},${y1_top} C ${x1 + dx},${y1_top} ${x2 - dx},${y2_top} ${x2},${y2_top} L ${x2},${y2_bot} C ${x2 - dx},${y2_bot} ${x1 + dx},${y1_bot} ${x1},${y1_bot} Z`;
        const topD = `M ${x1},${y1_top} C ${x1 + dx},${y1_top} ${x2 - dx},${y2_top} ${x2},${y2_top}`;
        const botD = `M ${x1},${y1_bot} C ${x1 + dx},${y1_bot} ${x2 - dx},${y2_bot} ${x2},${y2_bot}`;

        const darkAccent = darkenHex(p.color, 0.45);
        const ribbonStroke = darkAccent;
        const ribbonStrokeW = isYou ? '1.1' : '0.75';
        const ribbonStrokeOpacity = isYou ? '0.95' : '0.65';
        const ribbonShadow = isYou ? `style="filter: drop-shadow(0 0 3px ${darkAccent});"` : '';

        ribbonFillsSvg += `
          <path class="ribbon-band" d="${fillD}" fill="url(#${gradId})" stroke="none" />
        `;

        ribbonOutlinesSvg += `
          <path class="ribbon-contour" d="${topD}" fill="none" stroke="${ribbonStroke}" stroke-width="${ribbonStrokeW}" stroke-opacity="${ribbonStrokeOpacity}" stroke-linecap="round" ${ribbonShadow} />
          <path class="ribbon-contour" d="${botD}" fill="none" stroke="${ribbonStroke}" stroke-width="${ribbonStrokeW}" stroke-opacity="${ribbonStrokeOpacity}" stroke-linecap="round" ${ribbonShadow} />
        `;
      });
    }

    sortedPlayersForSvg.forEach(p => {
      const isYou = state.auth.activePlayerId === p.id;
      ribbonGradientsSvg += `
        <linearGradient id="pillar_vgrad_m_${p.id}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.95' : '0.78'}" />
          <stop offset="100%" stop-color="${p.color}" stop-opacity="${isYou ? '0.72' : '0.50'}" />
        </linearGradient>
      `;
    });

    ribbonGradientsSvg += '</defs>';
    linesSvg = ribbonGradientsSvg + ribbonFillsSvg + ribbonOutlinesSvg;

    for (let i = 0; i <= maxPlayedItemIdx; i++) {
      sortedPlayersForSvg.forEach(p => {
        const seg = ribbonLayout[i]?.[p.id];
        if (!seg) return;

        const isYou = state.auth.activePlayerId === p.id;
        const darkAccent = darkenHex(p.color, 0.38);
        const strokeColor = darkAccent;
        const strokeW = isYou ? '1.1' : '0.75';
        const pillarShadow = isYou ? `style="filter: drop-shadow(0 0 3px ${darkAccent});"` : '';

        if (seg.h >= 15 && seg.gwCumulative > 0) {
          const fontSize = Math.min(12, Math.max(9.5, Math.min(seg.h * 0.52, ribbonColW * 0.48)));
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="4" fill="url(#pillar_vgrad_m_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
              <text x="${seg.cx}" y="${seg.yTop + seg.h / 2}" dominant-baseline="central" fill="${darkAccent}" font-size="${fontSize}" font-weight="800" text-anchor="middle" font-family="var(--font-title)" letter-spacing="0.02em">${seg.gwCumulative}</text>
            </g>
          `;
        } else if (seg.h >= 10 && seg.gwCumulative > 0) {
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="3" fill="url(#pillar_vgrad_m_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
              <text x="${seg.cx}" y="${seg.yTop + seg.h / 2}" dominant-baseline="central" fill="${darkAccent}" font-size="8.5" font-weight="800" text-anchor="middle" font-family="var(--font-title)">${seg.gwCumulative}</text>
            </g>
          `;
        } else {
          markersSvg += `
            <g class="ribbon-seg-group" data-item-idx="${i}" data-player-id="${p.id}">
              <rect x="${seg.xLeft}" y="${seg.yTop}" width="${ribbonColW}" height="${seg.h}" rx="2" fill="url(#pillar_vgrad_m_${p.id})" stroke="${strokeColor}" stroke-width="${strokeW}" ${pillarShadow} />
            </g>
          `;
        }
      });
    }
  } else {
    // Stepped or Linear Match Chart
    let areaGradientsSvg = '<defs>';
    if (state.chartMode === 'stepped') {
      sortedPlayersForSvg.forEach(p => {
        const isYou = state.auth.activePlayerId === p.id;
        const gradId = `step_area_grad_m_${p.id}`;
        areaGradientsSvg += `
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${p.color}" stop-opacity="${isYou ? '0.35' : '0.30'}" />
            <stop offset="100%" stop-color="${p.color}" stop-opacity="0.08" />
          </linearGradient>
        `;
      });
    }
    areaGradientsSvg += '</defs>';
    linesSvg = areaGradientsSvg + linesSvg;

    sortedPlayersForSvg.forEach(p => {
      const isYou = state.auth.activePlayerId === p.id;
      const isDotted = hasActivePlayer ? !isYou : false;
      const pts = p.pointsByItem;
      const playedPts = pts.filter((pt, m) => m <= maxPlayedItemIdx);

      const strokeWidth = isYou ? '3.5' : (hasActivePlayer ? '2' : '2.5');
      const strokeDash = isDotted ? 'stroke-dasharray="4,4"' : '';
      const opacity = isDotted ? '0.85' : '1';
      const shadowFilter = isYou
        ? `style="filter: drop-shadow(0 2px 6px ${p.color}88);"`
        : `style="filter: drop-shadow(0 1px 3px ${p.color}44);"`;

      if (playedPts.length >= 2) {
        let pathD = '';
        if (state.chartMode === 'linear') {
          const pathCoords = playedPts.map((pt, m) => `${getX(m)},${getY(pt.gwCumulative)}`).join(' L ');
          pathD = `M ${pathCoords}`;
        } else {
          pathD = `M ${getX(0)},${getY(playedPts[0].gwCumulative)}`;
          for (let m = 1; m < playedPts.length; m++) {
            const prevY = getY(playedPts[m - 1].gwCumulative);
            const currX = getX(m);
            const currY = getY(playedPts[m].gwCumulative);
            pathD += ` H ${currX} V ${currY}`;
          }
        }

        if (state.chartMode === 'stepped') {
          const firstX = getX(0);
          const lastX = getX(playedPts.length - 1);
          const baselineY = padTop + chartH;
          const areaD = `${pathD} L ${lastX},${baselineY} L ${firstX},${baselineY} Z`;
          linesSvg += `
            <path d="${areaD}" fill="url(#step_area_grad_m_${p.id})" opacity="${opacity}" />
          `;
        }

        linesSvg += `
          <path d="${pathD}" fill="none" stroke="${p.color}" stroke-width="${strokeWidth}" ${strokeDash} opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round" ${shadowFilter} />
        `;
      } else if (playedPts.length === 1) {
        const cx = getX(0);
        const cy = getY(playedPts[0].gwCumulative);
        markersSvg += `
          <circle cx="${cx}" cy="${cy}" r="${isYou ? '5.5' : '4.5'}" fill="${p.color}" stroke="#0f1629" stroke-width="2" class="chart-marker-node ${isYou ? 'chart-marker-node-you' : ''}" data-item-idx="0" />
        `;
      }

      playedPts.forEach((pt, m) => {
        const cx = getX(m);
        const cy = getY(pt.gwCumulative);
        const radius = isYou ? 4.5 : 3.5;
        const strokeW = isYou ? 2 : 1.5;
        const nodeClass = isYou ? 'chart-marker-node chart-marker-node-you' : 'chart-marker-node';

        markersSvg += `
          <g class="chart-marker-group" data-item-idx="${m}" style="cursor:pointer;">
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${p.color}" stroke="#0f1629" stroke-width="${strokeW}" class="${nodeClass}" data-item-idx="${m}" />
          </g>
        `;
      });
    });
  }

  // Calculate standings per item for match tooltips
  const matchStandings = xItems.map((it, i) => {
    const isPlayed = i <= maxPlayedItemIdx;
    const rankedPlayers = [...playerData].sort((a, b) => comparePlayersAtMatch(a, b, i));

    const list = rankedPlayers.map((p, rIdx) => {
      const pt = p.pointsByItem[i] || { gwCumulative: 0, matchPts: 0, hasPred: false };
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        matchPts: pt.matchPts || 0,
        matchTier: pt.matchTier,
        matchBonuses: pt.matchBonuses,
        hasPred: pt.hasPred,
        predHome: pt.predHome,
        predAway: pt.predAway,
        gwCumulative: pt.gwCumulative || 0,
        rank: rIdx + 1,
        isYou: state.auth.activePlayerId === p.id
      };
    });

    return {
      itemIdx: i,
      xItem: it,
      fixture: it.fixture,
      gw,
      isPlayed,
      isLive: it.isLive,
      scoreInfo: it.fixture ? getMatchScoreInfo(it.fixture) : null,
      x: getX(i),
      players: list
    };
  });

  let crosshairsSvg = '';
  let hitboxesSvg = '';
  const colWidth = numItems > 1 ? chartW / (numItems - 1) : chartW;

  xItems.forEach((it, i) => {
    const cx = getX(i);
    crosshairsSvg += `
      <line id="chartCrosshair_m_${i}" class="chart-crosshair" x1="${cx}" y1="${padTop}" x2="${cx}" y2="${padTop + chartH}" stroke="rgba(56, 189, 248, 0.45)" stroke-width="1.5" stroke-dasharray="3,3" style="display:none;" />
    `;

    const boxX = numItems > 1
      ? (i === 0 ? padLeft - 10 : cx - colWidth / 2)
      : padLeft;
    const boxW = numItems > 1
      ? (i === 0 || i === numItems - 1 ? colWidth / 2 + 10 : colWidth)
      : chartW;

    hitboxesSvg += `
      <rect class="chart-col-hitbox" data-item-idx="${i}" x="${boxX}" y="${padTop}" width="${boxW}" height="${chartH}" fill="transparent" style="cursor: pointer;" />
    `;
  });

  wrapper.innerHTML = `
    <div class="chart-scroll-container" style="position: relative; display: inline-block; min-width: ${svgWidth}px; width: ${svgWidth}px;">
      <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" style="width:${svgWidth}px; min-width:${svgWidth}px; height:${svgHeight}px; display:block;">
        <!-- Grid & Axes -->
        ${gridLinesSvg}
        ${yAxisLineSvg}
        ${yAxisLabelSvg}
        ${xAxisLineSvg}
        ${gwGroupsSvg}
        ${xLabelsSvg}
        ${crosshairsSvg}
        <!-- Lines / Ribbons -->
        ${linesSvg}
        <!-- Data Markers & Nodes -->
        ${markersSvg}
        <!-- Hitboxes -->
        ${hitboxesSvg}
      </svg>
      <div class="chart-tooltip" style="display: none; position: absolute; pointer-events: none; z-index: 100;"></div>
    </div>
  `;

  attachMatchTooltipHandlers(matchStandings, svgWidth);
}

function attachMatchTooltipHandlers(matchStandings, svgWidth) {
  const container = document.querySelector('#chartWrapper .chart-scroll-container') || document.getElementById('chartWrapper');
  if (!container) return;

  const tooltip = container.querySelector('.chart-tooltip');
  if (!tooltip || !matchStandings?.length) return;

  function showMatchTooltip(mIdx) {
    const data = matchStandings[mIdx];
    if (!data) return;

    document.querySelectorAll('.chart-crosshair').forEach((line, idx) => {
      line.style.display = idx === mIdx ? 'block' : 'none';
    });

    document.querySelectorAll('.chart-marker-node').forEach(node => {
      const nodeM = parseInt(node.getAttribute('data-item-idx'), 10);
      if (nodeM === mIdx) {
        node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '6.5' : '5.5');
      } else {
        node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '4.5' : '3.5');
      }
    });

    const f = data.fixture;
    const scoreInfo = getMatchScoreInfo(f);
    const scoreStr = scoreInfo?.hasScore ? `${scoreInfo.home} – ${scoreInfo.away}` : 'vs';
    const homeShort = f.home_short || getClubDetails(f.home_name)?.short || f.home_name.slice(0, 3).toUpperCase();
    const awayShort = f.away_short || getClubDetails(f.away_name)?.short || f.away_name.slice(0, 3).toUpperCase();

    tooltip.innerHTML = `
      <div class="chart-tooltip-header">
        <span>⚽ GW ${data.gw} · Match ${data.matchIdx + 1} of ${data.totalMatches}</span>
      </div>
      <div class="chart-tooltip-matchup">
        <span class="tooltip-team-badge" title="${f.home_name}">
          ${getCrestImg(f.home_code, f.home_name)}
          <span>${homeShort}</span>
        </span>
        <span class="matchup-score ${scoreInfo?.isLive ? 'is-live' : ''}">${scoreStr}</span>
        <span class="tooltip-team-badge" title="${f.away_name}">
          <span>${awayShort}</span>
          ${getCrestImg(f.away_code, f.away_name)}
        </span>
      </div>
      <div class="chart-tooltip-list">
        ${data.players.map(p => {
      let matchPtsStr = '';
      if (data.isPlayed) {
        const tierStr = p.matchTier ? ` · T${p.matchTier}` : '';
        matchPtsStr = `<span class="chart-tooltip-gw-pts" style="${p.matchPts > 0 ? '' : 'color:var(--text-dim);'}" title="Points from this match">(+${p.matchPts}${tierStr})</span>`;
      }
      return `
            <div class="chart-tooltip-row ${p.isYou ? 'is-you' : ''}">
              <div class="chart-tooltip-player" style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:0.72rem; color:var(--text-dim); font-weight:800; font-family:var(--font-title); min-width:18px;">#${p.rank || '–'}</span>
                <span class="chart-tooltip-dot" style="background:${p.color};"></span>
                <span style="color:${p.color}; font-weight:600;">${p.name}${p.isYou ? ' (You)' : ''}</span>
              </div>
              <div class="chart-tooltip-scores">
                <span class="chart-tooltip-cum-pts" title="GW Points up to this match">${p.gwCumulative} pts</span>
                ${matchPtsStr}
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;

    const targetX = data.x;
    const tooltipWidth = 240;

    if (targetX + tooltipWidth + 20 > svgWidth) {
      tooltip.style.left = `${Math.max(8, targetX - tooltipWidth - 14)}px`;
    } else {
      tooltip.style.left = `${targetX + 14}px`;
    }
    tooltip.style.top = '14px';
    tooltip.style.display = 'block';
  }

  function hideMatchTooltip() {
    tooltip.style.display = 'none';
    document.querySelectorAll('.chart-crosshair').forEach(line => {
      line.style.display = 'none';
    });
    document.querySelectorAll('.chart-marker-node').forEach(node => {
      node.setAttribute('r', node.classList.contains('chart-marker-node-you') ? '4.5' : '3.5');
    });
  }

  container.querySelectorAll('.chart-col-hitbox, .chart-marker-group, .chart-match-tick-group, .ribbon-seg-group').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showMatchTooltip(idx);
    });

    el.addEventListener('mousemove', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showMatchTooltip(idx);
    });

    el.addEventListener('touchstart', () => {
      const idx = parseInt(el.getAttribute('data-item-idx'), 10);
      showMatchTooltip(idx);
    }, { passive: true });
  });

  container.addEventListener('mouseleave', () => {
    hideMatchTooltip();
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      hideMatchTooltip();
    }
  });
}

// ─── Interactive Points Tooltip & Rules Popover ──────────────────────────────
let tooltipPopoverEl = null;
let tooltipBackdropEl = null;
let activeTooltipTarget = null;

function renderPointsTooltip(matchId, playerId, isGeneralRulesOnly) {
  return generatePointsTooltipContent(matchId, playerId, isGeneralRulesOnly);
}

function generatePointsTooltipContent(matchId, playerId, isGeneralRulesOnly) {
  if (isGeneralRulesOnly) {
    return `
      <span class="pts-sheet-handle"></span>
      <div class="pts-tooltip-header">
        <div class="pts-tooltip-header-left">
          <div class="pts-tooltip-title-wrap">
            <div class="pts-tooltip-icon-badge" style="background:rgba(56, 189, 248, 0.15); border-color:rgba(56, 189, 248, 0.35);">📖</div>
            <div class="pts-tooltip-title-meta">
              <div class="pts-tooltip-title-row">
                <span class="pts-tooltip-tier-name">Scoring Engine Rules</span>
              </div>
              <div class="pts-tooltip-sub-label">Official Premier League Prediction System</div>
            </div>
          </div>
        </div>
        <button class="pts-tooltip-close-btn" id="ptsTooltipCloseBtn" aria-label="Close rules guide">✕</button>
      </div>

      <div class="pts-rules-section" style="border-top:none; padding-top:0;">
        <div class="pts-rules-title">
          <span>🏆 Base Points</span>
          <span class="pts-rules-sub">Highest achieved tier awarded</span>
        </div>
        <div class="pts-rules-list">
          ${SCORING_TIERS.map(t => `
            <div class="pts-rule-row tier-${t.tier}">
              <div class="pts-rule-icon-box tier-${t.tier}">${renderIconElement(t.icon, t.icon_type, 22)}</div>
              <div class="pts-rule-body">
                <div class="pts-rule-top">
                  <span class="pts-rule-name">${t.name}</span>
                </div>
                <div class="pts-rule-short">${t.desc}</div>
                ${renderExampleContainer(t.example)}
              </div>
              <div class="pts-rule-pts pts-p${t.pts}">+${t.pts} pts</div>
            </div>
          `).join('')}
        </div>

        <div class="pts-rules-title" style="margin-top:16px;">
          <span>🔥 Additive Bonus Points</span>
          <span class="pts-rules-sub">Stackable on correct outcomes</span>
        </div>
        <div class="pts-rules-list">
          ${SCORING_BONUSES.map(b => `
            <div class="pts-rule-row bonus-row">
              <div class="pts-rule-icon-box bonus-box">${renderIconElement(b.icon, b.icon_type, 22)}</div>
              <div class="pts-rule-body">
                <div class="pts-rule-top">
                  <span class="pts-rule-name">${b.name}</span>
                </div>
                <div class="pts-rule-short">${b.desc}</div>
                ${renderExampleContainer(b.example)}
              </div>
              <div class="pts-rule-pts pts-bonus">+${b.pts} pt</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Find fixture
  let fixture = null;
  for (const gw in state.fixtures) {
    const found = state.fixtures[gw]?.find(item => item.id === matchId);
    if (found) { fixture = found; break; }
  }

  // Find player
  const player = state.players.find(p => p.id === playerId) || state.masterPlayers.find(p => p.id === playerId) || { id: playerId, name: 'Player' };
  const isYou = state.auth.activePlayerId === playerId;
  const pColor = getPlayerColor(player);

  // Prediction data
  const pred = state.predictions[`${matchId}_${playerId}`];
  const pH = (pred?.predicted_home !== null && pred?.predicted_home !== undefined && pred?.predicted_home !== '') ? Number(pred.predicted_home) : null;
  const pA = (pred?.predicted_away !== null && pred?.predicted_away !== undefined && pred?.predicted_away !== '') ? Number(pred.predicted_away) : null;

  const scoreInfo = getMatchScoreInfo(fixture);
  const isLive = scoreInfo.isLive;
  const isFinished = scoreInfo.isFinished;

  const actH = scoreInfo.home;
  const actA = scoreInfo.away;

  const breakdown = getPredictionBreakdown(actH, actA, pH, pA, isLive);

  const homeCrest = fixture ? getCrestImg(fixture.home_code, fixture.home_name) : '';
  const awayCrest = fixture ? getCrestImg(fixture.away_code, fixture.away_name) : '';
  const matchTitle = fixture ? `${fixture.home_name} vs ${fixture.away_name}` : 'Premier League Match';
  const gwText = fixture?.event ? `GW ${fixture.event}` : '';

  let earnedPtsHtml = '';
  if (breakdown.status === 'evaluated') {
    if (isLive) {
      earnedPtsHtml = `<div class="pts-score-total-val live" style="color:#ff5572;">+${breakdown.total}</div><span style="font-size:0.68rem; font-weight:700; color:#ff5572; text-transform:uppercase;"><span class="live-pulse-dot" style="width:5px;height:5px;display:inline-block;margin-right:3px;"></span>Live Pts</span>`;
    } else {
      earnedPtsHtml = `<div class="pts-score-total-val">+${breakdown.total}</div><span style="font-size:0.68rem; font-weight:700; color:var(--accent-green); text-transform:uppercase;">Points</span>`;
    }
  } else if (breakdown.status === 'no_prediction') {
    earnedPtsHtml = `<div class="pts-score-total-val" style="color:var(--accent-rose);">0</div><span style="font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">No Pred</span>`;
  } else {
    earnedPtsHtml = `<div class="pts-score-total-val" style="color:var(--text-dim); font-size:1.05rem;">-</div><span style="font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Upcoming</span>`;
  }

  let formulaHtml = '';
  if (breakdown.status === 'evaluated') {
    const items = [];
    items.push(`<span class="pts-formula-item">${renderIconElement(breakdown.tierInfo.icon, breakdown.tierInfo.icon_type, 16)} ${breakdown.tierInfo.name} (+${breakdown.eval.base} pts)</span>`);
    for (const b of breakdown.bonuses) {
      items.push(`<span class="pts-formula-item bonus">${renderIconElement(b.icon, b.icon_type, 16)} ${b.name} (+${b.pts} pt)</span>`);
    }
    const cardTitle = isLive ? '⚡ Live Score Breakdown (Match in progress)' : '⚡ How This Score Was Achieved';
    const totalColor = isLive ? '#ff5572' : 'var(--accent-green)';
    formulaHtml = `
      <div class="pts-breakdown-card ${isLive ? 'live-breakdown' : ''}">
        <div class="pts-breakdown-card-title" ${isLive ? 'style="color:#ff5572;"' : ''}>${cardTitle}</div>
        <div class="pts-breakdown-formula">${items.join('<span style="color:var(--text-dim);"> + </span>')} <span style="color:${totalColor}; font-weight:800; margin-left:4px;">= ${breakdown.total} Pts Total ${isLive ? '(Live)' : ''}</span></div>
        <div class="pts-breakdown-explanation">${breakdown.explanation}</div>
      </div>
    `;
  } else if (breakdown.status === 'no_prediction') {
    formulaHtml = `
      <div class="pts-breakdown-card" style="border-color:rgba(244,63,94,0.3); background:rgba(244,63,94,0.06);">
        <div class="pts-breakdown-card-title" style="color:var(--accent-rose);">⚠️ Prediction Status</div>
        <div class="pts-breakdown-explanation" style="color:var(--text-main);">No score prediction was entered by ${player.name} for this match (0 points awarded).</div>
      </div>
    `;
  } else {
    formulaHtml = `
      <div class="pts-breakdown-card" style="border-color:rgba(56,189,248,0.3); background:rgba(56,189,248,0.05);">
        <div class="pts-breakdown-card-title">⏳ Match Upcoming</div>
        <div class="pts-breakdown-explanation">Prediction submitted: <strong style="color:var(--text-main); font-family:var(--font-title);">${breakdown.predScore || 'None'}</strong>. Points will be automatically computed dynamically as the match kicks off and progresses.</div>
      </div>
    `;
  }

  const scoreBoxLabel = isLive ? 'Current Score (Live)' : (isFinished ? 'Final Result' : 'Actual Result');
  const scoreBoxColor = actH !== null ? (isLive ? '#ff5572' : 'var(--accent-cyan)') : 'var(--text-dim)';
  const scoreBoxValue = actH !== null
    ? (isLive ? `<span class="live-pulse-dot" style="margin-right:4px;"></span>${actH} – ${actA}` : `${actH} – ${actA}`)
    : (fixture && isLocked(fixture) ? 'Locked' : 'Open');

  return `
    <span class="pts-sheet-handle"></span>
    <div class="pts-tooltip-header">
      <div class="pts-tooltip-header-left">
        <div class="pts-tooltip-match-title">
          ${homeCrest}
          <span>${matchTitle}</span>
          ${awayCrest}
          ${gwText ? `<span style="color:var(--accent-purple); font-size:0.75rem; font-weight:700;">(${gwText})</span>` : ''}
        </div>
        ${fixture?.home_stadium ? `<div class="pts-tooltip-venue-line" style="font-size:0.72rem; color:var(--text-dim); margin-top:2px;">🏟️ ${fixture.home_stadium}${fixture.home_city ? ` · 📍 ${fixture.home_city}` : ''}</div>` : ''}
        <div class="pts-tooltip-player-tag" style="border-color:${pColor}55; color:${pColor};">
          <span class="player-color-dot" style="background:${pColor}; width:8px; height:8px; border-radius:50%; display:inline-block;"></span>
          <span>${player.name}</span>
          ${isYou ? '<span class="you-tag" style="margin-left:4px;">You</span>' : ''}
        </div>
      </div>
      <button class="pts-tooltip-close-btn" id="ptsTooltipCloseBtn" aria-label="Close breakdown">✕</button>
    </div>

    <div class="pts-tooltip-score-strip">
      <div class="pts-score-box">
        <div class="pts-score-box-label">Predicted</div>
        <div class="pts-score-box-value" style="color:${pH !== null ? 'var(--text-main)' : 'var(--text-dim)'};">${pH !== null ? `${pH} – ${pA}` : '-'}</div>
      </div>
      <div class="pts-score-sep">vs</div>
      <div class="pts-score-box">
        <div class="pts-score-box-label">${scoreBoxLabel}</div>
        <div class="pts-score-box-value" style="color:${scoreBoxColor};">${scoreBoxValue}</div>
      </div>
      <div class="pts-score-sep">=</div>
      <div class="pts-score-total-box">
        ${earnedPtsHtml}
      </div>
    </div>

    ${formulaHtml}

    <div class="pts-rules-section">
      <div class="pts-rules-title">
        <span>📖 Scoring Tiers Breakdown</span>
        <span class="pts-rules-sub">Highest achieved tier awarded</span>
      </div>
      <div class="pts-rules-list">
        ${SCORING_TIERS.map(t => {
    const isAchieved = breakdown.tierInfo && breakdown.tierInfo.tier === t.tier;
    return `
            <div class="pts-rule-row ${isAchieved ? 'active-tier' : ''} tier-${t.tier}">
              <div class="pts-rule-icon-box tier-${t.tier}">${renderIconElement(t.icon, t.icon_type, 22)}</div>
              <div class="pts-rule-body">
                <div class="pts-rule-top">
                  <span class="pts-rule-name">${t.name}</span>
                  ${isAchieved ? '<span class="pts-active-pill"><span class="pts-active-dot"></span>Awarded</span>' : ''}
                </div>
                <div class="pts-rule-short">${t.shortDesc || t.desc}</div>
                ${renderExampleContainer(t.example)}
              </div>
              <div class="pts-rule-pts pts-p${t.pts}">+${t.pts} pts</div>
            </div>
          `;
  }).join('')}
      </div>

      <div class="pts-rules-title" style="margin-top:14px;">
        <span>🔥 Multipliers & Bonus Rules</span>
        <span class="pts-rules-sub">Additive bonus points</span>
      </div>
      <div class="pts-rules-list">
        ${SCORING_BONUSES.map(b => {
    const isAchieved = breakdown.bonuses && breakdown.bonuses.some(ab => ab.type === b.type);
    return `
            <div class="pts-rule-row ${isAchieved ? 'active-tier bonus-row' : 'bonus-row'}">
              <div class="pts-rule-icon-box bonus-box">${renderIconElement(b.icon, b.icon_type, 22)}</div>
              <div class="pts-rule-body">
                <div class="pts-rule-top">
                  <span class="pts-rule-name">${b.name}</span>
                  ${isAchieved ? '<span class="pts-active-pill bonus"><span class="pts-active-dot bonus"></span>Added</span>' : ''}
                </div>
                <div class="pts-rule-short">${b.desc}</div>
                ${renderExampleContainer(b.example)}
              </div>
              <div class="pts-rule-pts pts-bonus">+${b.pts} pt</div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function renderTierHelpTooltip(tierNumber, playerName = null, count = null) {
  const tier = SCORING_TIERS.find(t => t.tier === tierNumber);
  if (!tier) return '<div style="padding:15px; color:var(--text-muted);">Tier information not found.</div>';

  return `
    <span class="pts-sheet-handle"></span>
    <div class="pts-tooltip-header">
      <div class="pts-tooltip-header-left">
        <div class="pts-tooltip-title-wrap">
          <div class="pts-tooltip-icon-badge tier-${tier.tier}">
            <span>${renderIconElement(tier.icon, tier.icon_type, 24)}</span>
          </div>
          <div class="pts-tooltip-title-meta">
            <div class="pts-tooltip-title-row">
              <span class="pts-tooltip-tier-name">${tier.name}</span>
              <span class="pts-tier-pts-pill pts-p${tier.pts}">+${tier.pts} Pts</span>
            </div>
            ${playerName ? `
              <div class="pts-tooltip-player-badge">
                <span class="pts-player-dot"></span>
                <span class="pts-player-name">${playerName}</span>
                <span class="pts-player-divider">·</span>
                <span class="pts-player-stat"><strong>${count ?? 0}</strong> matches</span>
                <span class="pts-player-pts-calc">(${(count ?? 0) * tier.pts} pts)</span>
              </div>
            ` : `<div class="pts-tooltip-sub-label">Scoring Tier ${tier.tier} of 6</div>`}
          </div>
        </div>
      </div>
      <button class="pts-tooltip-close-btn" id="ptsTooltipCloseBtn" aria-label="Close tier details">✕</button>
    </div>

    <div class="pts-requirement-card tier-${tier.tier}">
      <div class="pts-requirement-header">
        <span class="pts-requirement-icon">📋</span>
        <span class="pts-requirement-title">Tier Requirement</span>
      </div>
      <div class="pts-requirement-desc">${tier.desc}</div>
      ${renderExampleContainer(tier.example)}
    </div>

    <div class="pts-rules-section">
      <div class="pts-rules-title">
        <span>📊 All Scoring Tiers Comparison</span>
        <span class="pts-rules-sub">Highest match tier awarded</span>
      </div>
      <div class="pts-rules-list">
        ${SCORING_TIERS.map(t => {
    const isActive = t.tier === tierNumber;
    return `
            <div class="pts-rule-row ${isActive ? 'active-tier' : ''} tier-${t.tier}">
              <div class="pts-rule-icon-box tier-${t.tier}">${renderIconElement(t.icon, t.icon_type, 22)}</div>
              <div class="pts-rule-body">
                <div class="pts-rule-top">
                  <span class="pts-rule-name">${t.name}</span>
                  ${isActive ? '<span class="pts-active-pill"><span class="pts-active-dot"></span>Active Tier</span>' : ''}
                </div>
                <div class="pts-rule-short">${t.shortDesc || t.desc}</div>
                ${renderExampleContainer(t.example)}
              </div>
              <div class="pts-rule-pts pts-p${t.pts}">+${t.pts} pts</div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function positionTooltipPopover(targetEl) {
  if (!tooltipPopoverEl || window.innerWidth <= 768) {
    if (tooltipPopoverEl) {
      tooltipPopoverEl.style.top = '';
      tooltipPopoverEl.style.left = '';
      tooltipPopoverEl.style.right = '';
      tooltipPopoverEl.style.bottom = '';
    }
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  const popoverWidth = tooltipPopoverEl.offsetWidth || 390;
  const popoverHeight = tooltipPopoverEl.offsetHeight || 420;
  const margin = 12;

  let top = rect.top - 10;
  let left = rect.right + 10;

  if (left + popoverWidth > window.innerWidth - margin) {
    left = rect.left - popoverWidth - 10;
  }

  if (left < margin) {
    left = Math.max(margin, Math.min(window.innerWidth - popoverWidth - margin, rect.left + rect.width / 2 - popoverWidth / 2));
    top = rect.bottom + 10;
    if (top + popoverHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - popoverHeight - 10);
    }
  }

  top = Math.max(margin, Math.min(window.innerHeight - popoverHeight - margin, top));
  left = Math.max(margin, Math.min(window.innerWidth - popoverWidth - margin, left));

  tooltipPopoverEl.style.top = `${top}px`;
  tooltipPopoverEl.style.left = `${left}px`;
  tooltipPopoverEl.style.right = 'auto';
  tooltipPopoverEl.style.bottom = 'auto';
}

function showPointsTooltip(targetEl) {
  if (!tooltipPopoverEl) initPointsTooltip();

  const matchId = targetEl.dataset.match ? parseInt(targetEl.dataset.match, 10) : null;
  const playerId = targetEl.dataset.player ? parseInt(targetEl.dataset.player, 10) : null;
  const isRulesHelp = targetEl.dataset.rulesHelp === 'true';
  const tier = targetEl.dataset.tier ? parseInt(targetEl.dataset.tier, 10) : null;
  const playerName = targetEl.dataset.playerName || null;
  const count = targetEl.dataset.count !== undefined ? targetEl.dataset.count : null;

  activeTooltipTarget = targetEl;

  if (tier) {
    tooltipPopoverEl.innerHTML = renderTierHelpTooltip(tier, playerName, count);
  } else {
    tooltipPopoverEl.innerHTML = renderPointsTooltip(matchId, playerId, isRulesHelp);
  }

  tooltipPopoverEl.style.display = 'block';
  document.getElementById('ptsTooltipCloseBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePointsTooltip();
  });

  tooltipBackdropEl?.classList.add('show');
  positionTooltipPopover(targetEl);
}

function hidePointsTooltip() {
  if (tooltipPopoverEl) {
    tooltipPopoverEl.style.display = 'none';
    tooltipBackdropEl?.classList.remove('show');
    activeTooltipTarget = null;
  }
}

function initPointsTooltip() {
  if (!tooltipPopoverEl) {
    tooltipPopoverEl = document.createElement('div');
    tooltipPopoverEl.id = 'ptsTooltipPopover';
    tooltipPopoverEl.className = 'pts-tooltip-popover';
    tooltipPopoverEl.style.display = 'none';
    document.body.appendChild(tooltipPopoverEl);
  }

  if (!tooltipBackdropEl) {
    tooltipBackdropEl = document.createElement('div');
    tooltipBackdropEl.id = 'ptsTooltipBackdrop';
    tooltipBackdropEl.className = 'pts-tooltip-backdrop';
    document.body.appendChild(tooltipBackdropEl);
  }

  const tooltipTriggerSelector = '.pts-badge.pts-interactive, .pts-info-help, .lb-tier-th, .lb-tier-cell';

  // Touch / Click toggle handler ONLY (no hover/mouseover popups)
  document.addEventListener('click', (e) => {
    const badge = e.target.closest(tooltipTriggerSelector);
    if (badge) {
      e.preventDefault();
      e.stopPropagation();
      if (activeTooltipTarget === badge) {
        hidePointsTooltip();
      } else {
        showPointsTooltip(badge);
      }
      return;
    }

    if (tooltipPopoverEl && !tooltipPopoverEl.contains(e.target)) {
      hidePointsTooltip();
    }
  });

  // Keyboard accessibility
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePointsTooltip();
  });

  tooltipBackdropEl.addEventListener('click', () => hidePointsTooltip());

  let chartResizeTimer;
  window.addEventListener('resize', () => {
    if (activeTooltipTarget && tooltipPopoverEl.style.display !== 'none') {
      positionTooltipPopover(activeTooltipTarget);
    }
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => {
      renderCumulativeChart();
    }, 150);
  });
}

// ─── Management Page Rendering & Events ────────────────────────────────────────
function renderTeamSelectionGrid() {
  const grid = document.getElementById('mgmtTeamChipGrid');
  if (!grid) return;

  const teamNames = Object.values(state.teams).map(t => t.name).sort();
  grid.innerHTML = teamNames.map(name => {
    const teamObj = Object.values(state.teams).find(t => t.name === name);
    const code = teamObj?.code;
    const details = getClubDetails(name) || teamObj;
    const title = `${name} (${details?.shortName || ''}) - 🏟️ ${details?.stadium || 'Stadium'}, ${details?.city || 'City'}`;
    return `
      <label class="team-filter-chip" title="${title}">
        <input type="checkbox" value="${name}" class="mgmt-team-checkbox">
        ${getCrestImg(code, name)}
        <span class="team-name-full">${name}</span>
        <span class="team-name-short">${details?.shortName || name.slice(0, 3).toUpperCase()}</span>
      </label>
    `;
  }).join('');

  grid.querySelectorAll('.mgmt-team-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const chip = cb.closest('.team-filter-chip');
      if (cb.checked) chip.classList.add('selected');
      else chip.classList.remove('selected');
    });
  });
}

// ─── SCORING RULES ENGINE & VIEWS ───────────────────────────────────────────
/**
 * Load scoring rules from the API and hydrate SCORING_TIERS / SCORING_BONUSES.
 */
async function loadAndApplyScoringRules() {
  try {
    const rules = await apiFetchScoringRules();
    if (Array.isArray(rules) && rules.length > 0) {
      updateScoringRulesState(rules);
    }
  } catch (err) {
    console.warn('Could not load scoring rules from API — using defaults:', err.message);
  }
}

/**
 * Render the static scoring view (scoringView page) — tiers + bonuses summary grid.
 * Called when navigating to the scoring tab.
 */
/**
 * Render the static scoring view (scoringView page) — tiers + bonuses summary grid.
 * Called when navigating to the scoring tab.
 */
function renderScoringViewSummary() {
  const tiersGrid = document.getElementById('scoringTiersSummaryGrid');
  const bonusesGrid = document.getElementById('scoringBonusesSummaryGrid');
  const editBtn = document.getElementById('openScoringRulesEditorBtn');

  // Show/hide admin edit button
  if (editBtn) {
    editBtn.style.display = state.auth?.role === 'admin' ? 'flex' : 'none';
  }

  if (tiersGrid) {
    tiersGrid.innerHTML = SCORING_TIERS.map(t => {
      const ruleObj = {
        rule_type: 'tier',
        min_goals_enabled: t.minGoalsEnabled,
        min_goals: t.minGoals,
        min_goals_mode: t.minGoalsMode,
        goal_diff_enabled: t.goalDiffEnabled,
        goal_diff: t.goalDiff,
        short_desc: t.shortDesc,
        desc: t.desc
      };
      const exPreset = generateLowestScenarioPreset(ruleObj);
      const exDisplay = t.example || exPreset.exampleStr;

      return `
        <div class="glass-card scoring-rule-card tier-${t.tier}">
          <div class="rule-icon" style="font-size: 2rem; line-height: 1;">${renderIconElement(t.icon, t.icon_type, 36)}</div>
          <div class="rule-title">Tier ${t.tier} — ${t.name}</div>
          <div class="rule-pts">${t.pts} ${t.pts === 1 ? 'Pt' : 'Pts'}</div>
          <p class="rule-desc">${t.desc || t.shortDesc || ''}</p>
          <div class="rule-example-box">
            <div class="rule-example-header">
              <span class="rule-example-icon">💡</span>
              <span class="rule-example-title">Example Scenario <span style="font-weight:400; font-size:0.75rem; color:var(--text-dim);">(Lowest score threshold)</span></span>
            </div>
            <div class="rule-example-body">
              ${renderExampleChipsFromString(exDisplay)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (bonusesGrid) {
    bonusesGrid.innerHTML = SCORING_BONUSES.map((b, idx) => {
      const ruleObj = {
        rule_type: 'bonus',
        min_goals_enabled: b.minGoalsEnabled,
        min_goals: b.minGoals,
        min_goals_mode: b.minGoalsMode,
        goal_diff_enabled: b.goalDiffEnabled,
        goal_diff: b.goalDiff,
        short_desc: b.shortDesc,
        desc: b.desc
      };
      const exPreset = generateLowestScenarioPreset(ruleObj);
      const exDisplay = b.example || exPreset.exampleStr;

      return `
        <div class="glass-card scoring-rule-card bonus-${idx + 1}">
          <div class="rule-icon" style="font-size: 2rem;">${renderIconElement(b.icon, b.icon_type, 36)}</div>
          <div class="rule-title">${b.name}</div>
          <div class="rule-pts">+${b.pts} ${b.pts === 1 ? 'Pt' : 'Pts'}</div>
          <p class="rule-desc">${b.desc || b.shortDesc || ''}</p>
          <div class="rule-example-box">
            <div class="rule-example-header">
              <span class="rule-example-icon">💡</span>
              <span class="rule-example-title">Example Scenario <span style="font-weight:400; font-size:0.75rem; color:var(--text-dim);">(Lowest score threshold)</span></span>
            </div>
            <div class="rule-example-body">
              ${renderExampleChipsFromString(exDisplay)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Simulator and Scenarios Matrix
  renderSimulatorPresets();
  updateScoreSimulator();
  renderComprehensiveScenariosMatrix();
}

/**
 * Render example "Actual VS Predicted" chips from a string like "Actual 3–1 | Predicted 3–1"
 */
function renderExampleChipsFromString(exStr) {
  if (!exStr) return '';
  const parts = exStr.split('|');
  if (parts.length < 2) {
    return `<div style="font-size:0.85rem; color:var(--text-muted);">${exStr}</div>`;
  }
  const actualPart = (parts[0] || '').replace(/^Actual\s*/i, '').trim();
  const predPart = (parts[1] || '').replace(/^Predicted\s*/i, '').trim();
  const extraCalc = parts[2] ? `<span class="example-calc-pill">${parts[2].trim()}</span>` : '';
  return `
    <div class="example-flex-row">
      <div class="example-chip actual-chip"><span class="example-chip-tag">Actual</span> <span class="example-chip-val">${actualPart}</span></div>
      <span class="example-vs-badge">VS</span>
      <div class="example-chip pred-chip"><span class="example-chip-tag">Predicted</span> <span class="example-chip-val">${predPart}</span></div>
      ${extraCalc}
    </div>`;
}

/**
 * Comprehensive scenarios dataset for sample matrix evaluation.
 */
const SCENARIO_SAMPLES = [
  { actH: 2, actA: 2, predH: 2, predA: 2, note: 'Exact draw scoreline with high goals' },
  { actH: 3, actA: 1, predH: 3, predA: 1, note: 'Exact scoreline with 4 total goals' },
  { actH: 1, actA: 1, predH: 1, predA: 1, note: 'Exact draw scoreline' },
  { actH: 1, actA: 0, predH: 1, predA: 0, note: 'Exact match scoreline' },
  { actH: 3, actA: 2, predH: 2, predA: 1, note: 'Correct winner & goal margin (+1 GD) in 5-goal match' },
  { actH: 3, actA: 1, predH: 2, predA: 0, note: 'Correct winner & goal margin (+2 GD)' },
  { actH: 2, actA: 2, predH: 1, predA: 1, note: 'Correct draw outcome, different score' },
  { actH: 3, actA: 1, predH: 3, predA: 0, note: 'Correct outcome & exact home team goals' },
  { actH: 3, actA: 1, predH: 4, predA: 0, note: 'Correct outcome with high scoring prediction' },
  { actH: 2, actA: 0, predH: 3, predA: 0, note: 'Correct outcome only' },
  { actH: 3, actA: 1, predH: 1, predA: 1, note: 'Incorrect outcome, exact away goals matched' },
  { actH: 3, actA: 1, predH: 0, predA: 2, note: 'Incorrect outcome and zero goals matched' }
];

/**
 * Dynamically render the Comprehensive Scenarios Matrix sorted by points in descending order.
 */
function renderComprehensiveScenariosMatrix() {
  const tbody = document.getElementById('scoringWorkedExamplesBody');
  if (!tbody) return;

  // Evaluate and dynamically build scenario results
  const evaluatedScenarios = SCENARIO_SAMPLES.map(s => {
    const res = evaluatePrediction(s.actH, s.actA, s.predH, s.predA);
    const tierObj = SCORING_TIERS.find(t => t.tier === res.tier) || SCORING_TIERS[SCORING_TIERS.length - 1];
    return {
      ...s,
      res,
      tierObj,
      total: res.total
    };
  });

  // Sort strictly by total points descending
  evaluatedScenarios.sort((a, b) => b.total - a.total);

  tbody.innerHTML = evaluatedScenarios.map(item => {
    const { actH, actA, predH, predA, res, tierObj, total, note } = item;
    const totalGoals = actH + actA;

    const highScoringHtml = res.highScoringBonus > 0
      ? `<span class="pts-pill p-bonus">+${res.highScoringBonus}</span>`
      : `<span style="color:var(--text-dim);">—</span>`;

    const drawBonusHtml = res.drawBonus > 0
      ? `<span class="pts-pill p-bonus">+${res.drawBonus}</span>`
      : `<span style="color:var(--text-dim);">—</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">${actH} – ${actA}</div>
          <div style="color:var(--text-muted); font-size:0.75rem;">Total ${totalGoals} goals</div>
        </td>
        <td>
          <div style="font-weight:700; font-size:0.95rem; color:var(--accent-cyan);">${predH} – ${predA}</div>
          <div style="color:var(--text-muted); font-size:0.75rem;">${note}</div>
        </td>
        <td>
          <span class="pts-badge ${tierObj.badgeClass}" style="display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:0.82rem; padding:4px 10px;">
            ${renderIconElement(tierObj.icon, tierObj.icon_type, 18)}
            <span>${tierObj.name}</span>
          </span>
        </td>
        <td style="text-align:center; font-weight:700; font-size:0.9rem; color:var(--text-main);">
          ${res.base} ${res.base === 1 ? 'Pt' : 'Pts'}
        </td>
        <td style="text-align:center;">
          ${highScoringHtml}
        </td>
        <td style="text-align:center;">
          ${drawBonusHtml}
        </td>
        <td style="text-align:center;">
          <strong style="color:var(--accent-green); font-size:1.15rem; font-family:var(--font-title);">${total} ${total === 1 ? 'Pt' : 'Pts'}</strong>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Dynamically render the Score Simulator preset buttons based on active rules.
 */
function renderSimulatorPresets() {
  const container = document.querySelector('.sim-presets-chips');
  if (!container) return;

  const presets = [
    { label: '🎯 Bullseye (3–1 vs 3–1)', actH: 3, actA: 1, predH: 3, predA: 1 }
  ];

  // Dynamically generate lowest score threshold presets for all active bonus rules!
  SCORING_BONUSES.forEach(b => {
    const presetInfo = generateLowestScenarioPreset({
      rule_type: 'bonus',
      min_goals_enabled: b.minGoalsEnabled,
      min_goals: b.minGoals,
      min_goals_mode: b.minGoalsMode,
      goal_diff_enabled: b.goalDiffEnabled,
      goal_diff: b.goalDiff
    });
    const match = presetInfo.exampleStr.match(/Actual\s+(\d+)–(\d+)/i);
    if (match) {
      const h = parseInt(match[1], 10);
      const a = parseInt(match[2], 10);
      presets.push({
        label: `${renderIconElement(b.icon, b.icon_type, 16)} ${b.name} (${h}–${a})`,
        actH: h,
        actA: a,
        predH: h,
        predA: a
      });
    }
  });

  // Standard test scenario presets
  presets.push(
    { label: '✨ Exact Draw (1–1)', actH: 1, actA: 1, predH: 1, predA: 1 },
    { label: '📊 Same Margin (3–1 vs 2–0)', actH: 3, actA: 1, predH: 2, predA: 0 },
    { label: '❌ Outcome Only (3–1 vs 4–0)', actH: 3, actA: 1, predH: 4, predA: 0 },
    { label: '🛋️ Miss (3–1 vs 0–2)', actH: 3, actA: 1, predH: 0, predA: 2 }
  );

  container.innerHTML = presets.map(p => `
    <button type="button" class="sim-preset-btn" data-act-h="${p.actH}" data-act-a="${p.actA}" data-pred-h="${p.predH}" data-pred-a="${p.predA}">
      ${p.label}
    </button>
  `).join('');

  // Attach click handlers
  container.querySelectorAll('.sim-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actH = document.getElementById('simActHome');
      const actA = document.getElementById('simActAway');
      const predH = document.getElementById('simPredHome');
      const predA = document.getElementById('simPredAway');

      if (actH) actH.value = btn.dataset.actH;
      if (actA) actA.value = btn.dataset.actA;
      if (predH) predH.value = btn.dataset.predH;
      if (predA) predA.value = btn.dataset.predA;

      container.querySelectorAll('.sim-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateScoreSimulator();
    });
  });
}

/**
 * Score Simulator State and Event Handling
 */
function initScoreSimulator() {
  // Steppers
  document.querySelectorAll('.sim-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const delta = parseInt(btn.dataset.delta, 10) || 0;
      const input = document.getElementById(targetId);
      if (!input) return;
      const current = parseInt(input.value, 10) || 0;
      input.value = Math.max(0, Math.min(20, current + delta));
      updateScoreSimulator();
    });
  });

  // Number input change
  ['simActHome', 'simActAway', 'simPredHome', 'simPredAway'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateScoreSimulator);
  });

  renderSimulatorPresets();
  updateScoreSimulator();
}

/**
 * Update the simulator result card dynamically.
 */
function updateScoreSimulator() {
  const container = document.getElementById('simResultContainer');
  if (!container) return;

  const actH = parseInt(document.getElementById('simActHome')?.value, 10) || 0;
  const actA = parseInt(document.getElementById('simActAway')?.value, 10) || 0;
  const predH = parseInt(document.getElementById('simPredHome')?.value, 10) || 0;
  const predA = parseInt(document.getElementById('simPredAway')?.value, 10) || 0;

  const res = evaluatePrediction(actH, actA, predH, predA);
  const tierObj = SCORING_TIERS.find(t => t.tier === res.tier) || SCORING_TIERS[SCORING_TIERS.length - 1];

  const bonusesList = [];
  if (res.highScoringBonus > 0) {
    const bDef = SCORING_BONUSES.find(b => b.id === 'highScoring') || {};
    bonusesList.push({
      icon: bDef.icon || '🔥',
      icon_type: bDef.icon_type || 'emoji',
      name: bDef.name || 'High-Scoring Thriller',
      pts: res.highScoringBonus
    });
  }
  if (res.drawBonus > 0) {
    const bDef = SCORING_BONUSES.find(b => b.id === 'drawBonus') || {};
    bonusesList.push({
      icon: bDef.icon || '✨',
      icon_type: bDef.icon_type || 'emoji',
      name: bDef.name || 'Exact Draw Premium',
      pts: res.drawBonus
    });
  }

  const bonusChipsHtml = bonusesList.length > 0
    ? bonusesList.map(b => `
        <span class="sim-bonus-pill">
          ${renderIconElement(b.icon, b.icon_type, 16)}
          <span>${b.name}</span>
          <strong class="sim-bonus-add">+${b.pts}</strong>
        </span>
      `).join('')
    : '<span class="sim-no-bonus">No additive bonuses triggered</span>';

  container.innerHTML = `
    <div class="sim-result-header">
      <span class="sim-result-tag">Live Evaluation</span>
      <div class="sim-total-pts-badge">
        <span class="sim-pts-number">${res.total}</span>
        <span class="sim-pts-label">${res.total === 1 ? 'Point' : 'Points'}</span>
      </div>
    </div>

    <div class="sim-result-body">
      <!-- Base Tier Met -->
      <div class="sim-breakdown-row">
        <span class="sim-breakdown-label">Base Rule Met:</span>
        <div class="sim-rule-badge-wrap">
          <span class="pts-badge ${tierObj.badgeClass}" style="display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:0.9rem; padding:5px 12px;">
            ${renderIconElement(tierObj.icon, tierObj.icon_type, 20)}
            <span>${tierObj.name}</span>
          </span>
          <span class="sim-base-pts-tag">${res.base} ${res.base === 1 ? 'pt' : 'pts'}</span>
        </div>
      </div>

      <!-- Additive Bonuses -->
      <div class="sim-breakdown-row">
        <span class="sim-breakdown-label">Additive Bonuses:</span>
        <div class="sim-bonuses-group">
          ${bonusChipsHtml}
        </div>
      </div>

      <!-- Summary Formula -->
      <div class="sim-formula-bar">
        <span class="sim-formula-item">${res.base} base</span>
        ${bonusesList.map(b => `<span class="sim-formula-plus">+</span><span class="sim-formula-bonus">+${b.pts}</span>`).join('')}
        <span class="sim-formula-equals">=</span>
        <strong class="sim-formula-total">${res.total} ${res.total === 1 ? 'Pt' : 'Pts'}</strong>
      </div>
    </div>
  `;
}

/**
 * Render scoring rules summary chips in management view.
 */
function renderMgmtScoringRulesSummary() {
  const grid = document.getElementById('mgmtScoringRulesSummaryGrid');
  if (!grid) return;

  const all = [...SCORING_TIERS, ...SCORING_BONUSES];
  grid.innerHTML = all.map(r => {
    const tierNum = r.tier ?? null;
    const pts = r.pts;
    const icon = r.icon;
    const name = r.name;
    const badgeClass = r.badgeClass || (tierNum ? `p${pts}` : 'p-bonus');
    return `
      <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-glass); border-radius:var(--radius-sm); padding:10px 14px;">
        <span style="font-size:1.4rem;">${renderIconElement(icon, r.icon_type, 24)}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.82rem; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          ${tierNum ? `<div style="font-size:0.75rem; color:var(--text-muted);">Tier ${tierNum}</div>` : `<div style="font-size:0.75rem; color:var(--accent-purple);">Bonus</div>`}
        </div>
        <span class="pts-badge ${badgeClass}" style="flex-shrink:0;">${pts >= 0 ? `${tierNum ? '' : '+'}${pts}` : pts} pts</span>
      </div>`;
  }).join('');
}

function initManagementEvents() {
  const teamModeRadios = document.getElementsByName('mgmtTeamMode');
  const chipGrid = document.getElementById('mgmtTeamChipGrid');

  teamModeRadios.forEach(r => {
    r.addEventListener('change', (e) => {
      if (chipGrid) {
        chipGrid.style.display = e.target.value === 'CUSTOM' ? 'grid' : 'none';
      }
    });
  });

  document.getElementById('mgmtCreateGroupBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('mgmtNewGroupNameInput');
    const name = input.value.trim();
    if (!name) return;

    let teamsFilter = 'ALL';
    const mode = Array.from(teamModeRadios).find(r => r.checked)?.value;
    if (mode === 'CUSTOM' && chipGrid) {
      const selected = Array.from(chipGrid.querySelectorAll('.mgmt-team-checkbox:checked')).map(cb => cb.value);
      if (selected.length === 0) {
        alert('Please select at least one team for custom team scope, or switch to All Teams!');
        return;
      }
      teamsFilter = selected;
    }

    try {
      const newGroup = await apiCreateGroup(name, teamsFilter);
      state.groups.push(newGroup);
      state.activeGroup = newGroup;
      input.value = '';

      await reloadMasterData();
      await loadActiveGroupData(newGroup.id);
      populateGroupDropdown();
      renderManagementPage();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('mgmtCreatePlayerBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('mgmtNewPlayerNameInput');
    const val = input.value.trim();
    if (!val) return;

    const defaultGroupIds = state.activeGroup ? [state.activeGroup.id] : [];

    try {
      const newPlayer = await apiCreateMasterPlayer(val, defaultGroupIds);
      state.masterPlayers.push(newPlayer);
      input.value = '';

      if (newPlayer.passcode) {
        alert(`Player "${newPlayer.name}" created!\n6-Character Passcode: ${newPlayer.passcode}`);
      }

      await reloadMasterData();
      if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
      renderManagementPage();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('mgmtSearchPlayerInput')?.addEventListener('input', (e) => {
    state.playerSearchQuery = e.target.value.toLowerCase().trim();
    renderMasterPlayersTable();
  });
}

function renderManagementPage() {
  renderMgmtScoringRulesSummary();
  renderTeamSelectionGrid();
  renderGroupsGrid();
  renderMasterPlayersTable();
}

function renderGroupsGrid() {
  const grid = document.getElementById('mgmtGroupsGrid');
  if (!grid) return;

  if (state.groups.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); padding:16px;">No groups created yet. Type a group name above to create one!</div>`;
    return;
  }

  grid.innerHTML = state.groups.map(g => {
    const groupPlayers = state.masterPlayers.filter(p => p.group_ids.includes(g.id));
    const filter = getGroupTeamsFilter(g);
    const scopeLabel = filter ? `🎯 Scope: ${filter.length} Teams (${filter.slice(0, 3).join(', ')}${filter.length > 3 ? '...' : ''})` : '⚽ Scope: All Teams';

    return `
      <div class="mgmt-group-card">
        <div class="mgmt-group-header">
          <input type="text" class="form-input mgmt-group-name-input" data-id="${g.id}" value="${g.name}" style="font-weight:700; font-family:var(--font-title); font-size:1.05rem;" />
          <button class="btn-icon delete-group-btn" data-id="${g.id}" title="Delete Group">🗑️</button>
        </div>
        <div style="font-size:0.8rem; color:var(--accent-purple); font-weight:600; margin: 4px 0;">
          ${scopeLabel}
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between;">
          <span>👥 ${groupPlayers.length} Members</span>
          <span style="color:var(--text-dim);">ID #${g.id}</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.mgmt-group-name-input').forEach(input => {
    input.addEventListener('change', async () => {
      const gId = parseInt(input.dataset.id, 10);
      const val = input.value.trim();
      if (!val) return;
      try {
        const group = state.groups.find(g => g.id === gId);
        const filterVal = group ? group.teams_filter : 'ALL';
        await apiRenameGroup(gId, val, filterVal);
        if (group) group.name = val;
        populateGroupDropdown();
        renderMasterPlayersTable();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  grid.querySelectorAll('.delete-group-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gId = parseInt(btn.dataset.id, 10);
      const group = state.groups.find(g => g.id === gId);
      if (!confirm(`Delete group "${group ? group.name : gId}"?`)) return;

      try {
        await apiDeleteGroup(gId);
        await reloadMasterData();
        populateGroupDropdown();
        if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
        renderManagementPage();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function renderMasterPlayersTable() {
  const tbody = document.getElementById('mgmtPlayersBody');
  if (!tbody) return;

  let players = state.masterPlayers;
  if (state.playerSearchQuery) {
    players = players.filter(p => p.name.toLowerCase().includes(state.playerSearchQuery));
  }

  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">No players found. Add someone to your master directory above!</td></tr>`;
    return;
  }

  tbody.innerHTML = players.map(p => {
    const groupPills = state.groups.map(g => {
      const isMember = p.group_ids.includes(g.id);
      return `
        <span class="group-tag-pill ${isMember ? 'active' : ''}"
              data-player-id="${p.id}"
              data-group-id="${g.id}"
              data-is-member="${isMember}">
          ${isMember ? '✓' : '+'} ${g.name}
        </span>
      `;
    }).join('');

    const passcodeDisplay = state.auth.role === 'admin'
      ? `<div style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <span class="passcode-chip" title="Click to copy passcode">${p.passcode || '-'}</span>
          <button class="btn-icon copy-passcode-btn" data-code="${p.passcode || ''}" title="Copy Passcode">📋</button>
          <button class="btn-icon reset-passcode-btn" data-id="${p.id}" title="Reset 6-Char Passcode">🔄</button>
         </div>`
      : `<span style="color:var(--text-dim); font-size:0.8rem;">🔒 Hidden</span>`;

    return `
      <tr>
        <td>
          <input type="text" class="form-input mgmt-player-name-input" data-id="${p.id}" value="${p.name}" style="font-weight:600;" />
        </td>
        <td>
          <div class="group-tag-pill-container">
            ${groupPills}
          </div>
        </td>
        <td style="text-align: center;">
          ${passcodeDisplay}
        </td>
        <td style="text-align: center;">
          <button class="btn-icon delete-master-player-btn" data-id="${p.id}" title="Remove Person from Directory">🗑️ Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.copy-passcode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = '📋', 1200);
      }).catch(() => { });
    });
  });

  tbody.querySelectorAll('.reset-passcode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = parseInt(btn.dataset.id, 10);
      const player = state.masterPlayers.find(p => p.id === pId);
      if (!confirm(`Regenerate passcode for "${player ? player.name : pId}"?`)) return;

      try {
        const res = await apiResetPasscode(pId);
        alert(`New 6-character passcode for ${player ? player.name : 'player'}: ${res.passcode}`);
        await reloadMasterData();
        renderMasterPlayersTable();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.group-tag-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      const pId = parseInt(pill.dataset.playerId, 10);
      const gId = parseInt(pill.dataset.groupId, 10);
      const isMember = pill.dataset.isMember === 'true';

      try {
        if (isMember) {
          await apiRemovePlayerFromGroup(pId, gId);
        } else {
          await apiAssignPlayerToGroup(pId, gId);
        }

        await reloadMasterData();
        if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
        populateGroupDropdown();
        renderManagementPage();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.mgmt-player-name-input').forEach(input => {
    input.addEventListener('change', async () => {
      const pId = parseInt(input.dataset.id, 10);
      const val = input.value.trim();
      if (!val) return;

      try {
        await apiRenameMasterPlayer(pId, val);
        const player = state.masterPlayers.find(p => p.id === pId);
        if (player) player.name = val;
        if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.delete-master-player-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = parseInt(btn.dataset.id, 10);
      const player = state.masterPlayers.find(p => p.id === pId);
      if (!confirm(`Delete "${player ? player.name : pId}" from master directory?`)) return;

      try {
        await apiDeleteMasterPlayer(pId);
        await reloadMasterData();
        if (state.activeGroup) await loadActiveGroupData(state.activeGroup.id);
        populateGroupDropdown();
        renderManagementPage();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function initCopyBtn() {
  document.getElementById('copyLeaderboardBtn')?.addEventListener('click', () => {
    const lb = calcLeaderboard();
    const medals = ['🥇', '🥈', '🥉'];
    const text = lb.map(r => {
      const tierParts = SCORING_TIERS.map(t => `${t.icon_type === 'emoji' ? t.icon : '•'} T${t.tier}: ${r['t' + t.tier] || 0}`).join(' | ');
      return `${medals[r.rank - 1] ?? '#' + r.rank} ${r.name}: ${r.total} pts (${tierParts})`;
    }).join('\n');
    navigator.clipboard.writeText(text).catch(() => { });
  });
}

function initChartControls() {
  const stepBtn = document.getElementById('chartModeStepBtn');
  const linearBtn = document.getElementById('chartModeLinearBtn');
  const ribbonBtn = document.getElementById('chartModeRibbonBtn');
  const backBtn = document.getElementById('chartBackToAllGWsBtn');
  const gwSelect = document.getElementById('chartGwDrilldownSelect');
  const drilldownModeSelect = document.getElementById('chartDrilldownModeSelect');
  const expandToCurrentBtn = document.getElementById('chartExpandToCurrentBtn');
  const expandAllBtn = document.getElementById('chartExpandAllBtn');
  const collapseAllBtn = document.getElementById('chartCollapseAllBtn');

  function updateButtons() {
    const mode = state.chartMode || 'ribbon';
    if (stepBtn) stepBtn.classList.toggle('active', mode === 'stepped');
    if (linearBtn) linearBtn.classList.toggle('active', mode === 'linear');
    if (ribbonBtn) ribbonBtn.classList.toggle('active', mode === 'ribbon');
  }

  stepBtn?.addEventListener('click', () => {
    state.chartMode = 'stepped';
    localStorage.setItem('epl_chart_mode', 'stepped');
    updateButtons();
    renderCumulativeChart();
  });

  linearBtn?.addEventListener('click', () => {
    state.chartMode = 'linear';
    localStorage.setItem('epl_chart_mode', 'linear');
    updateButtons();
    renderCumulativeChart();
  });

  ribbonBtn?.addEventListener('click', () => {
    state.chartMode = 'ribbon';
    localStorage.setItem('epl_chart_mode', 'ribbon');
    updateButtons();
    renderCumulativeChart();
  });

  backBtn?.addEventListener('click', () => {
    setChartDrilldown(null);
  });

  gwSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    setChartDrilldown(val ? Number(val) : null);
  });

  expandToCurrentBtn?.addEventListener('click', () => {
    expandToCurrentGW();
  });

  expandAllBtn?.addEventListener('click', () => {
    expandAllGWs();
  });

  collapseAllBtn?.addEventListener('click', () => {
    collapseAllGWs();
  });

  drilldownModeSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'none' || !val) {
      setChartDrilldown(null);
    } else {
      setChartDrilldown(Number(val));
    }
  });

  updateButtons();
}

function startLockRefresh() {
  setInterval(() => {
    if (state.activeGW && state.activeView === 'dashboard') {
      renderMatrix();
      if (hasActiveTeamFilter()) renderTeamBreakdown();
      renderSnapshot(calcLeaderboard());
      renderLeaderboard();
    }
  }, 30_000);
}

// ─── Init Application ────────────────────────────────────────────────────────
async function init() {
  startClock();
  initThemeSelector();
  initTimezoneSelector();
  initNavigation();
  initGroupEvents();
  initGWSkipControls();
  initManagementEvents();
  initChartControls();
  initRulesEditorModal({
    onRulesUpdated: () => {
      renderScoringViewSummary();
      renderMgmtScoringRulesSummary();
      if (state.activeView === 'dashboard') {
        renderSnapshot(calcLeaderboard());
        renderLeaderboard();
        if (hasActiveTeamFilter()) renderTeamBreakdown();
        renderMatrix();
      }
    }
  });
  document.getElementById('exportScoringRulesPdfBtn')?.addEventListener('click', exportRulesToPdf);
  document.getElementById('exportScoringRulesJpgBtn')?.addEventListener('click', exportRulesToJpeg);
  initScoreSimulator();
  initCopyBtn();
  startLockRefresh();
  initPointsTooltip();

  document.getElementById('matrixBody').innerHTML = `
    <tr><td colspan="10">
      <div class="loading-state"><div class="spinner"></div><span>Connecting to backend server & fetching FPL data…</span></div>
    </td></tr>`;

  try {
    await loadAndApplyScoringRules();
    renderScoringViewSummary();
    renderMgmtScoringRulesSummary();
    await initAuth();
    await reloadMasterData();
    populateGroupDropdown();

    if (state.activeGroup) {
      await loadActiveGroupData(state.activeGroup.id);
    }

    const { gwNumbers, byGW, teams } = await fetchFixtures();
    state.gwNumbers = gwNumbers;
    state.fixtures = byGW;
    state.teams = teams;

    const autoGW = getAutoActiveGW();
    const savedGW = parseInt(localStorage.getItem('epl_active_gw'), 10);
    if (savedGW && gwNumbers.includes(savedGW)) {
      if (isGWFinishedForGroup(savedGW) && autoGW && autoGW > savedGW) {
        state.activeGW = autoGW;
        localStorage.setItem('epl_active_gw', autoGW);
      } else {
        state.activeGW = savedGW;
      }
    } else {
      state.activeGW = autoGW ?? gwNumbers[0];
    }

    populateTeamFilter();
    renderGWTabs();
    renderDashboardComponents();
    initKickoffAndVisibilityEvents();

  } catch (err) {
    console.error(err);
    document.getElementById('matrixBody').innerHTML = `
      <tr><td colspan="10">
        <div class="error-state">
          <span style="font-size:2rem">⚠️</span>
          <strong>Could not connect to backend server</strong>
          <span>${err.message}</span>
          <button class="btn btn-primary" onclick="location.reload()">🔄 Retry</button>
        </div>
      </td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
