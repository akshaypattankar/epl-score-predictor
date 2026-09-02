// whatIfStandings.js - Premier League Standings Simulator & "What-If" Scenario Tester
import { getCrestImg, CLUB_DIRECTORY, FALLBACK_TEAMS } from './api.js';

// Local UI state for What-If view
const whatIfState = {
  selectedPlayerId: null,
  mode: 'completed', // 'completed' | 'all'
  layout: 'comparison', // 'comparison' | 'split'
  searchQuery: '',
  expandedTeamId: null,
  gwLimit: 'all',
};

/**
 * Evaluates Premier League table standings for both Real-Life and What-If (Player Predictions) universes.
 *
 * @param {Object} params
 * @param {Object} params.fixtures - Map of fixtures by GW: { [gw]: fixture[] }
 * @param {Object} params.teams - Teams dictionary: { [teamId]: { id, name, short, code } }
 * @param {Object} params.predictions - State predictions: { [`${match_id}_${player_id}`]: { predicted_home, predicted_away } }
 * @param {number|string} params.playerId - Selected player ID to simulate
 * @param {string} [params.mode='completed'] - 'completed' (played matches only) | 'all' (full season projected)
 * @param {number|'all'} [params.gwLimit='all'] - Calculate through specific GW or 'all'
 * @returns {Object} Calculated standings, comparisons, and summary statistics
 */
export function calculateLeagueStandings({
  fixtures = {},
  teams = {},
  predictions = {},
  playerId = null,
  mode = 'completed',
  gwLimit = 'all',
  startGw = 1,
}) {
  // Initialize standard 20 Premier League teams
  const teamList = Object.keys(teams).length > 0
    ? Object.values(teams)
    : CLUB_DIRECTORY.map(c => ({ id: c.id, name: c.name, short: c.short, code: c.code }));

  const createTeamRecord = (t) => ({
    id: t.id,
    name: t.name,
    short: t.short || t.name.slice(0, 3).toUpperCase(),
    code: t.code || t.id,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    rank: 0,
    form: [],
    matches: [],
  });

  const realTableMap = {};
  const simTableMap = {};

  teamList.forEach(t => {
    realTableMap[t.id] = createTeamRecord(t);
    simTableMap[t.id] = createTeamRecord(t);
  });

  let totalEvaluatedMatches = 0;
  let predictedMatchesCount = 0;
  let totalFinishedMatches = 0;

  const gws = Object.keys(fixtures).map(Number).sort((a, b) => a - b);
  let activeGws = gwLimit === 'all' ? gws : gws.filter(gw => gw <= Number(gwLimit));
  if (startGw && Number(startGw) > 1) {
    activeGws = activeGws.filter(gw => gw >= Number(startGw));
  }

  activeGws.forEach(gw => {
    const gwFixtures = fixtures[gw] || [];
    gwFixtures.forEach(f => {
      const homeId = f.team_h;
      const awayId = f.team_a;

      if (!realTableMap[homeId]) realTableMap[homeId] = createTeamRecord({ id: homeId, name: f.home_name || `Team ${homeId}`, short: f.home_short || 'HOM', code: f.home_code || homeId });
      if (!realTableMap[awayId]) realTableMap[awayId] = createTeamRecord({ id: awayId, name: f.away_name || `Team ${awayId}`, short: f.away_short || 'AWY', code: f.away_code || awayId });
      if (!simTableMap[homeId]) simTableMap[homeId] = createTeamRecord({ id: homeId, name: f.home_name || `Team ${homeId}`, short: f.home_short || 'HOM', code: f.home_code || homeId });
      if (!simTableMap[awayId]) simTableMap[awayId] = createTeamRecord({ id: awayId, name: f.away_name || `Team ${awayId}`, short: f.away_short || 'AWY', code: f.away_code || awayId });

      const isFinished = Boolean(f.finished || f.finished_provisional);
      const isStarted = Boolean(f.started || (f.kickoff_time && new Date() >= new Date(f.kickoff_time)));
      const hasActualScore = (f.actual_home_score !== null && f.actual_home_score !== undefined && f.actual_away_score !== null && f.actual_away_score !== undefined);
      const isRealPlayed = (isFinished || isStarted) && hasActualScore;

      if (isRealPlayed) {
        totalFinishedMatches++;
        const actH = Number(f.actual_home_score);
        const actA = Number(f.actual_away_score);

        applyMatchResult(realTableMap[homeId], realTableMap[awayId], actH, actA, {
          fixtureId: f.id,
          gw,
          homeTeam: f.home_name,
          awayTeam: f.away_name,
          homeCode: f.home_code,
          awayCode: f.away_code,
          homeScore: actH,
          awayScore: actA,
          isPrediction: false,
        });
      }

      let predH = null;
      let predA = null;
      let hasPrediction = false;

      if (playerId != null) {
        const predKey = `${f.id}_${playerId}`;
        const p = predictions[predKey];
        if (p && p.predicted_home !== null && p.predicted_home !== undefined && p.predicted_home !== '' &&
               p.predicted_away !== null && p.predicted_away !== undefined && p.predicted_away !== '') {
          predH = Number(p.predicted_home);
          predA = Number(p.predicted_away);
          hasPrediction = !isNaN(predH) && !isNaN(predA);
        }
      }

      let simH = null;
      let simA = null;
      let simSource = null;

      if (mode === 'completed') {
        if (isRealPlayed) {
          totalEvaluatedMatches++;
          if (hasPrediction) {
            simH = predH;
            simA = predA;
            simSource = 'prediction';
            predictedMatchesCount++;
          } else {
            simH = Number(f.actual_home_score);
            simA = Number(f.actual_away_score);
            simSource = 'actual_fallback';
          }
        }
      } else {
        if (hasPrediction) {
          totalEvaluatedMatches++;
          simH = predH;
          simA = predA;
          simSource = 'prediction';
          predictedMatchesCount++;
        } else if (isRealPlayed) {
          totalEvaluatedMatches++;
          simH = Number(f.actual_home_score);
          simA = Number(f.actual_away_score);
          simSource = 'actual_fallback';
        }
      }

      if (simH !== null && simA !== null) {
        applyMatchResult(simTableMap[homeId], simTableMap[awayId], simH, simA, {
          fixtureId: f.id,
          gw,
          homeTeam: f.home_name,
          awayTeam: f.away_name,
          homeCode: f.home_code,
          awayCode: f.away_code,
          homeScore: simH,
          awayScore: simA,
          isPrediction: simSource === 'prediction',
          actualHomeScore: f.actual_home_score,
          actualAwayScore: f.actual_away_score,
        });
      }
    });
  });

  const plSorter = (a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name);
  };

  const realTable = Object.values(realTableMap).sort(plSorter);
  const simTable = Object.values(simTableMap).sort(plSorter);

  realTable.forEach((row, idx) => {
    row.rank = idx + 1;
    row.formSummary = row.form.slice(-5);
  });

  simTable.forEach((row, idx) => {
    row.rank = idx + 1;
    row.formSummary = row.form.slice(-5);
  });

  const realRankMap = Object.fromEntries(realTable.map(r => [r.id, r]));

  const comparisonList = simTable.map(sim => {
    const real = realRankMap[sim.id] || { rank: 20, points: 0, goalDiff: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    const rankDiff = real.rank - sim.rank;
    const ptsDiff = sim.points - real.points;
    const gdDiff = sim.goalDiff - real.goalDiff;

    return {
      id: sim.id,
      name: sim.name,
      short: sim.short,
      code: sim.code,
      simRank: sim.rank,
      simPlayed: sim.played,
      simWon: sim.won,
      simDrawn: sim.drawn,
      simLost: sim.lost,
      simGF: sim.goalsFor,
      simGA: sim.goalsAgainst,
      simGD: sim.goalDiff,
      simPts: sim.points,
      simForm: sim.formSummary,
      simMatches: sim.matches,
      realRank: real.rank,
      realPlayed: real.played,
      realWon: real.won,
      realDrawn: real.drawn,
      realLost: real.lost,
      realGF: real.goalsFor,
      realGA: real.goalsAgainst,
      realGD: real.goalDiff,
      realPts: real.points,
      rankDiff,
      ptsDiff,
      gdDiff,
    };
  });

  const simLeader = simTable[0] || null;
  const realLeader = realTable[0] || null;

  const sortedByClimb = [...comparisonList].sort((a, b) => b.rankDiff - a.rankDiff);
  const biggestClimber = sortedByClimb[0] && sortedByClimb[0].rankDiff > 0 ? sortedByClimb[0] : null;

  const sortedByDrop = [...comparisonList].sort((a, b) => a.rankDiff - b.rankDiff);
  const biggestFaller = sortedByDrop[0] && sortedByDrop[0].rankDiff < 0 ? sortedByDrop[0] : null;

  const topAttack = [...simTable].sort((a, b) => b.goalsFor - a.goalsFor)[0] || null;
  const topDefense = [...simTable].filter(t => t.played > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0] || null;

  const coveragePercent = totalEvaluatedMatches > 0
    ? Math.round((predictedMatchesCount / totalEvaluatedMatches) * 100)
    : 0;

  return {
    simTable,
    realTable,
    comparisonList,
    meta: {
      mode,
      gwLimit,
      totalEvaluatedMatches,
      predictedMatchesCount,
      totalFinishedMatches,
      coveragePercent,
    },
    insights: {
      simLeader,
      realLeader,
      biggestClimber,
      biggestFaller,
      topAttack,
      topDefense,
    }
  };
}

function applyMatchResult(homeTeam, awayTeam, homeGoals, awayGoals, matchMeta) {
  homeTeam.played += 1;
  awayTeam.played += 1;

  homeTeam.goalsFor += homeGoals;
  homeTeam.goalsAgainst += awayGoals;
  homeTeam.goalDiff = homeTeam.goalsFor - homeTeam.goalsAgainst;

  awayTeam.goalsFor += awayGoals;
  awayTeam.goalsAgainst += homeGoals;
  awayTeam.goalDiff = awayTeam.goalsFor - awayTeam.goalsAgainst;

  let homeResult = 'D';
  let awayResult = 'D';

  if (homeGoals > awayGoals) {
    homeTeam.won += 1;
    homeTeam.points += 3;
    awayTeam.lost += 1;
    homeResult = 'W';
    awayResult = 'L';
  } else if (awayGoals > homeGoals) {
    awayTeam.won += 1;
    awayTeam.points += 3;
    homeTeam.lost += 1;
    homeResult = 'L';
    awayResult = 'W';
  } else {
    homeTeam.drawn += 1;
    homeTeam.points += 1;
    awayTeam.drawn += 1;
    awayTeam.points += 1;
  }

  homeTeam.form.push(homeResult);
  awayTeam.form.push(awayResult);

  homeTeam.matches.push({ ...matchMeta, isHome: true, result: homeResult, gf: homeGoals, ga: awayGoals });
  awayTeam.matches.push({ ...matchMeta, isHome: false, result: awayResult, gf: awayGoals, ga: homeGoals });
}

export function getZoneDetails(rank) {
  if (rank >= 1 && rank <= 4) {
    return { className: 'zone-border-ucl', tag: 'UCL', tagClass: 'ucl', label: 'Champions League' };
  }
  if (rank === 5) {
    return { className: 'zone-border-uel', tag: 'UEL', tagClass: 'uel', label: 'Europa League' };
  }
  if (rank >= 18 && rank <= 20) {
    return { className: 'zone-border-rel', tag: 'REL', tagClass: 'rel', label: 'Relegation Zone' };
  }
  return { className: 'zone-border-mid', tag: '', tagClass: '', label: '' };
}

export function formatRankShiftBadge(rankDiff) {
  if (rankDiff > 0) {
    return `<span class="rank-shift-pill shift-up" title="+${rankDiff} positions higher in What-If than real life">▲ +${rankDiff}</span>`;
  }
  if (rankDiff < 0) {
    return `<span class="rank-shift-pill shift-down" title="${Math.abs(rankDiff)} positions lower in What-If than real life">▼ ${rankDiff}</span>`;
  }
  return `<span class="rank-shift-pill shift-equal" title="Same rank as real life">—</span>`;
}

export function formatPtsDiffBadge(ptsDiff) {
  if (ptsDiff > 0) {
    return `<span class="pts-diff-pill pts-up">+${ptsDiff}</span>`;
  }
  if (ptsDiff < 0) {
    return `<span class="pts-diff-pill pts-down">${ptsDiff}</span>`;
  }
  return `<span class="pts-diff-pill pts-equal">0</span>`;
}

export function renderFormPills(formArray = []) {
  if (!formArray.length) return `<span class="text-dim text-xs">—</span>`;
  return formArray.map(r => {
    const cls = r === 'W' ? 'form-pill form-w' : r === 'D' ? 'form-pill form-d' : 'form-pill form-l';
    return `<span class="${cls}" title="${r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'}">${r}</span>`;
  }).join('');
}

/**
 * Main Render Entry Point for What-If View
 */
export function renderWhatIfView(appState) {
  const container = document.getElementById('whatIfView');
  if (!container) return;

  // Access control guard: Restricted to Admin users during testing
  if (appState.auth?.role !== 'admin') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  // Determine active player ID to simulate
  const availablePlayers = (appState.players && appState.players.length > 0)
    ? appState.players
    : (appState.masterPlayers || []);

  if (!whatIfState.selectedPlayerId && availablePlayers.length > 0) {
    if (appState.auth && appState.auth.activePlayerId && availablePlayers.some(p => p.id === appState.auth.activePlayerId)) {
      whatIfState.selectedPlayerId = appState.auth.activePlayerId;
    } else {
      whatIfState.selectedPlayerId = availablePlayers[0].id;
    }
  }

  const selectedPlayer = availablePlayers.find(p => p.id === Number(whatIfState.selectedPlayerId)) || availablePlayers[0] || { id: null, name: 'Guest' };
  const playerName = selectedPlayer.name;

  // Compute standings data
  const data = calculateLeagueStandings({
    fixtures: appState.fixtures,
    teams: appState.teams,
    predictions: appState.predictions,
    playerId: selectedPlayer.id,
    mode: whatIfState.mode,
    gwLimit: whatIfState.gwLimit,
    startGw: (appState.activeGroup && appState.activeGroup.start_gw) ? Number(appState.activeGroup.start_gw) : 1,
  });

  // Filter comparison list if user searched for a team
  const filteredList = whatIfState.searchQuery
    ? data.comparisonList.filter(row => row.name.toLowerCase().includes(whatIfState.searchQuery.toLowerCase()))
    : data.comparisonList;

  // Build the complete HTML
  let html = `
    <!-- Header Title & Subtitle -->
    <div class="whatif-page-header flex justify-between items-center flex-wrap gap-4">
      <div>
        <h2 style="font-family: var(--font-title); font-size: 1.8rem; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.8rem;">🔮</span> "What If" League Standings Simulator
        </h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px;">
          Explore how the 2026/27 Premier League table would look if <strong>${playerName}</strong>'s score predictions were reality.
        </p>
      </div>

      <!-- Quick Export / Action Buttons -->
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary btn-back-dashboard" id="whatIfBackToDashboardBtn" title="Return to Match Predictions Dashboard" style="font-size: 0.85rem; padding: 8px 14px;">
          📊 ← Back to Dashboard
        </button>
        <button class="btn btn-secondary" id="exportWhatIfCsvBtn" title="Download standings comparison as CSV" style="font-size: 0.85rem; padding: 8px 14px;">
          📥 Export CSV
        </button>
      </div>
    </div>

    <!-- Toolbar: Player Picker, Simulation Mode, View Toggle -->
    <div class="whatif-toolbar glass-card">
      <div class="whatif-toolbar-left">
        
        <!-- Player Switcher -->
        <div class="whatif-control-item">
          <label for="whatIfPlayerSelect" class="toolbar-label">👤 Predictor:</label>
          <select id="whatIfPlayerSelect" class="control-dropdown" style="font-weight: 700;">
            ${availablePlayers.map(p => `
              <option value="${p.id}" ${p.id === Number(whatIfState.selectedPlayerId) ? 'selected' : ''}>
                ${p.name} ${appState.auth?.activePlayerId === p.id ? '(You)' : ''}
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Simulation Scope: Completed vs Full Season -->
        <div class="whatif-control-item">
          <label class="toolbar-label">⚡ Scope:</label>
          <div class="whatif-btn-group">
            <button type="button" class="whatif-btn-option ${whatIfState.mode === 'completed' ? 'active' : ''}" id="whatIfModeCompletedBtn" title="Evaluate matches played so far against reality">
              ⚡ Reality Check (Completed)
            </button>
            <button type="button" class="whatif-btn-option ${whatIfState.mode === 'all' ? 'active' : ''}" id="whatIfModeAllBtn" title="Project table using all predicted matches across season">
              🔮 Full Season Projection
            </button>
          </div>
        </div>

        <!-- Layout Toggle: Comparison vs Split -->
        <div class="whatif-control-item">
          <label class="toolbar-label">📊 View:</label>
          <div class="whatif-btn-group">
            <button type="button" class="whatif-btn-option ${whatIfState.layout === 'comparison' ? 'active' : ''}" id="whatIfLayoutCompBtn" title="Single unified comparison table">
              📊 Comparison
            </button>
            <button type="button" class="whatif-btn-option ${whatIfState.layout === 'split' ? 'active' : ''}" id="whatIfLayoutSplitBtn" title="Side-by-side simulation vs real-life split">
              👥 Side-by-Side
            </button>
          </div>
        </div>

      </div>

      <div class="whatif-toolbar-right">
        <!-- Search filter -->
        <div style="position: relative;">
          <input type="text" id="whatIfSearchInput" class="form-input" placeholder="Filter teams..." value="${whatIfState.searchQuery}" style="padding: 6px 10px 6px 28px; font-size: 0.84rem; max-width: 180px;" />
          <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-dim); font-size: 0.8rem;">🔍</span>
        </div>
      </div>
    </div>

    <!-- 4 Headline Insight Cards -->
    <div class="whatif-insights-grid">
      
      <!-- 1. Simulated Leader -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box gold">👑</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Simulated Leader</span>
          <div class="whatif-insight-value">
            ${data.insights.simLeader ? `
              ${getCrestImg(data.insights.simLeader.code, data.insights.simLeader.name)}
              <span>${data.insights.simLeader.name}</span>
            ` : '—'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.simLeader ? `${data.insights.simLeader.points} pts (GD ${data.insights.simLeader.goalDiff > 0 ? '+' : ''}${data.insights.simLeader.goalDiff})` : ''}
          </span>
        </div>
      </div>

      <!-- 2. Biggest Climber -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box green">🚀</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Biggest Climber</span>
          <div class="whatif-insight-value">
            ${data.insights.biggestClimber ? `
              ${getCrestImg(data.insights.biggestClimber.code, data.insights.biggestClimber.name)}
              <span>${data.insights.biggestClimber.name}</span>
            ` : '<span style="color: var(--text-dim); font-size:0.9rem;">No rank climbs</span>'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.biggestClimber ? `<span style="color: #34d399; font-weight:700;">▲ +${data.insights.biggestClimber.rankDiff} spots</span> (Sim #${data.insights.biggestClimber.simRank} vs Real #${data.insights.biggestClimber.realRank})` : 'Identical positions'}
          </span>
        </div>
      </div>

      <!-- 3. Biggest Faller -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box rose">📉</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Biggest Faller</span>
          <div class="whatif-insight-value">
            ${data.insights.biggestFaller ? `
              ${getCrestImg(data.insights.biggestFaller.code, data.insights.biggestFaller.name)}
              <span>${data.insights.biggestFaller.name}</span>
            ` : '<span style="color: var(--text-dim); font-size:0.9rem;">No rank drops</span>'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.biggestFaller ? `<span style="color: #fb7185; font-weight:700;">▼ ${data.insights.biggestFaller.rankDiff} spots</span> (Sim #${data.insights.biggestFaller.simRank} vs Real #${data.insights.biggestFaller.realRank})` : 'Identical positions'}
          </span>
        </div>
      </div>

      <!-- 4. Coverage & Total Predictions -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box purple">🎯</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Prediction Coverage</span>
          <div class="whatif-insight-value">
            <span>${data.meta.predictedMatchesCount} / ${data.meta.totalEvaluatedMatches}</span>
            <span style="font-size: 0.8rem; font-weight:600; color: var(--text-muted);">(${data.meta.coveragePercent}%)</span>
          </div>
          <span class="whatif-insight-sub">
            ${whatIfState.mode === 'completed' ? 'Played matches evaluated' : 'Total matches with predictions'}
          </span>
        </div>
      </div>

    </div>
  `;

  // Render Table depending on selected layout
  if (whatIfState.layout === 'comparison') {
    html += renderComparisonTableHtml(filteredList, playerName);
  } else {
    html += renderSideBySideTableHtml(data.simTable, data.realTable, playerName);
  }

  // Zone Legend at bottom
  html += `
    <div style="margin-top: 18px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; font-size: 0.8rem; color: var(--text-muted); padding: 12px; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <span style="font-weight: 700; color: var(--text-main);">🏷️ Zones:</span>
      <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #38bdf8; border-radius: 2px;"></span> 1–4 UEFA Champions League</span>
      <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #f59e0b; border-radius: 2px;"></span> 5 UEFA Europa League</span>
      <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; background: #f43f5e; border-radius: 2px;"></span> 18–20 Relegation</span>
      <span style="margin-left: auto; font-style: italic; color: var(--text-dim);">💡 Click any team row to inspect its match predictions</span>
    </div>
  `;

  container.innerHTML = html;

  // Attach event listeners
  attachWhatIfEvents(appState);
}

/**
 * Renders the Comparison Table HTML
 */
function renderComparisonTableHtml(comparisonList, playerName) {
  return `
    <section class="glass-card" style="padding: 0; overflow: hidden;">
      <div class="table-responsive">
        <table class="whatif-table">
          <thead>
            <tr>
              <th class="text-center" style="width: 60px;">Pos</th>
              <th class="text-center" style="width: 68px;">Shift</th>
              <th>Club</th>
              <th class="text-center" style="width: 48px;">P</th>
              <th class="text-center" style="width: 48px;">W</th>
              <th class="text-center" style="width: 48px;">D</th>
              <th class="text-center" style="width: 48px;">L</th>
              <th class="text-center" style="width: 58px;">GF</th>
              <th class="text-center" style="width: 58px;">GA</th>
              <th class="text-center" style="width: 58px;">GD</th>
              <th class="text-center" style="width: 64px;">PTS</th>
              <th style="width: 160px;">Real-Life Reality</th>
              <th style="width: 120px;">Recent Form</th>
            </tr>
          </thead>
          <tbody>
            ${comparisonList.map(row => {
              const zone = getZoneDetails(row.simRank);
              const isExpanded = whatIfState.expandedTeamId === row.id;

              let rowHtml = `
                <tr class="whatif-row ${zone.className} ${isExpanded ? 'selected' : ''}" data-team-id="${row.id}" title="Click to see match breakdown for ${row.name}">
                  <!-- Position -->
                  <td class="whatif-pos-cell">
                    <span>${row.simRank}</span>
                    ${zone.tag ? `<span class="zone-tag ${zone.tagClass}">${zone.tag}</span>` : ''}
                  </td>

                  <!-- Rank Shift -->
                  <td class="text-center">
                    ${formatRankShiftBadge(row.rankDiff)}
                  </td>

                  <!-- Club Crest & Name -->
                  <td>
                    <div class="whatif-team-cell">
                      ${getCrestImg(row.code, row.name)}
                      <span>${row.name}</span>
                      <span class="whatif-team-short">(${row.short})</span>
                    </div>
                  </td>

                  <!-- Stats -->
                  <td class="text-center whatif-num">${row.simPlayed}</td>
                  <td class="text-center whatif-num">${row.simWon}</td>
                  <td class="text-center whatif-num">${row.simDrawn}</td>
                  <td class="text-center whatif-num">${row.simLost}</td>
                  <td class="text-center whatif-num">${row.simGF}</td>
                  <td class="text-center whatif-num">${row.simGA}</td>
                  <td class="text-center whatif-num" style="${row.simGD > 0 ? 'color:#34d399;' : row.simGD < 0 ? 'color:#fb7185;' : ''}">
                    ${row.simGD > 0 ? '+' : ''}${row.simGD}
                  </td>
                  <td class="text-center whatif-pts">${row.simPts}</td>

                  <!-- Real-Life Delta -->
                  <td>
                    <div class="whatif-real-ref">
                      <span class="whatif-real-rank">Actual: <strong>#${row.realRank}</strong> (${row.realPts} pts)</span>
                      <span style="font-size:0.75rem;">
                        Diff: ${formatPtsDiffBadge(row.ptsDiff)} pts, ${row.gdDiff > 0 ? '+' : ''}${row.gdDiff} GD
                      </span>
                    </div>
                  </td>

                  <!-- Form Guide -->
                  <td>
                    <div>${renderFormPills(row.simForm)}</div>
                  </td>
                </tr>
              `;

              // If expanded, render match drilldown drawer
              if (isExpanded) {
                rowHtml += renderTeamDrilldownDrawerHtml(row, playerName);
              }

              return rowHtml;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/**
 * Renders Team Matches Drilldown Drawer
 */
function renderTeamDrilldownDrawerHtml(teamRow, playerName) {
  const matches = teamRow.simMatches || [];
  return `
    <tr class="whatif-drilldown-row">
      <td colspan="13">
        <div class="whatif-drilldown-content">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 800; font-size: 0.9rem; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              📋 Match Log in ${playerName}'s Universe: ${teamRow.name} (${matches.length} Matches Evaluated)
            </span>
            <button type="button" class="btn btn-sm close-drawer-btn" data-team-id="${teamRow.id}" style="font-size: 0.75rem; padding: 4px 8px;">✕ Close</button>
          </div>

          ${matches.length === 0 ? `
            <p style="color: var(--text-muted); font-size: 0.85rem;">No match predictions or completed fixtures recorded for this team.</p>
          ` : `
            <div class="whatif-matches-grid">
              ${matches.map(m => {
                const oppName = m.isHome ? m.awayTeam : m.homeTeam;
                const oppCode = m.isHome ? m.awayCode : m.homeCode;
                const myScore = m.isHome ? m.homeScore : m.awayScore;
                const oppScore = m.isHome ? m.awayScore : m.homeScore;
                const venueTag = m.isHome ? '🏠 Home' : '✈️ Away';
                const resultColor = m.result === 'W' ? '#34d399' : m.result === 'D' ? '#fbbf24' : '#fb7185';
                const resultText = m.result === 'W' ? 'Won (+3 pts)' : m.result === 'D' ? 'Drawn (+1 pt)' : 'Lost (0 pts)';

                return `
                  <div class="whatif-match-card">
                    <div class="whatif-match-header">
                      <span>GW ${m.gw} • ${venueTag}</span>
                      <span style="color: ${resultColor}; font-weight: 800;">${resultText}</span>
                    </div>
                    <div class="whatif-match-scoreline">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        ${getCrestImg(oppCode, oppName)}
                        <span>vs ${oppName}</span>
                      </div>
                      <div class="whatif-score-badge ${m.isPrediction ? 'pred-source' : ''}">
                        ${myScore} – ${oppScore}
                      </div>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; justify-content: space-between;">
                      <span>${m.isPrediction ? '🎯 Predicted by ' + playerName : '⚡ Official Actual Score'}</span>
                      ${m.actualHomeScore !== null && m.actualHomeScore !== undefined ? `<span>Real: ${m.isHome ? m.actualHomeScore : m.actualAwayScore}-${m.isHome ? m.actualAwayScore : m.actualHomeScore}</span>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </td>
    </tr>
  `;
}

/**
 * Renders Side-by-Side Split View HTML
 */
function renderSideBySideTableHtml(simTable, realTable, playerName) {
  return `
    <div class="whatif-side-by-side-grid">
      
      <!-- Left: Simulated What-If Table -->
      <div class="whatif-split-card">
        <div class="whatif-split-header">
          <h3>
            <span>🔮</span> ${playerName}'s Predicted Standings
          </h3>
          <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
            What-If Reality
          </span>
        </div>

        <div class="table-responsive">
          <table class="whatif-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 44px;">#</th>
                <th>Club</th>
                <th class="text-center" style="width: 40px;">P</th>
                <th class="text-center" style="width: 40px;">W</th>
                <th class="text-center" style="width: 40px;">D</th>
                <th class="text-center" style="width: 40px;">L</th>
                <th class="text-center" style="width: 46px;">GD</th>
                <th class="text-center" style="width: 52px;">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${simTable.map(t => {
                const zone = getZoneDetails(t.rank);
                return `
                  <tr class="whatif-row ${zone.className}">
                    <td class="whatif-pos-cell">
                      <span>${t.rank}</span>
                    </td>
                    <td>
                      <div class="whatif-team-cell">
                        ${getCrestImg(t.code, t.name)}
                        <span>${t.name}</span>
                      </div>
                    </td>
                    <td class="text-center whatif-num">${t.played}</td>
                    <td class="text-center whatif-num">${t.won}</td>
                    <td class="text-center whatif-num">${t.drawn}</td>
                    <td class="text-center whatif-num">${t.lost}</td>
                    <td class="text-center whatif-num" style="${t.goalDiff > 0 ? 'color:#34d399;' : t.goalDiff < 0 ? 'color:#fb7185;' : ''}">
                      ${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}
                    </td>
                    <td class="text-center whatif-pts">${t.points}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right: Official Real-Life Standings -->
      <div class="whatif-split-card">
        <div class="whatif-split-header">
          <h3>
            <span>⚡</span> Official Real-Life Standings
          </h3>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
            Premier League Reality
          </span>
        </div>

        <div class="table-responsive">
          <table class="whatif-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 44px;">#</th>
                <th>Club</th>
                <th class="text-center" style="width: 40px;">P</th>
                <th class="text-center" style="width: 40px;">W</th>
                <th class="text-center" style="width: 40px;">D</th>
                <th class="text-center" style="width: 40px;">L</th>
                <th class="text-center" style="width: 46px;">GD</th>
                <th class="text-center" style="width: 52px;">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${realTable.map(t => {
                const zone = getZoneDetails(t.rank);
                return `
                  <tr class="whatif-row ${zone.className}">
                    <td class="whatif-pos-cell">
                      <span>${t.rank}</span>
                    </td>
                    <td>
                      <div class="whatif-team-cell">
                        ${getCrestImg(t.code, t.name)}
                        <span>${t.name}</span>
                      </div>
                    </td>
                    <td class="text-center whatif-num">${t.played}</td>
                    <td class="text-center whatif-num">${t.won}</td>
                    <td class="text-center whatif-num">${t.drawn}</td>
                    <td class="text-center whatif-num">${t.lost}</td>
                    <td class="text-center whatif-num" style="${t.goalDiff > 0 ? 'color:#34d399;' : t.goalDiff < 0 ? 'color:#fb7185;' : ''}">
                      ${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}
                    </td>
                    <td class="text-center whatif-pts" style="color: var(--accent-green);">${t.points}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

/**
 * Event Listeners for What-If View
 */
function attachWhatIfEvents(appState) {
  // Player Select
  const playerSelect = document.getElementById('whatIfPlayerSelect');
  if (playerSelect) {
    playerSelect.addEventListener('change', (e) => {
      whatIfState.selectedPlayerId = Number(e.target.value);
      whatIfState.expandedTeamId = null;
      renderWhatIfView(appState);
    });
  }

  // Scope Buttons
  const modeCompBtn = document.getElementById('whatIfModeCompletedBtn');
  const modeAllBtn = document.getElementById('whatIfModeAllBtn');
  if (modeCompBtn && modeAllBtn) {
    modeCompBtn.addEventListener('click', () => {
      whatIfState.mode = 'completed';
      renderWhatIfView(appState);
    });
    modeAllBtn.addEventListener('click', () => {
      whatIfState.mode = 'all';
      renderWhatIfView(appState);
    });
  }

  // Layout Buttons
  const layoutCompBtn = document.getElementById('whatIfLayoutCompBtn');
  const layoutSplitBtn = document.getElementById('whatIfLayoutSplitBtn');
  if (layoutCompBtn && layoutSplitBtn) {
    layoutCompBtn.addEventListener('click', () => {
      whatIfState.layout = 'comparison';
      renderWhatIfView(appState);
    });
    layoutSplitBtn.addEventListener('click', () => {
      whatIfState.layout = 'split';
      renderWhatIfView(appState);
    });
  }

  // Search Input
  const searchInput = document.getElementById('whatIfSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      whatIfState.searchQuery = e.target.value;
      renderWhatIfView(appState);
      const inputAgain = document.getElementById('whatIfSearchInput');
      if (inputAgain) {
        inputAgain.focus();
        inputAgain.setSelectionRange(inputAgain.value.length, inputAgain.value.length);
      }
    });
  }

  // Team Row Expansion
  const teamRows = document.querySelectorAll('.whatif-row[data-team-id]');
  teamRows.forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.close-drawer-btn')) return;
      const teamId = Number(row.dataset.teamId);
      whatIfState.expandedTeamId = (whatIfState.expandedTeamId === teamId) ? null : teamId;
      renderWhatIfView(appState);
    });
  });

  // Close Drawer Buttons
  const closeBtns = document.querySelectorAll('.close-drawer-btn');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      whatIfState.expandedTeamId = null;
      renderWhatIfView(appState);
    });
  });

  // Back to Dashboard
  const backDashBtn = document.getElementById('whatIfBackToDashboardBtn');
  if (backDashBtn) {
    backDashBtn.addEventListener('click', () => {
      document.getElementById('navDashboardBtn')?.click();
    });
  }

  // Export CSV
  const exportCsvBtn = document.getElementById('exportWhatIfCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      exportWhatIfTableToCsv(appState);
    });
  }
}

/**
 * Exports current standings comparison to a CSV file.
 */
function exportWhatIfTableToCsv(appState) {
  const availablePlayers = (appState.players && appState.players.length > 0) ? appState.players : (appState.masterPlayers || []);
  const selectedPlayer = availablePlayers.find(p => p.id === Number(whatIfState.selectedPlayerId)) || { name: 'Player' };
  
  const data = calculateLeagueStandings({
    fixtures: appState.fixtures,
    teams: appState.teams,
    predictions: appState.predictions,
    playerId: selectedPlayer.id,
    mode: whatIfState.mode,
    startGw: (appState.activeGroup && appState.activeGroup.start_gw) ? Number(appState.activeGroup.start_gw) : 1,
  });

  const headers = ['Simulated_Rank', 'Actual_Rank', 'Rank_Shift', 'Club', 'Played', 'Won', 'Drawn', 'Lost', 'Goals_For', 'Goals_Against', 'Goal_Difference', 'Simulated_Points', 'Actual_Points', 'Points_Diff'];
  const rows = data.comparisonList.map(r => [
    r.simRank,
    r.realRank,
    r.rankDiff > 0 ? `+${r.rankDiff}` : r.rankDiff,
    `"${r.name}"`,
    r.simPlayed,
    r.simWon,
    r.simDrawn,
    r.simLost,
    r.simGF,
    r.simGA,
    r.simGD > 0 ? `+${r.simGD}` : r.simGD,
    r.simPts,
    r.realPts,
    r.ptsDiff > 0 ? `+${r.ptsDiff}` : r.ptsDiff,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `epl_whatif_standings_${selectedPlayer.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Compact Dashboard Snapshot Widget
 */
export function renderWhatIfDashboardWidget(containerEl, appState, onOpenWhatIf) {
  if (!containerEl) return;

  // Access control guard: Restricted to Admin users during testing
  if (appState.auth?.role !== 'admin') {
    containerEl.innerHTML = '';
    containerEl.style.display = 'none';
    return;
  }

  const availablePlayers = (appState.players && appState.players.length > 0) ? appState.players : (appState.masterPlayers || []);
  const activePlayer = availablePlayers.find(p => p.id === (appState.auth?.activePlayerId || availablePlayers[0]?.id)) || availablePlayers[0];
  if (!activePlayer) {
    containerEl.style.display = 'none';
    return;
  }

  const data = calculateLeagueStandings({
    fixtures: appState.fixtures,
    teams: appState.teams,
    predictions: appState.predictions,
    playerId: activePlayer.id,
    mode: 'completed',
    startGw: (appState.activeGroup && appState.activeGroup.start_gw) ? Number(appState.activeGroup.start_gw) : 1,
  });

  const top4 = data.simTable.slice(0, 4);
  const climber = data.insights.biggestClimber;

  containerEl.innerHTML = `
    <div class="glass-card dashboard-whatif-preview-card" style="margin-top: 24px; padding: 18px;">
      <div class="section-header" style="margin-bottom: 12px;">
        <div>
          <h3 style="font-family: var(--font-title); font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <span>🔮</span> "What If" Standings Preview: ${activePlayer.name}'s Reality
          </h3>
          <p style="color: var(--text-muted); font-size: 0.82rem; margin: 0;">
            See how the Premier League table shifts based on ${activePlayer.name}'s predictions vs actual results.
          </p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="dashOpenWhatIfBtn" style="font-size: 0.82rem; padding: 7px 14px;">
          🔮 Full What-If Simulator →
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 10px;">
        ${top4.map((t, i) => {
          const comp = data.comparisonList.find(c => c.id === t.id);
          return `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: var(--font-mono); font-weight: 800; font-size: 0.85rem; color: #38bdf8;">#${t.rank}</span>
                ${getCrestImg(t.code, t.name)}
                <span style="font-weight: 700; font-size: 0.85rem;">${t.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: var(--font-mono); font-weight: 800; color: var(--text-main); font-size: 0.88rem;">${t.points} pts</span>
                ${comp ? formatRankShiftBadge(comp.rankDiff) : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      ${climber ? `
        <div style="margin-top: 10px; font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(16, 185, 129, 0.08); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
          <span>🚀 <strong>Biggest Jump:</strong> ${climber.name} ranks ${climber.simRank} (${climber.rankDiff > 0 ? '+' : ''}${climber.rankDiff} spots higher than real life)</span>
        </div>
      ` : ''}
    </div>
  `;

  const btn = document.getElementById('dashOpenWhatIfBtn');
  if (btn && typeof onOpenWhatIf === 'function') {
    btn.addEventListener('click', onOpenWhatIf);
  }
}
