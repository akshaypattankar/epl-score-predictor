// whatIfStandings.js - Premier League Standings Simulator & "What-If" Scenario Tester
import { getCrestImg, CLUB_DIRECTORY, FALLBACK_TEAMS, apiFetchWhatIfStandings } from './api.js';

// Local UI state for What-If view
const whatIfState = {
  selectedPlayerId: null,
  mode: 'completed', // 'completed' | 'all'
  layout: 'comparison', // 'comparison' | 'split'
  searchQuery: '',
  expandedTeamId: null,
  gwLimit: 'all',
  filter: 'all', // 'all' | 'top6' | 'bottom6' | 'top4' | 'bottom3'
  sortCol: 'simRank', // any table column
  sortDir: 'asc', // 'asc' | 'desc'
  backendData: null,
  lastFetchedKey: null,
  isFetchingBackend: false,
  showAccuracyBreakdown: false,
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
    short: t.short || t.short_name || t.name.slice(0, 3).toUpperCase(),
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

  const evaluatedPredictions = [];

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
          homeShort: realTableMap[homeId].short,
          awayShort: realTableMap[awayId].short,
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
            evaluatedPredictions.push({
              fixtureId: f.id,
              gw,
              homeId,
              awayId,
              predH: simH,
              predA: simA,
              actH: Number(f.actual_home_score),
              actA: Number(f.actual_away_score),
            });
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
          if (isRealPlayed) {
            evaluatedPredictions.push({
              fixtureId: f.id,
              gw,
              homeId,
              awayId,
              predH: simH,
              predA: simA,
              actH: Number(f.actual_home_score),
              actA: Number(f.actual_away_score),
            });
          }
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
          homeShort: simTableMap[homeId].short,
          awayShort: simTableMap[awayId].short,
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
    const real = realRankMap[sim.id] || { rank: 20, points: 0, goalDiff: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, formSummary: [] };
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
      realForm: real.formSummary,
      rankDiff,
      ptsDiff,
      gdDiff,
    };
  });

  const simLeader = simTable[0] || null;
  const realLeader = realTable[0] || null;

  // KPI: Most Difference in Points (Actual vs Predicted)
  const sortedByAbsPtsDiff = [...comparisonList].sort((a, b) => {
    const diffDiff = Math.abs(b.ptsDiff) - Math.abs(a.ptsDiff);
    if (diffDiff !== 0) return diffDiff;
    return b.simPts - a.simPts;
  });
  const mostDiffRow = sortedByAbsPtsDiff[0] || null;
  const mostDiffPoints = mostDiffRow ? {
    id: mostDiffRow.id,
    name: mostDiffRow.name,
    short: mostDiffRow.short,
    code: mostDiffRow.code,
    simPts: mostDiffRow.simPts,
    realPts: mostDiffRow.realPts,
    ptsDiff: mostDiffRow.ptsDiff,
    absDiff: Math.abs(mostDiffRow.ptsDiff),
    simRank: mostDiffRow.simRank,
    realRank: mostDiffRow.realRank,
    direction: mostDiffRow.ptsDiff > 0 ? 'over' : mostDiffRow.ptsDiff < 0 ? 'under' : 'equal',
    summary: mostDiffRow.ptsDiff > 0
      ? `Overpredicted by ${mostDiffRow.ptsDiff} pts vs actual`
      : mostDiffRow.ptsDiff < 0
      ? `Underpredicted by ${Math.abs(mostDiffRow.ptsDiff)} pts vs actual`
      : 'Matches actual points in predictions'
  } : null;

  const sortedByClimb = [...comparisonList].sort((a, b) => b.rankDiff - a.rankDiff);
  const biggestClimber = sortedByClimb[0] && sortedByClimb[0].rankDiff > 0 ? sortedByClimb[0] : null;

  const sortedByDrop = [...comparisonList].sort((a, b) => a.rankDiff - b.rankDiff);
  const biggestFaller = sortedByDrop[0] && sortedByDrop[0].rankDiff < 0 ? sortedByDrop[0] : null;

  const topAttack = [...simTable].sort((a, b) => b.goalsFor - a.goalsFor)[0] || null;
  const topDefense = [...simTable].filter(t => t.played > 0).sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0] || null;

  const coveragePercent = totalEvaluatedMatches > 0
    ? Math.round((predictedMatchesCount / totalEvaluatedMatches) * 100)
    : 0;

  const accuracyScore = calculatePredictionAccuracyScore(comparisonList, evaluatedPredictions);

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
      accuracyScore,
      mostDiffPoints,
      predictedLeader: simLeader,
      simLeader,
      actualLeader: realLeader,
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
  } else if (homeGoals < awayGoals) {
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

  homeTeam.matches.push({
    ...matchMeta,
    isHome: true,
    result: homeResult,
    homeScore: homeGoals,
    awayScore: awayGoals,
  });

  awayTeam.matches.push({
    ...matchMeta,
    isHome: false,
    result: awayResult,
    homeScore: homeGoals,
    awayScore: awayGoals,
  });
}

/**
 * Calculates the composite Prediction Accuracy Score (PAS: 0-100)
 * Evaluates:
 * 1. Match Score Precision (50%): Exact scores, outcome hits, goal deviation
 * 2. Table Rank Proximity (35%): Spearman rank correlation & mean rank shift
 * 3. Points Calibration (15%): Mean absolute points error
 */
export function getAccuracyScoreWeights(customWeights = null) {
  if (customWeights && typeof customWeights === 'object') {
    return customWeights;
  }
  const parseWeight = (val, defaultVal) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const clean = String(val).replace('%', '').trim();
    const num = parseFloat(clean);
    if (isNaN(num) || num < 0) return defaultVal;
    return num > 1 ? num / 100 : num;
  };

  const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
  const rawMatch = parseWeight(env.VITE_PAS_WEIGHT_MATCH, 0.50);
  const rawRank = parseWeight(env.VITE_PAS_WEIGHT_RANK, 0.35);
  const rawPts = parseWeight(env.VITE_PAS_WEIGHT_POINTS ?? env.VITE_PAS_WEIGHT_PTS, 0.15);

  const sum = rawMatch + rawRank + rawPts;
  let weightMatch = 0.50;
  let weightRank = 0.35;
  let weightPts = 0.15;

  if (sum > 0) {
    weightMatch = rawMatch / sum;
    weightRank = rawRank / sum;
    weightPts = rawPts / sum;
  }

  const rawRho = parseWeight(env.VITE_PAS_WEIGHT_RHO, 0.60);
  const rawMars = parseWeight(env.VITE_PAS_WEIGHT_MARS, 0.40);
  const sumRankSub = rawRho + rawMars;
  const weightRho = sumRankSub > 0 ? rawRho / sumRankSub : 0.60;
  const weightMars = sumRankSub > 0 ? rawMars / sumRankSub : 0.40;

  return {
    weightMatch,
    weightRank,
    weightPts,
    weightRho,
    weightMars,
    pctMatch: `${Math.round(weightMatch * 100)}%`,
    pctRank: `${Math.round(weightRank * 100)}%`,
    pctPts: `${Math.round(weightPts * 100)}%`,
    pctRho: `${Math.round(weightRho * 100)}%`,
    pctMars: `${Math.round(weightMars * 100)}%`,
  };
}

export function calculatePredictionAccuracyScore(comparisonList = [], evaluatedPredictions = [], customWeights = null) {
  const weights = customWeights || getAccuracyScoreWeights();

  // 1. Match Score Precision
  let matchScoreSum = 0;
  let exactCount = 0;
  let outcomeCount = 0;
  let totalGoalDiff = 0;
  const matchCount = evaluatedPredictions.length;

  evaluatedPredictions.forEach(m => {
    const isExact = m.predH === m.actH && m.predA === m.actA;
    const predSign = Math.sign(m.predH - m.predA);
    const actSign = Math.sign(m.actH - m.actA);
    const outcomeHit = predSign === actSign;
    const gdHit = (m.predH - m.predA) === (m.actH - m.actA);
    const goalDiff = Math.abs(m.predH - m.actH) + Math.abs(m.predA - m.actA);
    totalGoalDiff += goalDiff;

    if (isExact) {
      exactCount++;
      outcomeCount++;
      matchScoreSum += 100;
    } else if (outcomeHit && gdHit) {
      outcomeCount++;
      matchScoreSum += Math.max(0, 85 - 10 * Math.max(0, goalDiff - 1));
    } else if (outcomeHit) {
      outcomeCount++;
      matchScoreSum += Math.max(0, 70 - 10 * Math.max(0, goalDiff - 1));
    } else {
      matchScoreSum += Math.max(0, 35 - 10 * goalDiff);
    }
  });

  const sMatch = matchCount > 0 ? Math.round(matchScoreSum / matchCount) : 0;
  const avgGoalError = matchCount > 0 ? Number((totalGoalDiff / matchCount).toFixed(1)) : 0;
  const outcomePct = matchCount > 0 ? Math.round((outcomeCount / matchCount) * 100) : 0;

  // 2. Table Rank Proximity
  let sumSqRankDiff = 0;
  let sumAbsRankDiff = 0;
  let top4Matches = 0;
  const numClubs = comparisonList.length || 20;

  comparisonList.forEach(c => {
    const diff = c.simRank - c.realRank;
    sumSqRankDiff += (diff * diff);
    sumAbsRankDiff += Math.abs(diff);
    if (c.simRank <= 4 && c.realRank <= 4) {
      top4Matches++;
    }
  });

  const denom = (numClubs * (numClubs * numClubs - 1)) / 6 || 1330;
  const rho = 1 - (sumSqRankDiff / denom);
  const mars = numClubs > 0 ? (sumAbsRankDiff / numClubs) : 0;
  const rhoScore = Math.max(0, Math.min(100, ((rho + 1) / 2) * 100));
  const marsScore = Math.max(0, Math.min(100, (1 - (mars / 8.0)) * 100));
  const sRank = Math.round(weights.weightRho * rhoScore + weights.weightMars * marsScore);

  // 3. Points Calibration
  let sumAbsPtsDiff = 0;
  comparisonList.forEach(c => {
    sumAbsPtsDiff += Math.abs(c.ptsDiff);
  });
  const mape = numClubs > 0 ? (sumAbsPtsDiff / numClubs) : 0;
  const sPts = Math.max(0, Math.min(100, Math.round(100 - (mape * 10))));

  // Composite Score
  const compositeScore = matchCount > 0
    ? Math.max(0, Math.min(100, Math.round(weights.weightMatch * sMatch + weights.weightRank * sRank + weights.weightPts * sPts)))
    : (() => {
        const noMatchSum = weights.weightRank + weights.weightPts;
        const wRankNoMatch = noMatchSum > 0 ? weights.weightRank / noMatchSum : 0.70;
        const wPtsNoMatch = noMatchSum > 0 ? weights.weightPts / noMatchSum : 0.30;
        return Math.max(0, Math.min(100, Math.round(wRankNoMatch * sRank + wPtsNoMatch * sPts)));
      })();

  // Tier assignment
  let tier = 'Wild Guesser';
  let tierIcon = '🎲';
  let tierColor = '#f43f5e';
  let tierDesc = 'High variance from actual results';

  if (compositeScore >= 90) {
    tier = 'Oracle';
    tierIcon = '🌟';
    tierColor = '#c084fc';
    tierDesc = 'Elite foresight and pinpoint accuracy';
  } else if (compositeScore >= 80) {
    tier = 'Sharp Analyst';
    tierIcon = '🎯';
    tierColor = '#38bdf8';
    tierDesc = 'High precision match reading and table vision';
  } else if (compositeScore >= 70) {
    tier = 'Keen Pundit';
    tierIcon = '📈';
    tierColor = '#34d399';
    tierDesc = 'Solid tactical insight and sound predictions';
  } else if (compositeScore >= 55) {
    tier = 'Average Observer';
    tierIcon = '⚖️';
    tierColor = '#f59e0b';
    tierDesc = 'Moderate prediction accuracy';
  }

  return {
    score: compositeScore,
    tier,
    tierIcon,
    tierColor,
    tierDesc,
    components: {
      matchPrecision: {
        score: sMatch,
        weight: weights.pctMatch,
        weightVal: weights.weightMatch,
        evaluatedCount: matchCount,
        exactCount,
        outcomeCount,
        outcomePct,
        avgGoalError
      },
      rankProximity: {
        score: sRank,
        weight: weights.pctRank,
        weightVal: weights.weightRank,
        rho: Number(rho.toFixed(2)),
        mars: Number(mars.toFixed(1)),
        top4Accuracy: `${top4Matches}/4`,
        subWeights: {
          rho: weights.pctRho,
          mars: weights.pctMars
        }
      },
      pointsCalibration: {
        score: sPts,
        weight: weights.pctPts,
        weightVal: weights.weightPts,
        avgPtsError: Number(mape.toFixed(1))
      }
    }
  };
}

/**
 * Returns zone styling and label for a given Premier League position
 * Baseline Qualification Slots:
 * - UEFA Champions League (Top 4): Ranks 1-4 automatically qualify for league phase
 * - UEFA Europa League (2 Slots): Awarded to 5th-placed finisher and FA Cup winners
 * - UEFA Conference League (1 Slot): Awarded to winners of the EFL Cup (Carabao Cup)
 * - Relegation: Ranks 18-20
 */
function getZoneDetails(rank) {
  if (rank >= 1 && rank <= 4) {
    return { className: 'zone-border-ucl', tag: 'UCL', tagClass: 'ucl', label: 'UEFA Champions League (Top 4)' };
  }
  if (rank === 5) {
    return { className: 'zone-border-uel', tag: 'UEL', tagClass: 'uel', label: 'UEFA Europa League (5th place)' };
  }
  if (rank >= 18 && rank <= 20) {
    return { className: 'zone-border-rel', tag: 'REL', tagClass: 'rel', label: 'Relegation Zone' };
  }
  return { className: 'zone-border-mid', tag: '', tagClass: '', label: '' };
}

/**
 * Renders uniform rank cell with fixed slots for number and badge so numbers align identically
 */
export function renderRankCell(rank, isActual = false) {
  const zone = getZoneDetails(rank);
  const badgeHtml = zone.tag
    ? `<span class="zone-tag ${zone.tagClass}" title="${zone.label}">${zone.tag}</span>`
    : '';
  const numCls = isActual ? 'whatif-rank-actual' : 'whatif-rank-pred';
  return `
    <div class="whatif-rank-wrapper">
      <span class="whatif-rank-num ${numCls}">${rank}</span>
      <span class="whatif-rank-badge-slot">${badgeHtml}</span>
    </div>
  `;
}

export function formatRankShiftBadge(rankDiff) {
  if (rankDiff > 0) {
    return `<span class="rank-shift-pill shift-up" title="+${rankDiff} spots higher than actual rank">▲ +${rankDiff}</span>`;
  }
  if (rankDiff < 0) {
    return `<span class="rank-shift-pill shift-down" title="${Math.abs(rankDiff)} spots lower than actual rank">▼ ${rankDiff}</span>`;
  }
  return `<span class="rank-shift-pill shift-equal" title="Same as actual rank">—</span>`;
}

export function formatPtsDiffBadge(ptsDiff) {
  if (ptsDiff > 0) {
    return `<span class="pts-diff-pill pts-up" title="+${ptsDiff} pts higher than actual points">+${ptsDiff}</span>`;
  }
  if (ptsDiff < 0) {
    return `<span class="pts-diff-pill pts-down" title="${ptsDiff} pts lower than actual points">${ptsDiff}</span>`;
  }
  return `<span class="pts-diff-pill pts-equal" title="Same as actual points">0</span>`;
}

export function renderFormPills(formArray = []) {
  if (!formArray || !formArray.length) return `<span class="text-dim text-xs">—</span>`;
  return formArray.map(r => {
    const cls = r === 'W' ? 'form-pill form-w' : r === 'D' ? 'form-pill form-d' : 'form-pill form-l';
    return `<span class="${cls}" title="${r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'}">${r}</span>`;
  }).join('');
}

/**
 * Invalidate cached backend standings to force fresh computation
 */
export function resetWhatIfCache() {
  whatIfState.backendData = null;
  whatIfState.lastFetchedKey = null;
}

/**
 * Main Render Entry Point for What-If View
 */
export function renderWhatIfView(appState) {
  const container = document.getElementById('whatIfView');
  if (!container) return;

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

  const selectedPlayer = availablePlayers.find(p => p.id === Number(whatIfState.selectedPlayerId)) || availablePlayers[0] || { id: null, name: 'Player' };
  const playerName = selectedPlayer.name;

  // Background fetch from backend calculation endpoint to ensure full backend parity
  const startGw = (appState.activeGroup && appState.activeGroup.start_gw) ? Number(appState.activeGroup.start_gw) : 1;
  const fetchKey = `${selectedPlayer.id}_${whatIfState.mode}_${whatIfState.gwLimit}_${startGw}`;

  if (whatIfState.lastFetchedKey !== fetchKey && !whatIfState.isFetchingBackend && selectedPlayer.id) {
    whatIfState.isFetchingBackend = true;
    apiFetchWhatIfStandings({
      playerId: selectedPlayer.id,
      mode: whatIfState.mode,
      gwLimit: whatIfState.gwLimit,
      startGw
    }).then(backendRes => {
      whatIfState.backendData = backendRes;
      whatIfState.lastFetchedKey = fetchKey;
      whatIfState.isFetchingBackend = false;
      renderWhatIfView(appState);
    }).catch(err => {
      console.warn('Backend What-If standings fetch fallback to client:', err.message);
      whatIfState.isFetchingBackend = false;
      whatIfState.lastFetchedKey = fetchKey;
    });
  }

  // Compute standings data (use backendData if matching key, else compute client-side)
  let data;
  if (whatIfState.backendData && whatIfState.lastFetchedKey === fetchKey && whatIfState.backendData.comparisonList) {
    data = {
      simTable: whatIfState.backendData.simTable,
      realTable: whatIfState.backendData.realTable,
      comparisonList: whatIfState.backendData.comparisonList,
      meta: whatIfState.backendData.meta || {},
      insights: {
        accuracyScore: whatIfState.backendData.kpis?.accuracyScore,
        mostDiffPoints: whatIfState.backendData.kpis?.mostDiffPoints,
        predictedLeader: whatIfState.backendData.kpis?.predictedLeader || whatIfState.backendData.kpis?.simLeader,
        simLeader: whatIfState.backendData.kpis?.predictedLeader || whatIfState.backendData.kpis?.simLeader,
        actualLeader: whatIfState.backendData.kpis?.actualLeader || whatIfState.backendData.kpis?.realLeader,
        realLeader: whatIfState.backendData.kpis?.actualLeader || whatIfState.backendData.kpis?.realLeader,
        biggestClimber: whatIfState.backendData.kpis?.biggestClimber,
        biggestFaller: whatIfState.backendData.kpis?.biggestFaller,
      }
    };
  } else {
    data = calculateLeagueStandings({
      fixtures: appState.fixtures,
      teams: appState.teams,
      predictions: appState.predictions,
      playerId: selectedPlayer.id,
      mode: whatIfState.mode,
      gwLimit: whatIfState.gwLimit,
      startGw,
    });
  }

  // Filter comparison list based on Quick Filter (top 6, bottom 6, etc.)
  let workingList = [...data.comparisonList];
  if (whatIfState.filter === 'top6') {
    workingList = workingList.filter(row => row.simRank >= 1 && row.simRank <= 6);
  } else if (whatIfState.filter === 'bottom6') {
    workingList = workingList.filter(row => row.simRank >= 15 && row.simRank <= 20);
  } else if (whatIfState.filter === 'top4') {
    workingList = workingList.filter(row => row.simRank >= 1 && row.simRank <= 4);
  } else if (whatIfState.filter === 'bottom3') {
    workingList = workingList.filter(row => row.simRank >= 18 && row.simRank <= 20);
  }

  // Filter comparison list if user searched for a team
  if (whatIfState.searchQuery) {
    const q = whatIfState.searchQuery.toLowerCase().trim();
    workingList = workingList.filter(row =>
      row.name.toLowerCase().includes(q) || (row.short && row.short.toLowerCase().includes(q))
    );
  }

  // Sort comparison list by active sort column and direction
  const sortCol = whatIfState.sortCol || 'simRank';
  const sortDir = whatIfState.sortDir || 'asc';
  workingList.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (sortCol === 'name' || sortCol === 'short') {
      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    }
    valA = Number(valA) || 0;
    valB = Number(valB) || 0;
    if (valA !== valB) {
      return sortDir === 'asc' ? valA - valB : valB - valA;
    }
    return a.simRank - b.simRank;
  });

  const totalClubs = data.comparisonList.length;
  const displayedClubs = workingList.length;
  const accuracyScore = data.insights?.accuracyScore;

  // Build the complete HTML
  let html = `
    <!-- Header Title & Subtitle -->
    <div class="whatif-page-header flex justify-between items-center flex-wrap gap-2" style="margin-bottom: 8px;">
      <div>
        <h2 style="font-family: var(--font-title); font-size: 1.4rem; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin: 0;">
          <span style="font-size: 1.4rem;">🔮</span> "What If" League Standings Simulator
        </h2>
        <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 2px; margin-bottom: 0;">
          Explore how the 2026/27 Premier League table shifts based on <strong>${playerName}</strong>'s score predictions vs actual results.
        </p>
      </div>

      <!-- Quick Export / Action Buttons -->
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary btn-back-dashboard" id="whatIfBackToDashboardBtn" title="Return to Match Predictions Dashboard" style="font-size: 0.8rem; padding: 5px 10px;">
          📊 ← Dashboard
        </button>
        <button class="btn btn-secondary" id="exportWhatIfCsvBtn" title="Download standings comparison as CSV" style="font-size: 0.8rem; padding: 5px 10px;">
          📥 Export CSV
        </button>
      </div>
    </div>

    <!-- Toolbar: Player Picker, Scope Mode, Filters, View -->
    <div class="whatif-toolbar glass-card" style="display: flex; flex-direction: column; gap: 8px; padding: 8px 12px; margin-bottom: 8px;">
      
      <!-- Top Toolbar Row -->
      <div class="flex justify-between items-center flex-wrap gap-2" style="width: 100%;">
        <div class="whatif-toolbar-left" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <!-- Player Switcher -->
          <div class="whatif-control-item" style="display: flex; align-items: center; gap: 8px;">
            <label for="whatIfPlayerSelect" class="toolbar-label">👤 Predictor:</label>
            <select id="whatIfPlayerSelect" class="control-dropdown" style="font-weight: 700;">
              ${availablePlayers.map(p => `
                <option value="${p.id}" ${p.id === Number(whatIfState.selectedPlayerId) ? 'selected' : ''}>
                  ${p.name} ${appState.auth?.activePlayerId === p.id ? '(You)' : ''}
                </option>
              `).join('')}
            </select>
            ${accuracyScore ? `
              <div class="whatif-player-pas-badge" id="whatIfToolbarPasBadge" title="Prediction Accuracy Score: ${accuracyScore.score}/100 (${accuracyScore.tier}) • Click to view breakdown" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 20px; background: ${accuracyScore.tierColor}15; border: 1px solid ${accuracyScore.tierColor}40;">
                <span class="whatif-badge-score" style="color: ${accuracyScore.tierColor}; font-weight: 800; font-size: 0.8rem; font-family: var(--font-mono);">PAS ${accuracyScore.score}</span>
                <span class="whatif-badge-tier" style="font-size: 0.72rem; color: var(--text-muted);">${accuracyScore.tierIcon} ${accuracyScore.tier}</span>
              </div>
            ` : ''}
          </div>

          <!-- Scope: Completed Matches vs Full Season -->
          <div class="whatif-control-item">
            <label class="toolbar-label">⚡ Scope:</label>
            <div class="whatif-btn-group">
              <button type="button" class="whatif-btn-option ${whatIfState.mode === 'completed' ? 'active' : ''}" id="whatIfModeCompletedBtn" title="Compare completed matches: Predicted vs Actual">
                ⚡ Completed Matches
              </button>
              <button type="button" class="whatif-btn-option ${whatIfState.mode === 'all' ? 'active' : ''}" id="whatIfModeAllBtn" title="Project full season standings using all predictions">
                🔮 Full Season (All 38 GWs)
              </button>
            </div>
          </div>

          <!-- View: Comparison vs Side-by-Side -->
          <div class="whatif-control-item">
            <label class="toolbar-label">📊 View:</label>
            <div class="whatif-btn-group">
              <button type="button" class="whatif-btn-option ${whatIfState.layout === 'comparison' ? 'active' : ''}" id="whatIfLayoutCompBtn" title="Unified comparison table: Predicted vs Actual">
                📊 Comparison
              </button>
              <button type="button" class="whatif-btn-option ${whatIfState.layout === 'split' ? 'active' : ''}" id="whatIfLayoutSplitBtn" title="Side-by-side view: Predicted Standings vs Actual Standings">
                👥 Side-by-Side
              </button>
            </div>
          </div>
        </div>

        <div class="whatif-toolbar-right" style="display: flex; align-items: center; gap: 10px;">
          <!-- Search filter -->
          <div style="position: relative;">
            <input type="text" id="whatIfSearchInput" class="form-input" placeholder="Filter clubs..." value="${whatIfState.searchQuery}" style="padding: 6px 10px 6px 28px; font-size: 0.84rem; width: 170px;" />
            <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-dim); font-size: 0.8rem;">🔍</span>
          </div>
        </div>
      </div>

      <!-- Quick Filter Row: All, Top 6, Bottom 6, Top 4, Bottom 3 -->
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
        <span class="toolbar-label" style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
          🎯 Quick Filter:
        </span>
        <div class="whatif-btn-group" id="whatIfFilterGroup">
          <button type="button" class="whatif-btn-option ${whatIfState.filter === 'all' ? 'active' : ''}" data-filter="all" title="Show all 20 Premier League clubs">
            🌐 All Clubs (${totalClubs})
          </button>
          <button type="button" class="whatif-btn-option ${whatIfState.filter === 'top6' ? 'active' : ''}" data-filter="top6" title="Filter to Top 6 clubs (European qualification contenders)">
            🔝 Top 6
          </button>
          <button type="button" class="whatif-btn-option ${whatIfState.filter === 'bottom6' ? 'active' : ''}" data-filter="bottom6" title="Filter to Bottom 6 clubs (Relegation battle zone)">
            🔻 Bottom 6
          </button>
          <button type="button" class="whatif-btn-option ${whatIfState.filter === 'top4' ? 'active' : ''}" data-filter="top4" title="Filter to Top 4 clubs (UEFA Champions League spots)">
            🏆 Top 4 (UCL)
          </button>
          <button type="button" class="whatif-btn-option ${whatIfState.filter === 'bottom3' ? 'active' : ''}" data-filter="bottom3" title="Filter to Bottom 3 clubs (Drop zone)">
            ⚠️ Relegation (18–20)
          </button>
        </div>
        <span class="whatif-filter-pill-count">
          Showing <strong>${displayedClubs}</strong> of ${totalClubs} clubs
        </span>
      </div>

    </div>

    <!-- 6 Headline KPI Cards -->
    <div class="whatif-insights-grid" style="grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));">
      
      <!-- 0. Hero KPI Card: Prediction Accuracy Score (PAS) -->
      ${accuracyScore ? `
      <div class="whatif-insight-card whatif-accuracy-hero-card" id="whatIfAccuracyCard" title="Click to view detailed breakdown of the 3 score components" style="border: 1px solid ${accuracyScore.tierColor}66; background: linear-gradient(135deg, ${accuracyScore.tierColor}14 0%, rgba(0, 0, 0, 0.25) 100%); cursor: pointer;">
        <div class="whatif-card-icon-box" style="background: ${accuracyScore.tierColor}25; color: ${accuracyScore.tierColor}; border: 1px solid ${accuracyScore.tierColor}55;">
          ${accuracyScore.tierIcon}
        </div>
        <div class="whatif-insight-info" style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
            <span class="whatif-insight-label" style="font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; font-size: 0.68rem;">ACCURACY</span>
            <span class="whatif-tier-pill" style="border-color: ${accuracyScore.tierColor}; color: ${accuracyScore.tierColor}; background: ${accuracyScore.tierColor}18; font-size: 0.62rem; padding: 1px 4px;">
              ${accuracyScore.tier}
            </span>
          </div>
          <div class="whatif-insight-value" style="display: flex; align-items: baseline; gap: 6px; margin: 3px 0 1px 0;">
            <span style="font-size: 1.5rem; font-weight: 900; color: ${accuracyScore.tierColor}; font-family: var(--font-title); line-height: 1;">
              ${accuracyScore.score}
            </span>
            <span style="font-size: 0.8rem; color: var(--text-dim); font-weight: 600;">/ 100</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <span class="whatif-insight-sub" style="font-size: 0.69rem; color: var(--text-muted);">
              ρ: ${accuracyScore.components?.rankProximity?.rho != null ? accuracyScore.components.rankProximity.rho : '—'} • Shift: ${accuracyScore.components?.rankProximity?.mars != null ? accuracyScore.components.rankProximity.mars : '—'} spots
            </span>
            <span class="whatif-view-breakdown-link" style="color: ${accuracyScore.tierColor}; font-size: 0.7rem; font-weight: 700;">
              ${whatIfState.showAccuracyBreakdown ? 'Hide ▲' : 'Breakdown ▼'}
            </span>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- 1. Largest Prediction Gap (Predicted vs Actual) -->
      <div class="whatif-insight-card" style="border: 1px solid rgba(244, 63, 94, 0.35); background: linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(0, 0, 0, 0.2) 100%);">
        <div class="whatif-card-icon-box" style="background: rgba(244, 63, 94, 0.18); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4);">💥</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label" title="Club with the highest gap between predicted and actual points">Largest Prediction Gap</span>
          <div class="whatif-insight-value">
            ${data.insights.mostDiffPoints ? `
              ${getCrestImg(data.insights.mostDiffPoints.code, data.insights.mostDiffPoints.name)}
              <span class="whatif-team-short-badge">${data.insights.mostDiffPoints.short}</span>
              <span class="whatif-team-fullname" title="${data.insights.mostDiffPoints.name}">${data.insights.mostDiffPoints.name}</span>
              <span style="font-weight: 800; color: #fb7185;">
                ${data.insights.mostDiffPoints.ptsDiff > 0 ? '+' : ''}${data.insights.mostDiffPoints.ptsDiff} pts
              </span>
            ` : '—'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.mostDiffPoints ? `
              Pred: <strong>${data.insights.mostDiffPoints.simPts} pts</strong> • Actual: <strong>${data.insights.mostDiffPoints.realPts} pts</strong> (${data.insights.mostDiffPoints.ptsDiff > 0 ? `Overpredicted by ${data.insights.mostDiffPoints.ptsDiff} pts` : data.insights.mostDiffPoints.ptsDiff < 0 ? `Underpredicted by ${Math.abs(data.insights.mostDiffPoints.ptsDiff)} pts` : 'Exact match'})
            ` : 'Matches actual points for all clubs'}
          </span>
        </div>
      </div>

      <!-- 2. Predicted Leader vs Actual Leader -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box gold">👑</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Predicted Leader</span>
          <div class="whatif-insight-value">
            ${data.insights.predictedLeader || data.insights.simLeader ? `
              ${getCrestImg((data.insights.predictedLeader || data.insights.simLeader).code, (data.insights.predictedLeader || data.insights.simLeader).name)}
              <span class="whatif-team-short-badge">${(data.insights.predictedLeader || data.insights.simLeader).short}</span>
              <span class="whatif-team-fullname" title="${(data.insights.predictedLeader || data.insights.simLeader).name}">${(data.insights.predictedLeader || data.insights.simLeader).name}</span>
            ` : '—'}
          </div>
          <span class="whatif-insight-sub">
            ${(data.insights.predictedLeader || data.insights.simLeader) ? `
              <strong>${(data.insights.predictedLeader || data.insights.simLeader).points} pts</strong> • Actual #1: ${(data.insights.actualLeader || data.insights.realLeader) ? '<span class="whatif-team-fullname">' + (data.insights.actualLeader || data.insights.realLeader).name + '</span><span class="whatif-team-short-only">' + ((data.insights.actualLeader || data.insights.realLeader).short || (data.insights.actualLeader || data.insights.realLeader).name) + '</span> (' + (data.insights.actualLeader || data.insights.realLeader).points + ' pts)' : '—'}
            ` : ''}
          </span>
        </div>
      </div>

      <!-- 3. Biggest Climber -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box green">🚀</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Biggest Climber</span>
          <div class="whatif-insight-value">
            ${data.insights.biggestClimber ? `
              ${getCrestImg(data.insights.biggestClimber.code, data.insights.biggestClimber.name)}
              <span class="whatif-team-short-badge">${data.insights.biggestClimber.short}</span>
              <span class="whatif-team-fullname" title="${data.insights.biggestClimber.name}">${data.insights.biggestClimber.name}</span>
            ` : '<span style="color: var(--text-dim); font-size:0.9rem;">No rank climbs</span>'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.biggestClimber ? `
              <span style="color: #34d399; font-weight: 700;">▲ +${data.insights.biggestClimber.rankDiff} spots</span> (Pred #${data.insights.biggestClimber.simRank} vs Actual #${data.insights.biggestClimber.realRank})
            ` : 'No rank change vs actual'}
          </span>
        </div>
      </div>

      <!-- 4. Biggest Faller -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box rose">📉</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Biggest Faller</span>
          <div class="whatif-insight-value">
            ${data.insights.biggestFaller ? `
              ${getCrestImg(data.insights.biggestFaller.code, data.insights.biggestFaller.name)}
              <span class="whatif-team-short-badge">${data.insights.biggestFaller.short}</span>
              <span class="whatif-team-fullname" title="${data.insights.biggestFaller.name}">${data.insights.biggestFaller.name}</span>
            ` : '<span style="color: var(--text-dim); font-size:0.9rem;">No rank drops</span>'}
          </div>
          <span class="whatif-insight-sub">
            ${data.insights.biggestFaller ? `
              <span style="color: #fb7185; font-weight: 700;">▼ ${data.insights.biggestFaller.rankDiff} spots</span> (Pred #${data.insights.biggestFaller.simRank} vs Actual #${data.insights.biggestFaller.realRank})
            ` : 'No rank change vs actual'}
          </span>
        </div>
      </div>

      <!-- 5. Coverage & Prediction Accuracy -->
      <div class="whatif-insight-card">
        <div class="whatif-card-icon-box purple">🎯</div>
        <div class="whatif-insight-info">
          <span class="whatif-insight-label">Prediction Coverage</span>
          <div class="whatif-insight-value">
            <span>${data.meta.predictedMatchesCount} / ${data.meta.totalEvaluatedMatches}</span>
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">(${data.meta.coveragePercent}%)</span>
          </div>
          <span class="whatif-insight-sub">
            ${whatIfState.mode === 'completed' ? 'Completed matches evaluated' : 'Full season matches evaluated'}
          </span>
        </div>
      </div>

    </div>

    <!-- Collapsible Prediction Accuracy Breakdown Panel -->
    ${whatIfState.showAccuracyBreakdown && accuracyScore ? `
      <div class="whatif-accuracy-breakdown-panel glass-card" id="whatIfAccuracyDrawer" style="margin-bottom: 12px; padding: 14px 16px; border: 1px solid ${accuracyScore.tierColor}55; background: linear-gradient(180deg, rgba(22,22,38,0.9) 0%, rgba(12,12,22,0.95) 100%);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 1.15rem;">🎯</span>
            <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">Prediction Accuracy Score (PAS) Breakdown — ${playerName}</span>
            <span class="whatif-tier-pill" style="border-color: ${accuracyScore.tierColor}; color: ${accuracyScore.tierColor}; background: ${accuracyScore.tierColor}20; font-size: 0.72rem;">
              ${accuracyScore.tierIcon} ${accuracyScore.tier} (${accuracyScore.score}/100)
            </span>
          </div>
          <button type="button" class="btn btn-secondary" id="closeAccuracyBreakdownBtn" style="padding: 3px 10px; font-size: 0.75rem; border-radius: 4px;">✕ Close</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
          <!-- Pillar 1: Match Score Precision -->
          <div class="whatif-breakdown-pillar" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 0.82rem; color: #38bdf8;">🎯 Match Score Precision (${accuracyScore.components?.matchPrecision?.weight || '50%'})</span>
              <span style="font-weight: 800; font-size: 0.9rem; color: #38bdf8;">${accuracyScore.components?.matchPrecision?.score ?? 0}%</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
              <div style="height: 100%; width: ${accuracyScore.components?.matchPrecision?.score ?? 0}%; background: #38bdf8; border-radius: 3px;"></div>
            </div>
            <div style="font-size: 0.74rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 3px;">
              <span>• Exact Scores: <strong>${accuracyScore.components?.matchPrecision?.exactCount ?? 0}</strong></span>
              <span>• Correct Outcomes: <strong>${accuracyScore.components?.matchPrecision?.outcomeCount ?? 0} / ${accuracyScore.components?.matchPrecision?.evaluatedCount ?? 0}</strong> (${accuracyScore.components?.matchPrecision?.outcomePct ?? 0}%)</span>
              <span>• Avg Goal Deviation: <strong>${accuracyScore.components?.matchPrecision?.avgGoalError ?? 0}</strong> goals/match</span>
            </div>
          </div>

          <!-- Pillar 2: Table Rank Proximity -->
          <div class="whatif-breakdown-pillar" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 0.82rem; color: #a78bfa;">📐 Table Rank Proximity (${accuracyScore.components?.rankProximity?.weight || '35%'})</span>
              <span style="font-weight: 800; font-size: 0.9rem; color: #a78bfa;">${accuracyScore.components?.rankProximity?.score ?? 0}%</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
              <div style="height: 100%; width: ${accuracyScore.components?.rankProximity?.score ?? 0}%; background: #a78bfa; border-radius: 3px;"></div>
            </div>
            <div style="font-size: 0.74rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 3px;">
              <span>• Spearman Rank Corr (ρ) (${accuracyScore.components?.rankProximity?.subWeights?.rho || '60%'}): <strong>${accuracyScore.components?.rankProximity?.rho ?? '—'}</strong></span>
              <span>• Mean Absolute Rank Shift (${accuracyScore.components?.rankProximity?.subWeights?.mars || '40%'}): <strong>${accuracyScore.components?.rankProximity?.mars ?? '—'}</strong> spots/team</span>
              <span>• Top 4 Correct: <strong>${accuracyScore.components?.rankProximity?.top4Accuracy ?? '—'}</strong></span>
            </div>
          </div>

          <!-- Pillar 3: Points Calibration -->
          <div class="whatif-breakdown-pillar" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-sm); padding: 10px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 0.82rem; color: #34d399;">⚖️ Points Calibration (${accuracyScore.components?.pointsCalibration?.weight || '15%'})</span>
              <span style="font-weight: 800; font-size: 0.9rem; color: #34d399;">${accuracyScore.components?.pointsCalibration?.score ?? 0}%</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
              <div style="height: 100%; width: ${accuracyScore.components?.pointsCalibration?.score ?? 0}%; background: #34d399; border-radius: 3px;"></div>
            </div>
            <div style="font-size: 0.74rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 3px;">
              <span>• Mean Abs Points Error: <strong>${accuracyScore.components?.pointsCalibration?.avgPtsError ?? '—'}</strong> pts/team</span>
              <span>• Formula: ${accuracyScore.components?.matchPrecision?.weight || '50%'} Match + ${accuracyScore.components?.rankProximity?.weight || '35%'} Rank + ${accuracyScore.components?.pointsCalibration?.weight || '15%'} Pts</span>
              <span>• Evaluated across all 20 Premier League clubs</span>
            </div>
          </div>
        </div>
      </div>
    ` : ''}
  `;

  // Render Table depending on selected layout
  if (whatIfState.layout === 'comparison') {
    html += renderComparisonTableHtml(workingList, playerName);
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
      <span style="margin-left: auto; font-style: italic; color: var(--text-dim);">💡 Click any column header to sort • Click any team row to inspect match predictions</span>
    </div>
  `;

  container.innerHTML = html;

  // Attach event listeners
  attachWhatIfEvents(appState);
}

/**
 * Helper to render sort indicator
 */
function getSortIndicator(col) {
  if (whatIfState.sortCol === col) {
    return `<span class="whatif-sort-icon">${whatIfState.sortDir === 'asc' ? '▲' : '▼'}</span>`;
  }
  return `<span class="whatif-sort-icon">↕</span>`;
}

/**
 * Helper to render sortable TH element
 */
function renderSortableTh(col, label, title, alignment = 'left', style = '', extraClass = '') {
  const isSorted = whatIfState.sortCol === col;
  const alignClass = alignment === 'center' ? 'text-center' : alignment === 'right' ? 'text-right' : '';
  const classList = ['sortable', isSorted ? 'sorted' : '', alignClass, extraClass].filter(Boolean).join(' ');
  return `
    <th class="${classList}" data-sort="${col}" title="Click to sort by ${title}" style="${style}">
      <span>${label}</span>
      ${getSortIndicator(col)}
    </th>
  `;
}

/**
 * Renders the Comparison Table HTML with all required columns and sortability
 */
function renderComparisonTableHtml(comparisonList, playerName) {
  return `
    <section class="glass-card" style="padding: 0; overflow: hidden; margin-top: 8px;">
      <div class="table-responsive">
        <table class="whatif-table">
          <thead>
            <tr>
              ${renderSortableTh('name', 'Club', 'Club Crest & Name', 'left', 'width: 105px; min-width: 95px; max-width: 120px;', 'whatif-col-club')}
              ${renderSortableTh('simRank', '<span class="whatif-header-pred" title="Predicted Rank">Pred Rank</span>', 'Predicted Rank Position', 'center', 'width: 58px;')}
              ${renderSortableTh('realRank', '<span class="whatif-header-actual" title="Actual Rank">Actual Rank</span>', 'Actual Premier League Rank', 'center', 'width: 58px;')}
              ${renderSortableTh('rankDiff', 'Shift', 'Rank Movement (Predicted vs Actual)', 'center', 'width: 38px;')}
              ${renderSortableTh('simPts', '<span class="whatif-header-pred" title="Predicted Points">Pred Pts</span>', 'Predicted Points', 'center', 'width: 46px;')}
              ${renderSortableTh('realPts', '<span class="whatif-header-actual" title="Actual Points">Act Pts</span>', 'Actual Premier League Points', 'center', 'width: 46px;')}
              ${renderSortableTh('ptsDiff', 'Diff', 'Points Difference (Predicted minus Actual)', 'center', 'width: 40px;')}
              ${renderSortableTh('simPlayed', 'P', 'Matches Played', 'center', 'width: 30px;')}
              ${renderSortableTh('simWon', 'W', 'Wins', 'center', 'width: 30px;')}
              ${renderSortableTh('simDrawn', 'D', 'Draws', 'center', 'width: 30px;')}
              ${renderSortableTh('simLost', 'L', 'Losses', 'center', 'width: 30px;')}
              ${renderSortableTh('simGF', 'GF', 'Goals For', 'center', 'width: 32px;')}
              ${renderSortableTh('simGA', 'GA', 'Goals Against', 'center', 'width: 32px;')}
              ${renderSortableTh('simGD', 'GD', 'Goal Difference', 'center', 'width: 34px;')}
              <th style="width: 80px; text-align: center;">Form</th>
            </tr>
          </thead>
          <tbody>
            ${comparisonList.length === 0 ? `
              <tr>
                <td colspan="15" style="text-align: center; padding: 18px; color: var(--text-muted);">
                  No clubs match your current filter or search criteria.
                </td>
              </tr>
            ` : comparisonList.map(row => {
              const zone = getZoneDetails(row.simRank);
              const isExpanded = whatIfState.expandedTeamId === row.id;

              let rowHtml = `
                <tr class="whatif-row ${zone.className} ${isExpanded ? 'selected' : ''}" data-team-id="${row.id}" title="Click to view match log for ${row.name}">
                  <!-- 1. Club Crest, Short Name, Full Name -->
                  <td class="whatif-col-club">
                    <div class="whatif-team-cell">
                      ${getCrestImg(row.code, row.name)}
                      <span class="whatif-team-short-badge" title="Short code: ${row.short}">${row.short}</span>
                      <span class="whatif-team-fullname" title="${row.name}">${row.name}</span>
                    </div>
                  </td>

                  <!-- 2. Predicted Rank with qualification badge -->
                  <td class="whatif-pos-cell">
                    ${renderRankCell(row.simRank, false)}
                  </td>

                  <!-- 3. Actual Rank with qualification badge -->
                  <td class="whatif-pos-cell">
                    ${renderRankCell(row.realRank, true)}
                  </td>

                  <!-- 4. Rank Shift -->
                  <td class="text-center">
                    ${formatRankShiftBadge(row.rankDiff)}
                  </td>

                  <!-- 5. Points Based on Predictions -->
                  <td class="text-center">
                    <span class="whatif-pts-predicted" title="Predicted Points: ${row.simPts}">${row.simPts}</span>
                  </td>

                  <!-- 6. Actual Points -->
                  <td class="text-center">
                    <span class="whatif-pts-actual" title="Actual Points: ${row.realPts}">${row.realPts}</span>
                  </td>

                  <!-- 7. Points Difference -->
                  <td class="text-center">
                    ${formatPtsDiffBadge(row.ptsDiff)}
                  </td>

                  <!-- 8-14. Match Stats -->
                  <td class="text-center whatif-num">${row.simPlayed}</td>
                  <td class="text-center whatif-num">${row.simWon}</td>
                  <td class="text-center whatif-num">${row.simDrawn}</td>
                  <td class="text-center whatif-num">${row.simLost}</td>
                  <td class="text-center whatif-num">${row.simGF}</td>
                  <td class="text-center whatif-num">${row.simGA}</td>
                  <td class="text-center whatif-num" style="${row.simGD > 0 ? 'color:#34d399;' : row.simGD < 0 ? 'color:#fb7185;' : ''}">
                    ${row.simGD > 0 ? '+' : ''}${row.simGD}
                  </td>

                  <!-- 15. Form Guide -->
                  <td class="text-center" style="white-space: nowrap;">
                    ${renderFormPills(row.simForm)}
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
      <div class="whatif-table-legend">
        <div class="whatif-legend-item">
          <span class="zone-tag ucl">UCL</span>
          <span>1–4 UEFA Champions League (Top 4)</span>
        </div>
        <div class="whatif-legend-item">
          <span class="zone-tag uel">UEL</span>
          <span>5 UEFA Europa League (5th place)</span>
        </div>
        <div class="whatif-legend-item" style="color: var(--text-dim); font-size: 0.67rem;">
          <span>Cup Winners: FA Cup (UEL) • EFL Cup / Carabao Cup (UECL)</span>
        </div>
        <div class="whatif-legend-item">
          <span class="zone-tag rel">REL</span>
          <span>18–20 Relegation</span>
        </div>
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
      <td colspan="15">
        <div class="whatif-drilldown-content" style="padding: 16px; background: rgba(0,0,0,0.3); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              ${getCrestImg(teamRow.code, teamRow.name)}
              <span>Match Log with ${playerName}'s Predictions: <strong>${teamRow.name} (${teamRow.short})</strong></span>
              <span class="badge badge-secondary" style="font-size: 0.72rem;">${matches.length} Matches Evaluated</span>
            </span>
            <button type="button" class="btn btn-sm close-drawer-btn" data-team-id="${teamRow.id}" style="font-size: 0.75rem; padding: 4px 10px;">✕ Close</button>
          </div>

          ${matches.length === 0 ? `
            <p style="color: var(--text-muted); font-size: 0.85rem;">No match predictions or completed fixtures recorded for this club.</p>
          ` : `
            <div class="whatif-matches-grid">
              ${matches.map(m => {
                const oppName = m.isHome ? m.awayTeam : m.homeTeam;
                const oppCode = m.isHome ? m.awayCode : m.homeCode;
                const oppShort = m.isHome ? (m.awayShort || '') : (m.homeShort || '');
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
                        ${oppShort ? `<span class="whatif-team-short-badge">${oppShort}</span>` : ''}
                        <span>vs <span class="whatif-team-fullname">${oppName}</span><span class="whatif-team-short-only">${oppShort || oppName}</span></span>
                      </div>
                      <div class="whatif-score-badge ${m.isPrediction ? 'pred-source' : ''}">
                        ${myScore} – ${oppScore}
                      </div>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; justify-content: space-between;">
                      <span>${m.isPrediction ? '🎯 Predicted by ' + playerName : '⚡ Actual Result'}</span>
                      ${m.actualHomeScore !== null && m.actualHomeScore !== undefined ? `<span>Actual: ${m.isHome ? m.actualHomeScore : m.actualAwayScore}-${m.isHome ? m.actualAwayScore : m.actualHomeScore}</span>` : ''}
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
    <div class="whatif-side-by-side-grid" style="margin-top: 14px;">
      
      <!-- Left: Predicted Standings Table -->
      <div class="whatif-split-card">
        <div class="whatif-split-header">
          <h3>
            <span>🔮</span> ${playerName}'s Predicted Standings
          </h3>
          <span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
            Predicted Standings
          </span>
        </div>

        <div class="table-responsive">
          <table class="whatif-table">
            <thead>
              <tr>
                <th class="whatif-col-club" style="width: 105px;">Club</th>
                <th class="text-center" style="width: 58px;"><span class="whatif-header-pred">Pred Rank</span></th>
                <th class="text-center" style="width: 30px;">P</th>
                <th class="text-center" style="width: 30px;">W</th>
                <th class="text-center" style="width: 30px;">D</th>
                <th class="text-center" style="width: 30px;">L</th>
                <th class="text-center" style="width: 34px;">GD</th>
                <th class="text-center" style="width: 44px;"><span class="whatif-header-pred">Pts</span></th>
              </tr>
            </thead>
            <tbody>
              ${simTable.map(t => {
                const zone = getZoneDetails(t.rank);
                return `
                  <tr class="whatif-row ${zone.className}">
                    <td class="whatif-col-club">
                      <div class="whatif-team-cell">
                        ${getCrestImg(t.code, t.name)}
                        <span class="whatif-team-short-badge">${t.short}</span>
                        <span class="whatif-team-fullname" title="${t.name}">${t.name}</span>
                      </div>
                    </td>
                    <td class="whatif-pos-cell">
                      ${renderRankCell(t.rank, false)}
                    </td>
                    <td class="text-center whatif-num">${t.played}</td>
                    <td class="text-center whatif-num">${t.won}</td>
                    <td class="text-center whatif-num">${t.drawn}</td>
                    <td class="text-center whatif-num">${t.lost}</td>
                    <td class="text-center whatif-num" style="${t.goalDiff > 0 ? 'color:#34d399;' : t.goalDiff < 0 ? 'color:#fb7185;' : ''}">
                      ${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}
                    </td>
                    <td class="text-center whatif-pts-predicted">${t.points}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right: Actual Standings Table -->
      <div class="whatif-split-card">
        <div class="whatif-split-header">
          <h3>
            <span>⚡</span> Actual Standings
          </h3>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
            Actual Standings
          </span>
        </div>

        <div class="table-responsive">
          <table class="whatif-table">
            <thead>
              <tr>
                <th class="whatif-col-club" style="width: 105px;">Club</th>
                <th class="text-center" style="width: 58px;"><span class="whatif-header-actual">Actual Rank</span></th>
                <th class="text-center" style="width: 30px;">P</th>
                <th class="text-center" style="width: 30px;">W</th>
                <th class="text-center" style="width: 30px;">D</th>
                <th class="text-center" style="width: 30px;">L</th>
                <th class="text-center" style="width: 34px;">GD</th>
                <th class="text-center" style="width: 44px;"><span class="whatif-header-actual">Pts</span></th>
              </tr>
            </thead>
            <tbody>
              ${realTable.map(t => {
                const zone = getZoneDetails(t.rank);
                return `
                  <tr class="whatif-row ${zone.className}">
                    <td class="whatif-col-club">
                      <div class="whatif-team-cell">
                        ${getCrestImg(t.code, t.name)}
                        <span class="whatif-team-short-badge">${t.short}</span>
                        <span class="whatif-team-fullname" title="${t.name}">${t.name}</span>
                      </div>
                    </td>
                    <td class="whatif-pos-cell">
                      ${renderRankCell(t.rank, true)}
                    </td>
                    <td class="text-center whatif-num">${t.played}</td>
                    <td class="text-center whatif-num">${t.won}</td>
                    <td class="text-center whatif-num">${t.drawn}</td>
                    <td class="text-center whatif-num">${t.lost}</td>
                    <td class="text-center whatif-num" style="${t.goalDiff > 0 ? 'color:#34d399;' : t.goalDiff < 0 ? 'color:#fb7185;' : ''}">
                      ${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}
                    </td>
                    <td class="text-center whatif-pts-actual">${t.points}</td>
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
      whatIfState.backendData = null;
      whatIfState.lastFetchedKey = null;
      renderWhatIfView(appState);
    });
  }

  // Scope Buttons
  const modeCompBtn = document.getElementById('whatIfModeCompletedBtn');
  const modeAllBtn = document.getElementById('whatIfModeAllBtn');
  if (modeCompBtn && modeAllBtn) {
    modeCompBtn.addEventListener('click', () => {
      whatIfState.mode = 'completed';
      whatIfState.backendData = null;
      whatIfState.lastFetchedKey = null;
      renderWhatIfView(appState);
    });
    modeAllBtn.addEventListener('click', () => {
      whatIfState.mode = 'all';
      whatIfState.backendData = null;
      whatIfState.lastFetchedKey = null;
      renderWhatIfView(appState);
    });
  }

  // Quick Filter Buttons (All, Top 6, Bottom 6, Top 4, Bottom 3)
  const filterBtns = document.querySelectorAll('#whatIfFilterGroup .whatif-btn-option');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filterVal = btn.dataset.filter || 'all';
      whatIfState.filter = filterVal;
      renderWhatIfView(appState);
    });
  });

  // Sortable Column Headers
  const sortableThs = document.querySelectorAll('.whatif-table thead th.sortable');
  sortableThs.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (!col) return;
      if (whatIfState.sortCol === col) {
        // Toggle direction
        whatIfState.sortDir = whatIfState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        whatIfState.sortCol = col;
        // Default direction for stats/points is desc, for position/name is asc
        whatIfState.sortDir = ['simPts', 'realPts', 'ptsDiff', 'simWon', 'simGF', 'simGD', 'rankDiff'].includes(col) ? 'desc' : 'asc';
      }
      renderWhatIfView(appState);
    });
  });

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

  // Accuracy Hero Card Click
  const accuracyCard = document.getElementById('whatIfAccuracyCard');
  if (accuracyCard) {
    accuracyCard.addEventListener('click', () => {
      whatIfState.showAccuracyBreakdown = !whatIfState.showAccuracyBreakdown;
      renderWhatIfView(appState);
    });
  }

  // Toolbar PAS Badge Click
  const toolbarPasBadge = document.getElementById('whatIfToolbarPasBadge');
  if (toolbarPasBadge) {
    toolbarPasBadge.addEventListener('click', () => {
      whatIfState.showAccuracyBreakdown = !whatIfState.showAccuracyBreakdown;
      renderWhatIfView(appState);
    });
  }

  // Close Accuracy Breakdown Panel Button
  const closeAccuracyBtn = document.getElementById('closeAccuracyBreakdownBtn');
  if (closeAccuracyBtn) {
    closeAccuracyBtn.addEventListener('click', () => {
      whatIfState.showAccuracyBreakdown = false;
      renderWhatIfView(appState);
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

  const headers = ['Predicted_Rank', 'Actual_Rank', 'Rank_Shift', 'Club', 'Short_Code', 'Played', 'Won', 'Drawn', 'Lost', 'Goals_For', 'Goals_Against', 'Goal_Difference', 'Predicted_Points', 'Actual_Points', 'Points_Diff'];
  const rows = data.comparisonList.map(r => [
    r.simRank,
    r.realRank,
    r.rankDiff > 0 ? `+${r.rankDiff}` : r.rankDiff,
    `"${r.name}"`,
    r.short,
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
 * Compact Dashboard Snapshot Widget (Available to all players)
 */
export function renderWhatIfDashboardWidget(containerEl, appState, onOpenWhatIf) {
  if (!containerEl) return;

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
  const mostDiff = data.insights.mostDiffPoints;

  containerEl.innerHTML = `
    <div class="glass-card dashboard-whatif-preview-card" style="margin-top: 24px; padding: 18px;">
      <div class="section-header" style="margin-bottom: 12px;">
        <div>
          <h3 style="font-family: var(--font-title); font-size: 1.15rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            <span>🔮</span> "What If" Standings Preview: ${activePlayer.name}'s Predictions
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
                <span class="whatif-team-short-badge">${t.short}</span>
                <span style="font-weight: 700; font-size: 0.85rem;" class="whatif-team-fullname">${t.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: var(--font-mono); font-weight: 800; color: #c084fc; font-size: 0.88rem;">${t.points} pts</span>
                ${comp ? formatRankShiftBadge(comp.rankDiff) : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px;">
        ${climber ? `
          <div style="flex: 1; min-width: 240px; font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(16, 185, 129, 0.08); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
            <span>🚀 <strong>Biggest Jump:</strong> ${climber.name} (${climber.short}) ranks #${climber.simRank} (${climber.rankDiff > 0 ? '+' : ''}${climber.rankDiff} spots higher than actual rank)</span>
          </div>
        ` : ''}
        ${mostDiff ? `
          <div style="flex: 1; min-width: 240px; font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(168, 85, 247, 0.08); border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.25);">
            <span>💥 <strong>Most Divergent:</strong> ${mostDiff.name} (${mostDiff.short}) has ${mostDiff.ptsDiff > 0 ? '+' : ''}${mostDiff.ptsDiff} pts difference (Pred ${mostDiff.simPts} vs Actual ${mostDiff.realPts})</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const btn = document.getElementById('dashOpenWhatIfBtn');
  if (btn && typeof onOpenWhatIf === 'function') {
    btn.addEventListener('click', onOpenWhatIf);
  }
}
