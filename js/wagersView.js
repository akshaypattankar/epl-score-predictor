// js/wagersView.js - Weekly Winners, Ties Tracker, Match Wagering & Credit Pot Module
// Redesigned to ui-ux-pro-max standard: vector SVGs, Bento Grid hierarchy, accessible contrast, responsive layout.

import { getCrestImg, getClubDetails } from './api.js';
import { evaluatePrediction } from './scoring.js';
import { apiSavePlayerStakes, apiBulkSaveWagers, apiSaveSingleWager, apiFetchGroupWagers } from './api.js';
import { recalculateGroupPlayerColors, getPlayerColor, getPlayerColorShades, getRankBadgeHtml } from './colors.js';

// Local view state
const wagersState = {
  activeSubTab: 'weekly', // 'weekly' | 'stakes' | 'ledger'
  selectedGw: null,        // number (e.g. 10 - defaults to current active gameweek)
  gwViewMode: 'focused',   // 'focused' (single active GW) | 'overview' (all GWs summary table)
  wagersData: null,        // { wagers: [], settings: {} }
  isLoading: false,
  bulkStakeInput: 10,
  adminSelectedPlayerId: null,
};

/**
 * Clean SVG Vector Icons (Lucide / Heroicons inspired, 1.75px stroke, no emojis)
 */
export function svgIcon(name, size = 16, className = '') {
  const icons = {
    coins: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
    trophy: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
    crown: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`,
    handshake: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-2-2"/><path d="m18 10 1.3-1.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L14 6"/><path d="M8 14 6 12a1 1 0 0 1 0-1.4l4.3-4.3a1 1 0 0 1 1.4 0l2 2"/><path d="m6 18-1.3 1.3a1 1 0 0 1-1.4 0L.7 16.7a1 1 0 0 1 0-1.4L2 14"/></svg>`,
    zap: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    calendar: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
    checkCircle: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
    activity: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    clock: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    lock: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    trendingUp: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    trendingDown: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
    chartBar: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
    sliders: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>`,
    shield: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    users: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    chevronDown: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevronLeft: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevronRight: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`,
    arrowLeft: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    arrowRight: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    info: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    sparkles: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg>`,
    wallet: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,
    table: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
    layout: `<svg class="wager-svg ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
  };
  return icons[name] || '';
}

/**
 * Generate a deterministic accessible avatar with initials using the Golden-Ratio color theory.
 */
function getPlayerAvatar(playerOrName = '?', size = 26) {
  const name = typeof playerOrName === 'object' && playerOrName?.name
    ? playerOrName.name
    : String(playerOrName || '?');

  const parts = String(name).trim().split(/\s+/);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0].slice(0, 2)).toUpperCase();

  const shades = getPlayerColorShades(playerOrName);
  const fontSize = Math.max(10, Math.round(size * 0.38));

  return `
    <span class="wager-avatar" style="width: ${size}px; height: ${size}px; min-width: ${size}px; font-size: ${fontSize}px; background: ${shades.bgCardTop}; border: 1.5px solid ${shades.primary}; color: ${shades.primary}; box-shadow: 0 0 6px ${shades.glow};" aria-hidden="true" title="${escapeHtml(name)}">
      ${escapeHtml(initials)}
    </span>
  `;
}

/**
 * Standard table player cell with avatar, glowing color dot, and themed name.
 */
function renderPlayerNameCell(player, size = 28, isWinner = false, isYou = false) {
  const shades = getPlayerColorShades(player);
  return `
    <div class="table-player-cell">
      ${getPlayerAvatar(player, size)}
      <span class="player-color-dot" style="display:inline-block;width:8px;height:8px;min-width:8px;border-radius:50%;background:${shades.primary};box-shadow:0 0 6px ${shades.glow};flex-shrink:0;"></span>
      <span class="table-player-name ${isWinner ? 'text-gold font-bold' : ''}" style="color:${isWinner ? '' : shades.primary};font-weight:700;">
        ${escapeHtml(player.name)}
        ${isYou ? `<span class="you-tag" style="background:${shades.chipBg}; border-color:${shades.chipBorder}; color:${shades.primary};">YOU</span>` : ''}
      </span>
    </div>
  `;
}

/**
 * Helper: Format match kickoff time in player timezone.
 */
function formatKickoffTime(isoStr, tz = 'UTC') {
  if (!isoStr) return 'TBD';
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${datePart} ${timePart}`;
  } catch (e) {
    return 'Upcoming';
  }
}

/**
 * Compact kickoff time format for small screens or tight spaces (e.g. "18 Oct, 15:00")
 */
function formatCompactKickoffTime(isoStr, tz = 'UTC') {
  if (!isoStr) return 'TBD';
  try {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${datePart}, ${timePart}`;
  } catch (e) {
    return 'Upcoming';
  }
}

/**
 * Helper: Resolve group scope teams for a specific gameweek.
 * Supports both legacy flat arrays and segmented [{ from_gw, to_gw, teams }].
 */
export function getGroupTeamsFilterForGW(group, gw = null) {
  if (!group || !group.teams_filter || group.teams_filter === 'ALL') return null;

  let parsed;
  try {
    parsed = typeof group.teams_filter === 'string' ? JSON.parse(group.teams_filter) : group.teams_filter;
  } catch (e) {
    return null;
  }

  // Segmented scope format: array of { from_gw, to_gw, teams }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].from_gw !== undefined) {
    if (gw !== null && gw !== undefined) {
      const gwNum = Number(gw);
      const segment = parsed.find(s => gwNum >= Number(s.from_gw) && (s.to_gw == null || gwNum <= Number(s.to_gw)));
      if (!segment || segment.teams === 'ALL' || !segment.teams) return null;
      return Array.isArray(segment.teams) && segment.teams.length > 0 ? segment.teams : null;
    }
    const lastSeg = parsed[parsed.length - 1];
    if (!lastSeg || lastSeg.teams === 'ALL' || !lastSeg.teams) return null;
    return Array.isArray(lastSeg.teams) && lastSeg.teams.length > 0 ? lastSeg.teams : null;
  }

  // Flat array of team names
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

/**
 * Match scope evaluation.
 */
export function isMatchInGroupScope(fixture, group, gwNum) {
  if (!group) return true;
  const startGw = group.start_gw ? Number(group.start_gw) : 1;
  const matchGw = Number(gwNum || fixture.event);
  if (matchGw < startGw) return false;

  const filterTeams = getGroupTeamsFilterForGW(group, matchGw);
  if (!filterTeams || filterTeams === 'ALL') return true;
  if (Array.isArray(filterTeams)) {
    return filterTeams.includes(fixture.home_name) || filterTeams.includes(fixture.away_name);
  }
  return true;
}

/**
 * Filter and normalize fixtures in active group scope.
 * Fixes score mapping: handles both actual_home_score and raw team_h_score.
 */
export function getInScopeFixtures(rawFixturesByGw, group) {
  if (!rawFixturesByGw || !group) return [];
  const startGw = group.start_gw ? Number(group.start_gw) : 1;
  const inScope = [];

  for (const [gwStr, fixtures] of Object.entries(rawFixturesByGw)) {
    const gwNum = Number(gwStr);
    if (gwNum < startGw) continue;
    if (!Array.isArray(fixtures)) continue;

    for (const f of fixtures) {
      if (isMatchInGroupScope(f, group, gwNum)) {
        // Normalize properties across frontend cache and raw objects
        const actH = f.actual_home_score !== undefined && f.actual_home_score !== null
          ? Number(f.actual_home_score)
          : (f.team_h_score !== undefined && f.team_h_score !== null ? Number(f.team_h_score) : null);

        const actA = f.actual_away_score !== undefined && f.actual_away_score !== null
          ? Number(f.actual_away_score)
          : (f.team_a_score !== undefined && f.team_a_score !== null ? Number(f.team_a_score) : null);

        const isFinished = f.finished === true || f.finished_provisional === true;
        const isStarted = f.started === true || (f.kickoff_time && new Date() >= new Date(f.kickoff_time));

        const homeShort = f.home_short || getClubDetails(f.home_name)?.short || (f.home_name ? f.home_name.slice(0, 3).toUpperCase() : 'HOM');
        const awayShort = f.away_short || getClubDetails(f.away_name)?.short || (f.away_name ? f.away_name.slice(0, 3).toUpperCase() : 'AWA');

        inScope.push({
          ...f,
          event: gwNum,
          home_short: homeShort,
          away_short: awayShort,
          actual_home_score: actH,
          actual_away_score: actA,
          finished: isFinished,
          started: isStarted,
        });
      }
    }
  }

  // Sort by Gameweek asc, then kickoff_time asc
  inScope.sort((a, b) => (a.event - b.event) || (new Date(a.kickoff_time) - new Date(b.kickoff_time)));
  return inScope;
}

/**
 * Calculate weekly points, winners, and ties across all gameweeks in group scope.
 * Fixes calculation bugs: uses evaluated actual scores and proper match completion status.
 */
export function calculateWeeklyWinners({
  fixturesByGw = {},
  players = [],
  predictions = {},
  group = null
}) {
  const inScopeFixtures = getInScopeFixtures(fixturesByGw, group);
  const startGw = group?.start_gw ? Number(group.start_gw) : 1;

  // Group in-scope fixtures by gameweek
  const gwMap = {};
  for (let gw = startGw; gw <= 38; gw++) {
    gwMap[gw] = [];
  }
  for (const f of inScopeFixtures) {
    if (gwMap[f.event]) {
      gwMap[f.event].push(f);
    }
  }

  const weeklyResults = [];
  const playerStats = {};
  players.forEach(p => {
    playerStats[p.id] = {
      id: p.id,
      name: p.name,
      gwWins: 0,
      gwTies: 0,
      totalPoints: 0,
      gwsPlayed: 0,
      bestGwScore: 0,
      gwBreakdown: {} // { [gw]: points }
    };
  });

  for (let gw = startGw; gw <= 38; gw++) {
    const matches = gwMap[gw] || [];
    if (matches.length === 0) continue;

    const finishedMatches = matches.filter(m => m.finished);
    const liveMatches = matches.filter(m => m.started && !m.finished);
    const isFinished = matches.length > 0 && finishedMatches.length === matches.length;
    const isLive = liveMatches.length > 0 || (finishedMatches.length > 0 && !isFinished);
    const isUpcoming = finishedMatches.length === 0 && liveMatches.length === 0;

    const scores = {};
    players.forEach(p => { scores[p.id] = 0; });

    // Matches with actual scores available
    const scoredMatches = matches.filter(m => m.actual_home_score !== null && m.actual_away_score !== null);

    for (const m of scoredMatches) {
      for (const p of players) {
        const pred = predictions[`${m.id}_${p.id}`];
        if (pred && pred.predicted_home !== null && pred.predicted_home !== undefined && pred.predicted_home !== '' &&
            pred.predicted_away !== null && pred.predicted_away !== undefined && pred.predicted_away !== '') {
          const evalRes = evaluatePrediction(
            m.actual_home_score,
            m.actual_away_score,
            Number(pred.predicted_home),
            Number(pred.predicted_away)
          );
          if (evalRes && evalRes.total !== undefined) {
            scores[p.id] += evalRes.total;
          }
        }
      }
    }

    // Determine winner / ties if at least one match has been scored or gameweek started
    let maxPoints = 0;
    let winners = [];
    let isTie = false;

    if (scoredMatches.length > 0) {
      const scoreValues = Object.values(scores);
      maxPoints = Math.max(...scoreValues);
      winners = players.filter(p => scores[p.id] === maxPoints);
      isTie = winners.length > 1;

      // Officially update honours once gameweek is completely finished
      if (isFinished) {
        players.forEach(p => {
          const pts = scores[p.id] || 0;
          playerStats[p.id].totalPoints += pts;
          playerStats[p.id].gwsPlayed++;
          playerStats[p.id].bestGwScore = Math.max(playerStats[p.id].bestGwScore, pts);
          playerStats[p.id].gwBreakdown[gw] = pts;
        });

        if (isTie) {
          winners.forEach(w => { playerStats[w.id].gwTies++; });
        } else if (winners.length === 1) {
          playerStats[winners[0].id].gwWins++;
        }
      }
    }

    weeklyResults.push({
      gw,
      matches,
      matchCount: matches.length,
      finishedCount: finishedMatches.length,
      isFinished,
      isLive,
      isUpcoming,
      scores,
      maxPoints,
      winners,
      isTie,
      hasScores: scoredMatches.length > 0
    });
  }

  // Calculate cumulative leaderboard
  const leaderboard = Object.values(playerStats).sort((a, b) =>
    (b.totalPoints - a.totalPoints) || (b.gwWins - a.gwWins) || (b.gwTies - a.gwTies) || a.name.localeCompare(b.name)
  );
  leaderboard.forEach((p, idx) => { p.rank = idx + 1; });

  return {
    weeklyResults,
    leaderboard,
    inScopeFixtures,
    gwMap
  };
}

/**
 * Pot & Financial Ledger Calculations (50% Weekly Winner / 50% Season Grand Jackpot).
 */
export function calculatePotsAndLedger({
  inScopeFixtures = [],
  players = [],
  weeklyResults = [],
  wagers = [],
  settings = {},
  playerStakes = [],
  leaderboard = []
}) {
  const defaultStake = settings?.default_stake !== undefined ? Number(settings.default_stake) : 10;
  const weeklySplitPercent = settings?.weekly_split_percent !== undefined ? Number(settings.weekly_split_percent) : 50;
  const seasonSplitPercent = 100 - weeklySplitPercent;

  // Lookup map for player agreed stakes: player_id -> stake_per_match
  const playerStakesMap = {};
  if (Array.isArray(playerStakes)) {
    for (const ps of playerStakes) {
      playerStakesMap[Number(ps.player_id)] = Number(ps.stake_per_match);
    }
  }

  // Lookup map: match_id + '_' + player_id -> amount
  const wagersMap = {};
  for (const w of wagers) {
    wagersMap[`${w.match_id}_${w.player_id}`] = Number(w.amount);
  }

  const ledger = {};
  players.forEach(p => {
    const pStake = playerStakesMap[p.id] !== undefined ? playerStakesMap[p.id] : defaultStake;
    ledger[p.id] = {
      id: p.id,
      name: p.name,
      stakePerMatch: pStake,
      totalStaked: 0,
      weeklyCreditsWon: 0,
      projectedSeasonWon: 0,
      totalReturn: 0,
      netCredits: 0,
      roi: 0
    };
  });

  let totalProjectedPot = 0;
  let totalCompletedPot = 0;

  const matchWagers = {};
  inScopeFixtures.forEach(m => {
    let matchPot = 0;
    const playerAmounts = {};

    players.forEach(p => {
      const pStake = ledger[p.id]?.stakePerMatch ?? defaultStake;
      const stake = wagersMap[`${m.id}_${p.id}`] !== undefined ? wagersMap[`${m.id}_${p.id}`] : pStake;
      playerAmounts[p.id] = stake;
      matchPot += stake;
      ledger[p.id].totalStaked += stake;
    });

    matchWagers[m.id] = {
      totalMatchPot: matchPot,
      playerAmounts
    };

    totalProjectedPot += matchPot;
    if (m.finished) {
      totalCompletedPot += matchPot;
    }
  });

  // Calculate Gameweek pots and weekly winner payouts
  const gwPots = {};
  let totalWeeklyCreditsDistributed = 0;
  let accumulatedSeasonJackpot = 0;

  weeklyResults.forEach(res => {
    let gwTotalStake = 0;
    res.matches.forEach(m => {
      gwTotalStake += (matchWagers[m.id]?.totalMatchPot || 0);
    });

    const weeklyPool = Math.round(gwTotalStake * (weeklySplitPercent / 100));
    const seasonPool = gwTotalStake - weeklyPool;

    if (res.isFinished) {
      accumulatedSeasonJackpot += seasonPool;
    }

    let payoutPerWinner = 0;
    if (res.isFinished && res.winners.length > 0) {
      payoutPerWinner = Math.floor(weeklyPool / res.winners.length);
      res.winners.forEach(w => {
        if (ledger[w.id]) {
          ledger[w.id].weeklyCreditsWon += payoutPerWinner;
          totalWeeklyCreditsDistributed += payoutPerWinner;
        }
      });
    }

    gwPots[res.gw] = {
      gw: res.gw,
      totalStake: gwTotalStake,
      weeklyPool,
      seasonPool,
      payoutPerWinner,
      isFinished: res.isFinished,
      isLive: res.isLive
    };
  });

  // Season Grand Jackpot: 50% of the entire scope pot
  const totalSeasonJackpot = Math.round(totalProjectedPot * (seasonSplitPercent / 100));

  // Determine current season standings leaders
  const topScore = leaderboard.length > 0 ? leaderboard[0].totalPoints : 0;
  const seasonLeaders = leaderboard.filter(p => p.totalPoints === topScore && topScore > 0);
  const isSeasonTie = seasonLeaders.length > 1;

  if (seasonLeaders.length > 0) {
    const seasonPayoutEach = Math.floor(totalSeasonJackpot / seasonLeaders.length);
    seasonLeaders.forEach(l => {
      if (ledger[l.id]) {
        ledger[l.id].projectedSeasonWon = seasonPayoutEach;
      }
    });
  }

  // Calculate net balances and ROI
  Object.values(ledger).forEach(entry => {
    entry.totalReturn = entry.weeklyCreditsWon + entry.projectedSeasonWon;
    entry.netCredits = entry.totalReturn - entry.totalStaked;
    entry.roi = entry.totalStaked > 0
      ? Math.round(((entry.totalReturn - entry.totalStaked) / entry.totalStaked) * 100)
      : 0;
  });

  return {
    defaultStake,
    weeklySplitPercent,
    seasonSplitPercent,
    playerStakesMap,
    wagersMap,
    matchWagers,
    gwPots,
    totalProjectedPot,
    totalCompletedPot,
    totalSeasonJackpot,
    accumulatedSeasonJackpot,
    totalWeeklyCreditsDistributed,
    seasonLeaders,
    isSeasonTie,
    topScore,
    ledger: Object.values(ledger).sort((a, b) => (b.netCredits - a.netCredits) || (b.totalReturn - a.totalReturn))
  };
}

/**
 * Main render function for the Wagers & Weekly Winners View.
 */
export async function renderWagersView(state) {
  const container = document.getElementById('wagersView');
  if (!container) return;

  if (!state.activeGroup) {
    container.innerHTML = `
      <div class="wager-empty-state glass-card">
        <div class="empty-icon-wrap">${svgIcon('info', 32, 'text-accent-cyan')}</div>
        <h3>No Active League Selected</h3>
        <p>Please select an active group from the header dropdown to view weekly winners, wagers, and pot statistics.</p>
      </div>
    `;
    return;
  }

  // Ensure player colors match Golden-Ratio color theory for active group
  recalculateGroupPlayerColors(state.players);

  // Load wagers data from backend if needed
  if (!wagersState.wagersData || wagersState.wagersData.group_id !== state.activeGroup.id) {
    try {
      wagersState.isLoading = true;
      const data = await apiFetchGroupWagers(state.activeGroup.id);
      wagersState.wagersData = data;
    } catch (e) {
      console.warn('Failed to load wagers data:', e);
      wagersState.wagersData = { wagers: [], settings: { default_stake: 10, weekly_split_percent: 50 } };
    } finally {
      wagersState.isLoading = false;
    }
  }

  const { wagers, settings, player_stakes } = wagersState.wagersData || {
    wagers: [],
    settings: { default_stake: 10, weekly_split_percent: 50 },
    player_stakes: []
  };

  // Calculate weekly results and pots
  const weeklyCalculation = calculateWeeklyWinners({
    fixturesByGw: state.fixtures,
    players: state.players,
    predictions: state.predictions,
    group: state.activeGroup
  });

  const potCalculation = calculatePotsAndLedger({
    inScopeFixtures: weeklyCalculation.inScopeFixtures,
    players: state.players,
    weeklyResults: weeklyCalculation.weeklyResults,
    wagers,
    settings,
    playerStakes: player_stakes,
    leaderboard: weeklyCalculation.leaderboard
  });

  // Default selected GW to the current active gameweek (or live, or latest completed)
  const activeLiveGw = weeklyCalculation.weeklyResults.find(w => w.isLive);
  const latestFinishedGw = [...weeklyCalculation.weeklyResults].reverse().find(w => w.isFinished);
  const stateActiveGwNum = state.activeGW ? Number(state.activeGW) : null;

  const defaultGw = activeLiveGw ? activeLiveGw.gw : (
    (stateActiveGwNum && weeklyCalculation.weeklyResults.some(w => w.gw === stateActiveGwNum))
      ? stateActiveGwNum
      : (latestFinishedGw ? latestFinishedGw.gw : (weeklyCalculation.weeklyResults[0]?.gw || 1))
  );

  if (wagersState.selectedGw === null || !weeklyCalculation.weeklyResults.some(w => w.gw === wagersState.selectedGw)) {
    wagersState.selectedGw = defaultGw;
  }

  const isAdmin = state.auth?.role === 'admin';

  // Render Redesigned Bento Dashboard
  container.innerHTML = `
    <div class="wagers-dashboard-wrap">
      <!-- Group Scope Info Bar -->
      <div class="wagers-scope-header">
        <div class="wagers-scope-left">
          <span class="wagers-scope-shield">${svgIcon('shield', 18, 'text-accent-cyan')}</span>
          <div class="wagers-scope-titles">
            <h2 class="wagers-league-name">${escapeHtml(state.activeGroup.name)}</h2>
            <div class="wagers-scope-meta">
              <span class="scope-meta-item">
                ${svgIcon('calendar', 13)}
                ${weeklyCalculation.weeklyResults.length} Gameweeks (GW ${state.activeGroup.start_gw || 1}–38)
              </span>
              <span class="meta-dot">·</span>
              <span class="scope-meta-item">
                ${svgIcon('zap', 13)}
                ${weeklyCalculation.inScopeFixtures.length} Scope Matches
              </span>
              <span class="meta-dot">·</span>
              <span class="scope-meta-item">
                ${svgIcon('users', 13)}
                ${state.players.length} Members
              </span>
            </div>
          </div>
        </div>

        <div class="wagers-scope-right">
          <div class="wagers-rule-pill">
            <span class="rule-pill-label">POT DISTRIBUTION</span>
            <span class="rule-pill-val">
              <span class="split-hl-cyan">${potCalculation.weeklySplitPercent}%</span> Weekly ·
              <span class="split-hl-gold">${potCalculation.seasonSplitPercent}%</span> Season Grand
            </span>
          </div>
        </div>
      </div>

      <!-- Bento Grid Hero Section (3-Column Asymmetric) -->
      ${renderBentoGrid(state, weeklyCalculation, potCalculation)}

      <!-- Segmented Navigation Pill Controls -->
      <nav class="wagers-segmented-nav" aria-label="Wagers Navigation">
        <button type="button" class="segmented-nav-btn ${wagersState.activeSubTab === 'weekly' ? 'active' : ''}" id="subTabWeeklyWinners">
          ${svgIcon('crown', 16)}
          <span>Weekly Timeline &amp; Ties</span>
          <span class="segmented-pill-badge">GW ${wagersState.selectedGw}</span>
        </button>
        <button type="button" class="segmented-nav-btn ${wagersState.activeSubTab === 'stakes' ? 'active' : ''}" id="subTabWagerStakes">
          ${svgIcon('coins', 16)}
          <span>Wager Stakes${isAdmin ? ' (Admin)' : ''}</span>
          <span class="segmented-pill-badge">${state.players.length} members</span>
        </button>
        <button type="button" class="segmented-nav-btn ${wagersState.activeSubTab === 'ledger' ? 'active' : ''}" id="subTabCreditLedger">
          ${svgIcon('chartBar', 16)}
          <span>Credits Ledger &amp; ROI</span>
          <span class="segmented-pill-badge">${state.players.length}</span>
        </button>
      </nav>

      <!-- Active Sub-Tab Viewport -->
      <div id="wagersTabViewport" class="wagers-tab-viewport">
        ${renderActiveTab(state, weeklyCalculation, potCalculation)}
      </div>
    </div>
  `;

  // Attach all user interactions
  attachWagersEvents(state, weeklyCalculation, potCalculation);

  // Auto-scroll the selected Gameweek pill smoothly into view
  setTimeout(() => {
    const activePill = document.getElementById(`gwPillBtn_${wagersState.selectedGw}`);
    if (activePill) {
      activePill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 50);
}

/**
 * Bento Grid Hero Component
 */
function renderBentoGrid(state, { leaderboard, weeklyResults }, pot) {
  const leader = pot.seasonLeaders.length > 0 ? pot.seasonLeaders[0] : null;
  const isTie = pot.isSeasonTie;
  const latestFinishedGw = [...weeklyResults].reverse().find(w => w.isFinished);
  const activeLiveGw = weeklyResults.find(w => w.isLive);

  return `
    <section class="wagers-bento-grid">
      <!-- Card 1: Total League Pot (Hero Card) -->
      <div class="bento-card bento-card-primary">
        <div class="bento-card-header">
          <div class="bento-tag text-gold">
            ${svgIcon('coins', 16)}
            <span>TOTAL LEAGUE POT</span>
          </div>
          <span class="bento-status-pill">${pot.defaultStake} cr / match default</span>
        </div>

        <div class="bento-primary-metric">
          <span class="metric-huge text-gold">${pot.totalProjectedPot.toLocaleString()}</span>
          <span class="metric-unit">CREDITS</span>
        </div>

        <!-- 50/50 Split Visual Progress Bar -->
        <div class="wagers-split-bar-wrap">
          <div class="split-bar-track">
            <div class="split-bar-fill-weekly" style="width: ${pot.weeklySplitPercent}%;"></div>
            <div class="split-bar-fill-season" style="width: ${pot.seasonSplitPercent}%;"></div>
          </div>
          <div class="split-bar-labels">
            <span class="label-left text-cyan">${pot.weeklySplitPercent}% Weekly Pools</span>
            <span class="label-right text-green">${pot.seasonSplitPercent}% Season Vault</span>
          </div>
        </div>

        <div class="bento-card-footer">
          <span class="footer-check">${svgIcon('checkCircle', 14, 'text-green')}</span>
          <span class="footer-text">
            <strong>${pot.totalCompletedPot.toLocaleString()} Credits</strong> locked across completed matches
          </span>
        </div>
      </div>

      <!-- Card 2: Season Grand Jackpot (50%) -->
      <div class="bento-card bento-card-season">
        <div class="bento-card-header">
          <div class="bento-tag text-green">
            ${svgIcon('trophy', 16)}
            <span>SEASON GRAND JACKPOT (50%)</span>
          </div>
          <span class="bento-pill-green">GW 38 Award</span>
        </div>

        <div class="bento-primary-metric">
          <span class="metric-large text-green">${pot.totalSeasonJackpot.toLocaleString()}</span>
          <span class="metric-unit">CREDITS</span>
        </div>

        <div class="bento-spotlight-box">
          ${leader ? `
            <div class="spotlight-title">PROJECTED SEASON CHAMPION</div>
            <div class="spotlight-winner-row">
              <div class="spotlight-avatars">
                ${pot.seasonLeaders.map(l => getPlayerAvatar(l, 28)).join('')}
              </div>
              <div class="spotlight-details">
                <span class="spotlight-names">
                  ${pot.seasonLeaders.map(l => `<span style="color:${getPlayerColor(l)};font-weight:700;">${escapeHtml(l.name)}</span>`).join(' &amp; ')}
                </span>
                <span class="spotlight-sub">
                  ${leader.totalPoints} pts ${isTie ? '· (Co-Leaders Tie)' : '· #1 Overall'}
                </span>
              </div>
            </div>
          ` : `
            <div class="spotlight-empty">
              ${svgIcon('clock', 14)}
              <span>Awaiting completed gameweeks</span>
            </div>
          `}
        </div>

        <div class="bento-card-footer">
          <span class="footer-text text-muted">
            Vault accrued: <strong>${pot.accumulatedSeasonJackpot.toLocaleString()} Credits</strong> from finished games
          </span>
        </div>
      </div>

      <!-- Card 3: Latest / Live Gameweek Winner (50%) -->
      <div class="bento-card bento-card-latest">
        <div class="bento-card-header">
          <div class="bento-tag text-cyan">
            ${svgIcon('crown', 16)}
            <span>${activeLiveGw ? `GW ${activeLiveGw.gw} IN PROGRESS` : (latestFinishedGw ? `GW ${latestFinishedGw.gw} WINNER` : 'LATEST GW')}</span>
          </div>
          ${activeLiveGw
            ? `<span class="bento-pill-live">${svgIcon('activity', 12)} Live</span>`
            : (latestFinishedGw ? `<span class="bento-pill-cyan">Completed</span>` : '')}
        </div>

        ${latestFinishedGw ? `
          <div class="bento-primary-metric">
            <span class="metric-medium text-cyan">${pot.gwPots[latestFinishedGw.gw]?.weeklyPool || 0}</span>
            <span class="metric-unit">CR WEEKLY POOL</span>
          </div>

          <div class="bento-spotlight-box">
            <div class="spotlight-title">${latestFinishedGw.isTie ? 'TIE FOR 1ST PLACE' : 'GAMEWEEK WINNER'}</div>
            <div class="spotlight-winner-row">
              <div class="spotlight-avatars">
                ${latestFinishedGw.winners.map(w => getPlayerAvatar(w, 28)).join('')}
              </div>
              <div class="spotlight-details">
                <span class="spotlight-names">
                  ${latestFinishedGw.winners.map(w => `<span style="color:${getPlayerColor(w)};font-weight:700;">${escapeHtml(w.name)}</span>`).join(' &amp; ')}
                </span>
                <span class="spotlight-sub">
                  ${latestFinishedGw.maxPoints} pts · Won +${pot.gwPots[latestFinishedGw.gw]?.payoutPerWinner || 0} cr each
                </span>
              </div>
            </div>
          </div>
        ` : `
          <div class="bento-empty-wrap">
            <p class="text-muted">No completed gameweeks recorded yet in group scope.</p>
          </div>
        `}

        <div class="bento-card-footer">
          <span class="footer-text">
            Distributed to date: <strong>${pot.totalWeeklyCreditsDistributed.toLocaleString()} Credits</strong>
          </span>
        </div>
      </div>
    </section>
  `;
}

/**
 * Route Sub-Tab Content
 */
function renderActiveTab(state, weeklyCalc, potCalc) {
  if (wagersState.activeSubTab === 'weekly') {
    return renderWeeklyTab(state, weeklyCalc, potCalc);
  }
  if (wagersState.activeSubTab === 'stakes') {
    return renderStakesTab(state, weeklyCalc, potCalc);
  }
  return renderLedgerTab(state, weeklyCalc, potCalc);
}

/**
 * TAB 1: WEEKLY TIMELINE & TIES (FOCUSED BY DEFAULT - ZERO SCROLLING)
 */
function renderWeeklyTab(state, { weeklyResults, leaderboard }, pot) {
  const currentGwNum = wagersState.selectedGw;
  const currentRes = weeklyResults.find(w => w.gw === currentGwNum) || weeklyResults[0];
  const activeLiveGw = weeklyResults.find(w => w.isLive);

  // Determine prev and next in-scope gameweek numbers
  const currentIndex = weeklyResults.findIndex(w => w.gw === currentGwNum);
  const prevGwNum = currentIndex > 0 ? weeklyResults[currentIndex - 1].gw : null;
  const nextGwNum = currentIndex !== -1 && currentIndex < weeklyResults.length - 1 ? weeklyResults[currentIndex + 1].gw : null;

  return `
    <div class="wagers-timeline-container">
      <!-- Honours Leaderboard Card (Compact Season Overview) -->
      <section class="wagers-section-card glass-card">
        <div class="section-card-header">
          <div class="section-title-wrap">
            <span class="section-icon text-gold">${svgIcon('trophy', 18)}</span>
            <h3 class="section-title">League Honours &amp; Gameweek Titles</h3>
          </div>
          <span class="section-subtext">Season Standings in Group Scope</span>
        </div>

        <div class="wagers-table-scroll">
          <table class="wagers-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 55px;">Rank</th>
                <th>Member</th>
                <th class="text-center">GW Wins</th>
                <th class="text-center">GW Ties</th>
                <th class="text-center">Best GW</th>
                <th class="text-right">Total Points</th>
                <th class="text-right">Weekly Won</th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.map(p => {
                const entry = pot.ledger.find(l => l.id === p.id);
                const wonCr = entry?.weeklyCreditsWon || 0;
                return `
                  <tr class="${p.rank === 1 ? 'row-rank-1' : ''}">
                    <td class="text-center">
                      <span class="lb-rank-badge rank-${p.rank}" title="Rank #${p.rank}">
                        ${getRankBadgeHtml(p.rank, { size: 26, className: 'lb-rank-asset' })}
                      </span>
                    </td>
                    <td>
                      ${renderPlayerNameCell(p, 28, p.rank === 1, p.id === state.auth?.activePlayerId)}
                    </td>
                    <td class="text-center">
                      <span class="stat-highlight ${p.gwWins > 0 ? 'text-gold' : 'text-dim'}">
                        ${p.gwWins > 0 ? `${svgIcon('crown', 14)} ${p.gwWins}` : '—'}
                      </span>
                    </td>
                    <td class="text-center">
                      <span class="stat-highlight ${p.gwTies > 0 ? 'text-cyan' : 'text-dim'}">
                        ${p.gwTies > 0 ? `${svgIcon('handshake', 14)} ${p.gwTies}` : '—'}
                      </span>
                    </td>
                    <td class="text-center font-mono">
                      ${p.bestGwScore > 0 ? `<span class="badge-best-score">${p.bestGwScore} pts</span>` : '—'}
                    </td>
                    <td class="text-right font-mono font-bold text-main">
                      ${p.totalPoints} pts
                    </td>
                    <td class="text-right font-mono font-bold text-gold">
                      +${wonCr.toLocaleString()} cr
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Intuitive Gameweek Navigator Toolbar (Prev/Next + Horizontal Pill Carousel) -->
      <div class="gw-nav-controller glass-card">
        <div class="gw-nav-top-row">
          <div class="gw-nav-title-group">
            <span class="gw-nav-icon text-cyan">${svgIcon('calendar', 18)}</span>
            <div>
              <h4 class="gw-nav-heading">Gameweek Navigator</h4>
              <span class="gw-nav-subtext">Select a gameweek to view details without scrolling</span>
            </div>
          </div>

          <div class="gw-nav-actions">
            ${activeLiveGw && activeLiveGw.gw !== currentGwNum ? `
              <button type="button" class="btn btn-sm gw-jump-live-btn" id="btnJumpToLiveGw" title="Jump to Active GW ${activeLiveGw.gw}">
                ${svgIcon('activity', 13)}
                <span>Jump to Active (GW ${activeLiveGw.gw})</span>
              </button>
            ` : ''}

            <!-- View Mode Switch: Focused vs All GWs Summary Table -->
            <div class="gw-view-mode-toggle">
              <button type="button" class="view-mode-btn ${wagersState.gwViewMode === 'focused' ? 'active' : ''}" id="btnViewModeFocused" title="Focused Active Gameweek">
                ${svgIcon('layout', 13)}
                <span>Focused GW</span>
              </button>
              <button type="button" class="view-mode-btn ${wagersState.gwViewMode === 'overview' ? 'active' : ''}" id="btnViewModeOverview" title="All Gameweeks Summary Table">
                ${svgIcon('table', 13)}
                <span>All GWs Table</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Carousel Strip with Arrows -->
        <div class="gw-pills-carousel">
          <button type="button" class="gw-carousel-arrow arrow-prev" id="gwCarouselPrevBtn" ${prevGwNum ? '' : 'disabled'} aria-label="Previous Gameweek">
            ${svgIcon('chevronLeft', 16)}
          </button>

          <div class="gw-pills-track" id="gwPillsTrack">
            ${weeklyResults.map(res => {
              const isSelected = res.gw === currentGwNum;
              const isCurrentLive = res.isLive;
              const isCompleted = res.isFinished;
              return `
                <button
                  type="button"
                  class="gw-pill-btn ${isSelected ? 'selected' : ''} ${isCurrentLive ? 'pill-live' : ''} ${isCompleted ? 'pill-completed' : ''}"
                  data-gw="${res.gw}"
                  id="gwPillBtn_${res.gw}"
                  aria-selected="${isSelected ? 'true' : 'false'}"
                >
                  <span class="pill-gw-num">GW ${res.gw}</span>
                  ${isCurrentLive ? `<span class="pill-dot-live" title="Live Now"></span>` : ''}
                  ${isCompleted ? `<span class="pill-check" title="Completed">${svgIcon('checkCircle', 11)}</span>` : ''}
                </button>
              `;
            }).join('')}
          </div>

          <button type="button" class="gw-carousel-arrow arrow-next" id="gwCarouselNextBtn" ${nextGwNum ? '' : 'disabled'} aria-label="Next Gameweek">
            ${svgIcon('chevronRight', 16)}
          </button>
        </div>
      </div>

      <!-- Main Gameweek Content: Focused Active Gameweek or Full Table Overview -->
      ${wagersState.gwViewMode === 'focused'
        ? renderFocusedGameweek(currentRes, state, pot, prevGwNum, nextGwNum)
        : renderAllGameweeksTable(weeklyResults, state.players, pot)}
    </div>
  `;
}

/**
 * Focused Single Gameweek Component (Zero Scrolling, Full Details & Match Scores)
 */
function renderFocusedGameweek(res, state, pot, prevGw, nextGw) {
  if (!res) {
    return `<div class="gw-cards-empty glass-card"><p>No gameweek data available.</p></div>`;
  }

  const gwPot = pot.gwPots[res.gw] || { totalStake: 0, weeklyPool: 0, seasonPool: 0, payoutPerWinner: 0 };

  const statusBadge = res.isFinished
    ? `<span class="status-badge status-completed">${svgIcon('checkCircle', 12)} Completed</span>`
    : res.isLive
    ? `<span class="status-badge status-live">${svgIcon('activity', 12)} Live in Progress (${res.finishedCount}/${res.matchCount} Matches)</span>`
    : `<span class="status-badge status-upcoming">${svgIcon('clock', 12)} Upcoming (${res.matchCount} Matches Scheduled)</span>`;

  let spotlightBanner = '';
  if (res.isFinished) {
    if (res.isTie) {
      spotlightBanner = `
        <div class="focused-spotlight-banner banner-tie">
          <div class="spotlight-banner-left">
            <span class="spotlight-banner-badge">${svgIcon('handshake', 15)} TIE FOR 1ST PLACE</span>
            <div class="spotlight-names-wrap">
              <div class="spotlight-avatars-cluster">
                ${res.winners.map(w => getPlayerAvatar(w, 28)).join('')}
              </div>
              <span class="spotlight-winner-names">${res.winners.map(w => `<span style="color:${getPlayerColor(w)};font-weight:700;">${escapeHtml(w.name)}</span>`).join(' &amp; ')}</span>
              <span class="spotlight-subtext">Scored <strong>${res.maxPoints} pts</strong> each · Split weekly pool equally</span>
            </div>
          </div>
          <div class="spotlight-payout-box">
            <span class="payout-label">SPLIT PAYOUT EACH</span>
            <span class="payout-number font-mono text-cyan">+${gwPot.payoutPerWinner.toLocaleString()} cr</span>
          </div>
        </div>
      `;
    } else if (res.winners.length === 1) {
      const winner = res.winners[0];
      const shades = getPlayerColorShades(winner);
      spotlightBanner = `
        <div class="focused-spotlight-banner banner-win">
          <div class="spotlight-banner-left">
            <span class="spotlight-banner-badge">${svgIcon('crown', 15)} GAMEWEEK WINNER</span>
            <div class="spotlight-names-wrap">
              <div class="spotlight-avatar-row">
                ${getPlayerAvatar(winner, 32)}
                <span class="player-color-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${shades.primary};box-shadow:0 0 6px ${shades.glow};margin-left:4px;"></span>
                <span class="spotlight-winner-names" style="color:${shades.primary};">${escapeHtml(winner.name)}</span>
              </div>
              <span class="spotlight-subtext">Top score of <strong>${res.maxPoints} pts</strong> this gameweek</span>
            </div>
          </div>
          <div class="spotlight-payout-box">
            <span class="payout-label">WEEKLY PRIZE WON</span>
            <span class="payout-number font-mono text-gold">+${gwPot.payoutPerWinner.toLocaleString()} cr</span>
          </div>
        </div>
      `;
    }
  } else if (res.isLive) {
    spotlightBanner = `
      <div class="focused-spotlight-banner banner-live">
        <div class="spotlight-banner-left">
          <span class="spotlight-banner-badge">${svgIcon('activity', 13)} PROVISIONAL LEADER</span>
          <div class="spotlight-names-wrap">
            <div class="spotlight-avatars-cluster">
              ${res.winners.map(w => getPlayerAvatar(w, 26)).join('')}
            </div>
            <span class="spotlight-winner-names">${res.winners.map(w => `<span style="color:${getPlayerColor(w)};font-weight:700;">${escapeHtml(w.name)}</span>`).join(' &amp; ')}</span>
            <span class="spotlight-subtext">Currently leading with <strong>${res.maxPoints} pts</strong> · ${res.matchCount - res.finishedCount} matches in progress / remaining</span>
          </div>
        </div>
        <div class="spotlight-payout-box">
          <span class="payout-label">PROJECTED POOL</span>
          <span class="payout-number font-mono text-gold">${gwPot.weeklyPool.toLocaleString()} cr</span>
        </div>
      </div>
    `;
  } else {
    spotlightBanner = `
      <div class="focused-spotlight-banner banner-upcoming">
        <div class="spotlight-banner-left">
          <span class="spotlight-banner-badge text-dim">${svgIcon('clock', 13)} UPCOMING GAMEWEEK</span>
          <div class="spotlight-names-wrap">
            <span class="spotlight-winner-names text-dim">Fixtures Scheduled</span>
            <span class="spotlight-subtext">Player wagers committed · Points will calculate live as games kick off</span>
          </div>
        </div>
        <div class="spotlight-payout-box">
          <span class="payout-label">TOTAL STAKED</span>
          <span class="payout-number font-mono text-dim">${gwPot.totalStake.toLocaleString()} cr</span>
        </div>
      </div>
    `;
  }

  // Sorted player scores for this GW
  const rankedPlayers = [...state.players].sort((a, b) => (res.scores[b.id] || 0) - (res.scores[a.id] || 0));

  return `
    <div class="focused-gw-view">
      <!-- Gameweek Hero Bar -->
      <div class="focused-gw-hero glass-card">
        <div class="focused-hero-left">
          <div class="focused-gw-badge-row">
            <h3 class="focused-gw-title">Gameweek ${res.gw}</h3>
            ${statusBadge}
          </div>
          <div class="focused-gw-pot-pills">
            <span class="pot-pill-item">
              ${svgIcon('coins', 14, 'text-gold')}
              GW Pot: <strong class="text-gold">${gwPot.totalStake.toLocaleString()} cr</strong>
            </span>
            <span class="meta-dot">·</span>
            <span class="pot-pill-item">
              Weekly Winner Pool (50%): <strong class="text-cyan">${gwPot.weeklyPool.toLocaleString()} cr</strong>
            </span>
            <span class="meta-dot">·</span>
            <span class="pot-pill-item">
              Season Vault (50%): <strong class="text-green">${gwPot.seasonPool.toLocaleString()} cr</strong>
            </span>
          </div>
        </div>

        <div class="focused-gw-pagination">
          <button type="button" class="btn btn-sm btn-gw-prev" id="btnFocusedPrevGw" ${prevGw ? '' : 'disabled'} title="Previous Gameweek">
            ${svgIcon('arrowLeft', 13)}
            <span>GW ${prevGw || '—'}</span>
          </button>
          <button type="button" class="btn btn-sm btn-gw-next" id="btnFocusedNextGw" ${nextGw ? '' : 'disabled'} title="Next Gameweek">
            <span>GW ${nextGw || '—'}</span>
            ${svgIcon('arrowRight', 13)}
          </button>
        </div>
      </div>

      <!-- Winner / Status Spotlight Banner -->
      ${spotlightBanner}

      <!-- 2-Column Responsive Layout: Standings on Left, Matches on Right -->
      <div class="focused-gw-content-grid">
        <!-- Column 1: Gameweek Member Standings -->
        <div class="focused-standings-card glass-card">
          <div class="card-inner-header">
            <div class="inner-title-wrap">
              <span class="text-gold">${svgIcon('crown', 16)}</span>
              <h4 class="inner-title">GW ${res.gw} Standings</h4>
            </div>
            <span class="inner-meta-tag">${state.players.length} Members</span>
          </div>

          <table class="focused-standings-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 50px;">Rank</th>
                <th>Member</th>
                <th class="text-right">Points</th>
                <th class="text-right">Credits Won</th>
              </tr>
            </thead>
            <tbody>
              ${rankedPlayers.map((p, idx) => {
                const pts = res.scores[p.id] || 0;
                const isWinner = (res.isFinished || res.isLive) && res.winners.some(w => w.id === p.id);
                const payoutCr = res.isFinished && isWinner ? gwPot.payoutPerWinner : 0;
                const isYou = state.auth?.activePlayerId === p.id;
                return `
                  <tr class="${isWinner ? 'row-winner' : ''} ${isYou ? 'row-self-highlight' : ''}">
                    <td class="text-center">
                      <span class="lb-rank-badge ${isWinner ? 'rank-1' : `rank-${idx + 1}`}" title="Rank #${idx + 1}">
                        ${getRankBadgeHtml(idx + 1, { size: 24, className: 'lb-rank-asset' })}
                      </span>
                    </td>
                    <td>
                      ${renderPlayerNameCell(p, 26, isWinner, isYou)}
                    </td>
                    <td class="text-right font-mono font-bold ${isWinner ? 'text-gold' : 'text-main'}">
                      ${pts} pts
                    </td>
                    <td class="text-right font-mono font-bold">
                      ${payoutCr > 0 ? `<span class="text-gold">+${payoutCr.toLocaleString()} cr</span>` : `<span class="text-dim">—</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Column 2: In-Scope Matches for this GW (Directly Visible, Zero Hidden Clicks!) -->
        <div class="focused-matches-card glass-card">
          <div class="card-inner-header">
            <div class="inner-title-wrap">
              <span class="text-cyan">${svgIcon('calendar', 16)}</span>
              <h4 class="inner-title">Matches in Scope (${res.matches.length})</h4>
            </div>
            <span class="inner-meta-tag">${res.finishedCount}/${res.matchCount} Completed</span>
          </div>

          <div class="focused-matches-list">
            ${res.matches.map(m => {
              const hasScore = m.actual_home_score !== null && m.actual_away_score !== null;
              const homeShort = m.home_short || (m.home_name ? m.home_name.slice(0, 3).toUpperCase() : 'HOM');
              const awayShort = m.away_short || (m.away_name ? m.away_name.slice(0, 3).toUpperCase() : 'AWA');
              return `
                <div class="focused-match-row ${m.finished ? 'match-finished' : (m.started ? 'match-live' : 'match-upcoming')}">
                  <!-- Home Team -->
                  <div class="focused-team home-team" title="${escapeHtml(m.home_name)} (${escapeHtml(homeShort)})">
                    <span class="team-name team-name-full">${escapeHtml(m.home_name)}</span>
                    <span class="team-name team-name-short">${escapeHtml(homeShort)}</span>
                    <span class="team-crest">${getCrestImg(m.home_code, m.home_name)}</span>
                  </div>

                  <!-- Score / Time Display -->
                  <div class="focused-score-center">
                    ${hasScore ? `
                      <div class="score-display-box font-mono ${m.finished ? 'final' : 'live'}">
                        <span>${m.actual_home_score}</span>
                        <span class="score-sep">-</span>
                        <span>${m.actual_away_score}</span>
                      </div>
                      <span class="score-sub-status ${m.finished ? 'text-green' : 'text-gold'}">${m.finished ? 'FT' : 'LIVE'}</span>
                    ` : `
                      <div class="score-time-box">
                        <span class="score-vs">VS</span>
                        <span class="score-ko-time ko-full">${formatKickoffTime(m.kickoff_time, state.timezone)}</span>
                        <span class="score-ko-time ko-short">${formatCompactKickoffTime(m.kickoff_time, state.timezone)}</span>
                      </div>
                    `}
                  </div>

                  <!-- Away Team -->
                  <div class="focused-team away-team" title="${escapeHtml(m.away_name)} (${escapeHtml(awayShort)})">
                    <span class="team-crest">${getCrestImg(m.away_code, m.away_name)}</span>
                    <span class="team-name team-name-full">${escapeHtml(m.away_name)}</span>
                    <span class="team-name team-name-short">${escapeHtml(awayShort)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * All Gameweeks Summary Table (Alternative Compact View for Scanning the Full Season)
 */
function renderAllGameweeksTable(weeklyResults, players, pot) {
  return `
    <section class="wagers-section-card glass-card">
      <div class="section-card-header">
        <div class="section-title-wrap">
          <span class="section-icon text-cyan">${svgIcon('table', 18)}</span>
          <h3 class="section-title">All Gameweeks Summary Matrix</h3>
        </div>
        <span class="section-subtext">Click any row to jump to focused gameweek</span>
      </div>

      <div class="wagers-table-scroll">
        <table class="wagers-table all-gws-table">
          <thead>
            <tr>
              <th style="width: 75px;">GW</th>
              <th style="width: 130px;">Status</th>
              <th>Winner(s) / Ties</th>
              <th class="text-center" style="width: 100px;">Top Score</th>
              <th class="text-right" style="width: 120px;">Weekly Pool</th>
              <th class="text-right" style="width: 130px;">Payout Each</th>
              <th class="text-center" style="width: 90px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${weeklyResults.map(res => {
              const gwPot = pot.gwPots[res.gw] || { totalStake: 0, weeklyPool: 0, payoutPerWinner: 0 };
              const isSelected = res.gw === wagersState.selectedGw;

              return `
                <tr class="gw-summary-row ${isSelected ? 'row-selected' : ''}" data-gw="${res.gw}">
                  <td class="font-mono font-bold text-cyan">GW ${res.gw}</td>
                  <td>
                    ${res.isFinished
                      ? `<span class="status-badge status-completed">${svgIcon('checkCircle', 11)} Completed</span>`
                      : res.isLive
                      ? `<span class="status-badge status-live">${svgIcon('activity', 11)} Live (${res.finishedCount}/${res.matchCount})</span>`
                      : `<span class="status-badge status-upcoming">${svgIcon('clock', 11)} Upcoming</span>`}
                  </td>
                  <td>
                    ${res.isFinished
                      ? `<div class="table-player-cell">
                          ${res.isTie ? svgIcon('handshake', 14, 'text-cyan') : svgIcon('crown', 14, 'text-gold')}
                          <span class="font-bold ${res.isTie ? 'text-cyan' : 'text-gold'}">${res.winners.map(w => escapeHtml(w.name)).join(' &amp; ')}</span>
                         </div>`
                      : res.isLive
                      ? `<span class="text-gold font-bold">Provisional: ${res.winners.map(w => escapeHtml(w.name)).join(' &amp; ')}</span>`
                      : `<span class="text-dim">Matches Scheduled</span>`}
                  </td>
                  <td class="text-center font-mono font-bold">
                    ${res.hasScores ? `${res.maxPoints} pts` : '—'}
                  </td>
                  <td class="text-right font-mono font-bold text-gold">
                    ${gwPot.weeklyPool.toLocaleString()} cr
                  </td>
                  <td class="text-right font-mono font-bold">
                    ${res.isFinished && gwPot.payoutPerWinner > 0 ? `<span class="text-gold">+${gwPot.payoutPerWinner.toLocaleString()} cr</span>` : '—'}
                  </td>
                  <td class="text-center">
                    <button type="button" class="btn btn-xs btn-inspect-gw" data-gw="${res.gw}">
                      View
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/**
 * TAB 2: WAGER STAKES & SETTINGS
 * Admin-Only bulk wagering management. No individual match-by-match editing.
 */
function renderStakesTab(state, { inScopeFixtures }, pot) {
  const isAdmin = state.auth.role === 'admin';
  const isPlayer = state.auth.role === 'player';
  const scopeCount = inScopeFixtures.length;

  if (isAdmin) {
    return `
      <div class="wagers-stakes-container">
        <!-- Admin Hero Station Card -->
        <div class="wager-hero-station glass-card">
          <div class="hero-station-header">
            <div class="station-title-box">
              <span class="station-icon text-gold">${svgIcon('shield', 22)}</span>
              <div>
                <h3 class="station-heading">Admin Wager Stakes Management</h3>
                <p class="station-desc">
                  Group members agree on their stake per game in bulk. As admin, update their agreed stake below.
                  Stakes automatically apply across all <strong>${scopeCount} matches in scope</strong> — no match-by-match grid needed.
                </p>
              </div>
            </div>

            <div class="station-auth-badge">
              <span class="auth-chip auth-ok">${svgIcon('checkCircle', 13)} Admin Authorized</span>
            </div>
          </div>

          <!-- Bulk Quick-Preset Toolbar -->
          <div class="station-bulk-toolbar">
            <div class="toolbar-title-wrap">
              <span class="toolbar-icon text-cyan">${svgIcon('zap', 15)}</span>
              <span class="toolbar-title">Set Uniform Stake for All Members:</span>
            </div>
            <div class="preset-chips-tray">
              ${[5, 10, 15, 20, 25, 50, 100].map(val => `
                <button type="button" class="btn-preset-chip" data-val="${val}">
                  ${val} cr
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Member Stakes Configuration Table -->
        <section class="wagers-section-card glass-card">
          <div class="section-card-header">
            <div class="section-title-wrap">
              <span class="section-icon text-gold">${svgIcon('coins', 18)}</span>
              <h3 class="section-title">Member Agreed Stakes</h3>
            </div>
            <span class="section-subtext">${state.players.length} Members · ${scopeCount} Matches in Scope</span>
          </div>

          <div class="wagers-table-scroll">
            <table class="wagers-table member-stakes-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th class="text-center" style="width: 220px;">Stake per Match</th>
                  <th class="text-right" style="width: 140px;">Scope Matches</th>
                  <th class="text-right" style="width: 170px;">Total Staked</th>
                  <th class="text-right" style="width: 150px;">Weekly (50%)</th>
                  <th class="text-right" style="width: 150px;">Season (50%)</th>
                </tr>
              </thead>
              <tbody id="memberStakesTableBody">
                ${state.players.map(p => {
                  const currentVal = pot.playerStakesMap?.[p.id] !== undefined ? pot.playerStakesMap[p.id] : pot.defaultStake;
                  const totalVal = currentVal * scopeCount;
                  const weeklyVal = Math.round(totalVal * (pot.weeklySplitPercent / 100));
                  const seasonVal = totalVal - weeklyVal;

                  return `
                    <tr class="member-stake-row" data-player-id="${p.id}">
                      <td>
                        ${renderPlayerNameCell(p, 28, false, p.id === state.auth?.activePlayerId)}
                      </td>
                      <td class="text-center">
                        <div class="stake-stepper-wrap">
                          <button type="button" class="btn-step-stake step-minus" data-player-id="${p.id}" aria-label="Decrease stake by 5">-5</button>
                          <input
                            type="number"
                            class="member-stake-input font-mono"
                            data-player-id="${p.id}"
                            value="${currentVal}"
                            min="0"
                            max="10000"
                            step="5"
                            aria-label="Stake per match for ${escapeHtml(p.name)}"
                          />
                          <span class="stake-unit font-mono font-bold text-muted">cr</span>
                          <button type="button" class="btn-step-stake step-plus" data-player-id="${p.id}" aria-label="Increase stake by 5">+5</button>
                        </div>
                      </td>
                      <td class="text-right font-mono text-muted">
                        ${scopeCount}
                      </td>
                      <td class="text-right font-mono font-bold text-gold cell-row-total" data-player-id="${p.id}">
                        ${totalVal.toLocaleString()} cr
                      </td>
                      <td class="text-right font-mono text-cyan cell-row-weekly" data-player-id="${p.id}">
                        ${weeklyVal.toLocaleString()} cr
                      </td>
                      <td class="text-right font-mono text-green cell-row-season" data-player-id="${p.id}">
                        ${seasonVal.toLocaleString()} cr
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Bottom Summary & Save Bar -->
          <div class="member-stakes-footer">
            <div class="footer-totals-summary">
              <span class="summary-label text-muted">Total Group Commitment:</span>
              <span class="font-mono font-bold text-gold" id="footerTotalGroupPot">
                ${pot.totalProjectedPot.toLocaleString()} cr
              </span>
              <span class="summary-sub text-muted">(${state.players.length} members × ${scopeCount} matches)</span>
            </div>

            <div class="footer-btn-wrap">
              <button type="button" class="btn btn-primary btn-save-member-stakes" id="btnSaveMemberStakes">
                ${svgIcon('checkCircle', 16)}
                <span>Save Member Stakes</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  // Non-Admin View (Player or Guest)
  return `
    <div class="wagers-stakes-container">
      <div class="wager-hero-station glass-card">
        <div class="hero-station-header">
          <div class="station-title-box">
            <span class="station-icon text-gold">${svgIcon('coins', 22)}</span>
            <div>
              <h3 class="station-heading">League Wager Stakes</h3>
              <p class="station-desc">
                Member wagers are established in bulk across all group matches.
                Every wager is split 50% toward <strong>Weekly Gameweek Winner Pots</strong> and 50% toward the <strong>Season Grand Jackpot</strong>.
              </p>
            </div>
          </div>

          <div class="station-auth-badge">
            <span class="auth-chip auth-guest">${svgIcon('lock', 13)} Admin Managed</span>
          </div>
        </div>

        <div class="station-guest-alert info-banner">
          ${svgIcon('info', 16, 'text-cyan')}
          <span>
            Wager stakes are configured exclusively by the league administrator. To update your agreed stake per match, please notify your group admin.
          </span>
        </div>
      </div>

      <section class="wagers-section-card glass-card">
        <div class="section-card-header">
          <div class="section-title-wrap">
            <span class="section-icon text-cyan">${svgIcon('users', 18)}</span>
            <h3 class="section-title">Active Member Stakes</h3>
          </div>
          <span class="section-subtext">${state.players.length} Members · ${scopeCount} In-Scope Fixtures</span>
        </div>

        <div class="wagers-table-scroll">
          <table class="wagers-table member-stakes-table">
            <thead>
              <tr>
                <th>Member</th>
                <th class="text-center" style="width: 180px;">Stake per Match</th>
                <th class="text-right" style="width: 140px;">Scope Matches</th>
                <th class="text-right" style="width: 170px;">Total Staked</th>
                <th class="text-right" style="width: 150px;">Weekly (50%)</th>
                <th class="text-right" style="width: 150px;">Season (50%)</th>
              </tr>
            </thead>
            <tbody>
              ${state.players.map(p => {
                const currentVal = pot.playerStakesMap?.[p.id] !== undefined ? pot.playerStakesMap[p.id] : pot.defaultStake;
                const totalVal = currentVal * scopeCount;
                const weeklyVal = Math.round(totalVal * (pot.weeklySplitPercent / 100));
                const seasonVal = totalVal - weeklyVal;
                const isSelf = isPlayer && state.auth.activePlayerId === p.id;

                return `
                  <tr class="${isSelf ? 'row-self-highlight' : ''}">
                    <td>
                      ${renderPlayerNameCell(p, 28, false, isSelf)}
                    </td>
                    <td class="text-center">
                      <span class="badge-stake-pill font-mono font-bold text-gold">
                        ${currentVal} cr / match
                      </span>
                    </td>
                    <td class="text-right font-mono text-muted">
                      ${scopeCount}
                    </td>
                    <td class="text-right font-mono font-bold text-main">
                      ${totalVal.toLocaleString()} cr
                    </td>
                    <td class="text-right font-mono text-cyan font-bold">
                      ${weeklyVal.toLocaleString()} cr
                    </td>
                    <td class="text-right font-mono text-green font-bold">
                      ${seasonVal.toLocaleString()} cr
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

/**
 * TAB 3: CREDITS LEDGER & FINANCIAL ROI
 */
function renderLedgerTab(state, weeklyCalc, pot) {
  return `
    <div class="wagers-ledger-container">
      <!-- Financial Summary Bar -->
      <section class="ledger-summary-grid">
        <div class="summary-stat-card glass-card">
          <div class="stat-card-title text-dim">
            ${svgIcon('wallet', 14)}
            <span>TOTAL STAKED IN LEAGUE</span>
          </div>
          <div class="stat-card-number text-gold">
            ${pot.totalProjectedPot.toLocaleString()} <span class="stat-unit">cr</span>
          </div>
          <span class="stat-card-sub text-muted">Committed by all ${state.players.length} members</span>
        </div>

        <div class="summary-stat-card glass-card">
          <div class="stat-card-title text-dim">
            ${svgIcon('crown', 14)}
            <span>WEEKLY PAYOUTS (50%)</span>
          </div>
          <div class="stat-card-number text-cyan">
            ${pot.totalWeeklyCreditsDistributed.toLocaleString()} <span class="stat-unit">cr</span>
          </div>
          <span class="stat-card-sub text-muted">Awarded to gameweek winners</span>
        </div>

        <div class="summary-stat-card glass-card">
          <div class="stat-card-title text-dim">
            ${svgIcon('trophy', 14)}
            <span>SEASON JACKPOT VAULT (50%)</span>
          </div>
          <div class="stat-card-number text-green">
            ${pot.totalSeasonJackpot.toLocaleString()} <span class="stat-unit">cr</span>
          </div>
          <span class="stat-card-sub text-muted">Awarded to Season Champion at GW 38</span>
        </div>
      </section>

      <!-- Complete Ledger Table -->
      <section class="wagers-section-card glass-card">
        <div class="section-card-header">
          <div class="section-title-wrap">
            <span class="section-icon text-gold">${svgIcon('chartBar', 18)}</span>
            <h3 class="section-title">Member Credit Balances &amp; ROI</h3>
          </div>
          <span class="section-subtext">50% Weekly Payouts · 50% Season End Pool</span>
        </div>

        <div class="wagers-table-scroll">
          <table class="wagers-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 55px;">Rank</th>
                <th>Member</th>
                <th class="text-right">Total Staked</th>
                <th class="text-right">Weekly Won</th>
                <th class="text-right">Projected Season</th>
                <th class="text-right">Total Return</th>
                <th class="text-right">Net Balance (+/-)</th>
                <th class="text-right">Net ROI</th>
              </tr>
            </thead>
            <tbody>
              ${pot.ledger.map((entry, idx) => {
                const netPositive = entry.netCredits >= 0;
                return `
                  <tr class="${idx === 0 ? 'row-rank-1' : ''}">
                    <td class="text-center">
                      <span class="lb-rank-badge rank-${idx + 1}" title="Rank #${idx + 1}">
                        ${getRankBadgeHtml(idx + 1, { size: 26, className: 'lb-rank-asset' })}
                      </span>
                    </td>
                    <td>
                      ${renderPlayerNameCell(entry, 28, idx === 0, entry.id === state.auth?.activePlayerId)}
                    </td>
                    <td class="text-right font-mono text-muted">
                      ${entry.totalStaked.toLocaleString()} cr
                    </td>
                    <td class="text-right font-mono font-bold text-cyan">
                      +${entry.weeklyCreditsWon.toLocaleString()} cr
                    </td>
                    <td class="text-right font-mono font-bold text-green">
                      ${entry.projectedSeasonWon > 0 ? `+${entry.projectedSeasonWon.toLocaleString()} cr` : '—'}
                    </td>
                    <td class="text-right font-mono font-bold text-main">
                      ${entry.totalReturn.toLocaleString()} cr
                    </td>
                    <td class="text-right">
                      <span class="balance-badge ${netPositive ? 'balance-pos' : 'balance-neg'}">
                        ${netPositive ? svgIcon('trendingUp', 12) : svgIcon('trendingDown', 12)}
                        ${netPositive ? '+' : ''}${entry.netCredits.toLocaleString()} cr
                      </span>
                    </td>
                    <td class="text-right font-mono font-bold">
                      <span class="${netPositive ? 'text-green' : 'text-rose'}">
                        ${entry.roi >= 0 ? '+' : ''}${entry.roi}%
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

/**
 * Event Handlers & User Interactions
 */
function attachWagersEvents(state, weeklyCalc, pot) {
  // Sub-Tab Switchers
  document.getElementById('subTabWeeklyWinners')?.addEventListener('click', () => {
    wagersState.activeSubTab = 'weekly';
    renderWagersView(state);
  });

  document.getElementById('subTabWagerStakes')?.addEventListener('click', () => {
    wagersState.activeSubTab = 'stakes';
    renderWagersView(state);
  });

  document.getElementById('subTabCreditLedger')?.addEventListener('click', () => {
    wagersState.activeSubTab = 'ledger';
    renderWagersView(state);
  });

  // View Mode Switch: Focused GW vs All GWs Table
  document.getElementById('btnViewModeFocused')?.addEventListener('click', () => {
    wagersState.gwViewMode = 'focused';
    renderWagersView(state);
  });

  document.getElementById('btnViewModeOverview')?.addEventListener('click', () => {
    wagersState.gwViewMode = 'overview';
    renderWagersView(state);
  });

  // Gameweek Pill Navigation in Carousel
  document.querySelectorAll('.gw-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const gwNum = Number(btn.dataset.gw);
      wagersState.selectedGw = gwNum;
      wagersState.gwViewMode = 'focused';
      renderWagersView(state);
    });
  });

  // Gameweek Carousel Prev / Next Arrow buttons
  document.getElementById('gwCarouselPrevBtn')?.addEventListener('click', () => {
    const list = weeklyCalc.weeklyResults;
    const idx = list.findIndex(w => w.gw === wagersState.selectedGw);
    if (idx > 0) {
      wagersState.selectedGw = list[idx - 1].gw;
      wagersState.gwViewMode = 'focused';
      renderWagersView(state);
    }
  });

  document.getElementById('gwCarouselNextBtn')?.addEventListener('click', () => {
    const list = weeklyCalc.weeklyResults;
    const idx = list.findIndex(w => w.gw === wagersState.selectedGw);
    if (idx !== -1 && idx < list.length - 1) {
      wagersState.selectedGw = list[idx + 1].gw;
      wagersState.gwViewMode = 'focused';
      renderWagersView(state);
    }
  });

  // Focused Hero Prev / Next buttons
  document.getElementById('btnFocusedPrevGw')?.addEventListener('click', () => {
    const list = weeklyCalc.weeklyResults;
    const idx = list.findIndex(w => w.gw === wagersState.selectedGw);
    if (idx > 0) {
      wagersState.selectedGw = list[idx - 1].gw;
      renderWagersView(state);
    }
  });

  document.getElementById('btnFocusedNextGw')?.addEventListener('click', () => {
    const list = weeklyCalc.weeklyResults;
    const idx = list.findIndex(w => w.gw === wagersState.selectedGw);
    if (idx !== -1 && idx < list.length - 1) {
      wagersState.selectedGw = list[idx + 1].gw;
      renderWagersView(state);
    }
  });

  // Jump to Live / Active GW
  document.getElementById('btnJumpToLiveGw')?.addEventListener('click', () => {
    const liveGw = weeklyCalc.weeklyResults.find(w => w.isLive);
    if (liveGw) {
      wagersState.selectedGw = liveGw.gw;
      wagersState.gwViewMode = 'focused';
      renderWagersView(state);
    }
  });

  // All GWs Summary Matrix Row click -> Switch to focused view
  document.querySelectorAll('.btn-inspect-gw, .gw-summary-row').forEach(el => {
    el.addEventListener('click', (e) => {
      const gwNum = Number(el.dataset.gw || el.closest('[data-gw]')?.dataset?.gw);
      if (gwNum) {
        wagersState.selectedGw = gwNum;
        wagersState.gwViewMode = 'focused';
        renderWagersView(state);
      }
    });
  });

  // Preset Chips: Set all member inputs uniformly (Admin)
  document.querySelectorAll('.btn-preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.getAttribute('data-val'));
      document.querySelectorAll('.member-stake-input').forEach(inp => {
        inp.value = val;
      });
      recalculateMemberStakesSummary(weeklyCalc.inScopeFixtures.length, pot.weeklySplitPercent);
    });
  });

  // Stepper buttons (-5, +5) (Admin)
  document.querySelectorAll('.btn-step-stake').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.getAttribute('data-player-id');
      const input = document.querySelector(`.member-stake-input[data-player-id="${pId}"]`);
      if (!input) return;
      const current = Math.max(0, parseInt(input.value, 10) || 0);
      const isMinus = btn.classList.contains('step-minus');
      const step = 5;
      const next = isMinus ? Math.max(0, current - step) : current + step;
      input.value = next;
      recalculateMemberStakesSummary(weeklyCalc.inScopeFixtures.length, pot.weeklySplitPercent);
    });
  });

  // Direct numeric input change (Admin)
  document.querySelectorAll('.member-stake-input').forEach(inp => {
    inp.addEventListener('input', () => {
      recalculateMemberStakesSummary(weeklyCalc.inScopeFixtures.length, pot.weeklySplitPercent);
    });
  });

  // Save Member Stakes (Admin Only)
  document.getElementById('btnSaveMemberStakes')?.addEventListener('click', async () => {
    const inputs = document.querySelectorAll('.member-stake-input');
    const stakes = [];
    inputs.forEach(inp => {
      const playerId = Number(inp.dataset.playerId);
      const amount = Math.max(0, parseInt(inp.value, 10) || 0);
      stakes.push({ player_id: playerId, stake_per_match: amount });
    });

    if (stakes.length === 0) return;

    const matchIds = weeklyCalc.inScopeFixtures.map(m => m.id);
    const btn = document.getElementById('btnSaveMemberStakes');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${svgIcon('activity', 16, 'spin')} <span>Saving Member Stakes...</span>`;
    }

    try {
      await apiSavePlayerStakes(state.activeGroup.id, stakes, matchIds);
      // Re-fetch updated wagers and player stakes
      wagersState.wagersData = await apiFetchGroupWagers(state.activeGroup.id);
      renderWagersView(state);
    } catch (err) {
      alert('Failed to save member stakes: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${svgIcon('checkCircle', 16)} <span>Save Member Stakes</span>`;
      }
    }
  });
}

function recalculateMemberStakesSummary(scopeCount, weeklySplitPercent) {
  let groupTotal = 0;
  const inputs = document.querySelectorAll('.member-stake-input');
  inputs.forEach(inp => {
    const pId = inp.dataset.playerId;
    const val = Math.max(0, parseInt(inp.value, 10) || 0);
    const rowTotal = val * scopeCount;
    const weeklyVal = Math.round(rowTotal * (weeklySplitPercent / 100));
    const seasonVal = rowTotal - weeklyVal;
    groupTotal += rowTotal;

    const rowTotalEl = document.querySelector(`.cell-row-total[data-player-id="${pId}"]`);
    if (rowTotalEl) rowTotalEl.textContent = `${rowTotal.toLocaleString()} cr`;

    const rowWeeklyEl = document.querySelector(`.cell-row-weekly[data-player-id="${pId}"]`);
    if (rowWeeklyEl) rowWeeklyEl.textContent = `${weeklyVal.toLocaleString()} cr`;

    const rowSeasonEl = document.querySelector(`.cell-row-season[data-player-id="${pId}"]`);
    if (rowSeasonEl) rowSeasonEl.textContent = `${seasonVal.toLocaleString()} cr`;
  });

  const footerTotal = document.getElementById('footerTotalGroupPot');
  if (footerTotal) {
    footerTotal.textContent = `${groupTotal.toLocaleString()} cr`;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
