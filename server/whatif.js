// whatif.js - Backend calculation engine for What-If league rankings and scenarios
import fs from 'fs';
import path from 'path';
import { getFplCache, getAppSetting } from './db.js';

let envLoaded = false;
function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve('/app/.env')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, 'utf8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch (e) {
        // ignore
      }
    }
  }
}

/**
 * Returns calibrated PAS component weights from database app_settings, env, or defaults
 */
export function getAccuracyScoreWeights(db = null) {
  loadEnvFile();

  const parseWeight = (val, defaultVal) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const clean = String(val).replace('%', '').trim();
    const num = parseFloat(clean);
    if (isNaN(num) || num < 0) return defaultVal;
    return num > 1 ? num / 100 : num;
  };

  // 1. Check SQLite app_settings
  let dbMatch = null, dbRank = null, dbPts = null, dbRho = null, dbMars = null;
  try {
    dbMatch = getAppSetting('pas_weight_match');
    dbRank = getAppSetting('pas_weight_rank');
    dbPts = getAppSetting('pas_weight_points');
    dbRho = getAppSetting('pas_weight_rho');
    dbMars = getAppSetting('pas_weight_mars');
  } catch (e) {
    // ignore
  }

  const isDbConfigured = (dbMatch != null || dbRank != null || dbPts != null);
  const isEnvConfigured = (process.env.PAS_WEIGHT_MATCH != null || process.env.PAS_WEIGHT_RANK != null || (process.env.PAS_WEIGHT_POINTS != null || process.env.PAS_WEIGHT_PTS != null));

  let source = 'default';
  if (isDbConfigured) source = 'database';
  else if (isEnvConfigured) source = 'env';

  const rawMatch = parseWeight(dbMatch ?? process.env.PAS_WEIGHT_MATCH, 0.50);
  const rawRank = parseWeight(dbRank ?? process.env.PAS_WEIGHT_RANK, 0.35);
  const rawPts = parseWeight(dbPts ?? (process.env.PAS_WEIGHT_POINTS ?? process.env.PAS_WEIGHT_PTS), 0.15);

  const sum = rawMatch + rawRank + rawPts;
  let weightMatch = 0.50;
  let weightRank = 0.35;
  let weightPts = 0.15;

  if (sum > 0) {
    weightMatch = rawMatch / sum;
    weightRank = rawRank / sum;
    weightPts = rawPts / sum;
  }

  // Sub-weights for Table Rank Proximity: Spearman rho vs MARS (mean absolute rank shift)
  const rawRho = parseWeight(dbRho ?? process.env.PAS_WEIGHT_RHO, 0.60);
  const rawMars = parseWeight(dbMars ?? process.env.PAS_WEIGHT_MARS, 0.40);
  const sumRankSub = rawRho + rawMars;
  const weightRho = sumRankSub > 0 ? rawRho / sumRankSub : 0.60;
  const weightMars = sumRankSub > 0 ? rawMars / sumRankSub : 0.40;

  return {
    source,
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

export function getPasSettingsDetails(db = null) {
  const current = getAccuracyScoreWeights(db);
  loadEnvFile();

  const parseWeight = (val, defaultVal) => {
    if (val === undefined || val === null || val === '') return defaultVal;
    const clean = String(val).replace('%', '').trim();
    const num = parseFloat(clean);
    if (isNaN(num) || num < 0) return defaultVal;
    return num > 1 ? num / 100 : num;
  };

  const envMatch = parseWeight(process.env.PAS_WEIGHT_MATCH, 0.50);
  const envRank = parseWeight(process.env.PAS_WEIGHT_RANK, 0.35);
  const envPts = parseWeight(process.env.PAS_WEIGHT_POINTS ?? process.env.PAS_WEIGHT_PTS, 0.15);
  const envSum = envMatch + envRank + envPts;

  return {
    source: current.source,
    weights: {
      match: Math.round(current.weightMatch * 100),
      rank: Math.round(current.weightRank * 100),
      points: Math.round(current.weightPts * 100),
      rho: Math.round(current.weightRho * 100),
      mars: Math.round(current.weightMars * 100),
    },
    envWeights: {
      match: envSum > 0 ? Math.round((envMatch / envSum) * 100) : 50,
      rank: envSum > 0 ? Math.round((envRank / envSum) * 100) : 35,
      points: envSum > 0 ? Math.round((envPts / envSum) * 100) : 15,
      rho: Math.round(parseWeight(process.env.PAS_WEIGHT_RHO, 0.60) * 100),
      mars: Math.round(parseWeight(process.env.PAS_WEIGHT_MARS, 0.40) * 100),
    },
    defaults: {
      match: 50,
      rank: 35,
      points: 15,
      rho: 60,
      mars: 40,
    }
  };
}

export const FALLBACK_TEAMS = [
  { id: 1, name: 'Arsenal', short: 'ARS', code: 3 },
  { id: 2, name: 'Aston Villa', short: 'AVL', code: 7 },
  { id: 3, name: 'Bournemouth', short: 'BOU', code: 91 },
  { id: 4, name: 'Brentford', short: 'BRE', code: 94 },
  { id: 5, name: 'Brighton', short: 'BHA', code: 36 },
  { id: 6, name: 'Chelsea', short: 'CHE', code: 8 },
  { id: 7, name: 'Coventry City', short: 'COV', code: 9 },
  { id: 8, name: 'Crystal Palace', short: 'CRY', code: 31 },
  { id: 9, name: 'Everton', short: 'EVE', code: 11 },
  { id: 10, name: 'Fulham', short: 'FUL', code: 54 },
  { id: 11, name: 'Hull City', short: 'HUL', code: 88 },
  { id: 12, name: 'Ipswich Town', short: 'IPS', code: 40 },
  { id: 13, name: 'Leeds', short: 'LEE', code: 2 },
  { id: 14, name: 'Liverpool', short: 'LIV', code: 14 },
  { id: 15, name: 'Man City', short: 'MCI', code: 43 },
  { id: 16, name: 'Man Utd', short: 'MUN', code: 1 },
  { id: 17, name: 'Newcastle', short: 'NEW', code: 4 },
  { id: 18, name: "Nott'm Forest", short: 'NFO', code: 17 },
  { id: 19, name: 'Spurs', short: 'TOT', code: 6 },
  { id: 20, name: 'Sunderland', short: 'SUN', code: 56 }
];

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

export function calculateBackendWhatIfStandings(db, {
  playerId = null,
  mode = 'completed', // 'completed' | 'all'
  startGw = 1,
  gwLimit = 'all'
} = {}) {
  // 1. Resolve player
  let player = null;
  if (playerId) {
    player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(Number(playerId));
  }
  if (!player) {
    // Pick first player who has predictions, or first player in db
    const playerWithPred = db.prepare(`
      SELECT p.id, p.name 
      FROM players p 
      INNER JOIN predictions pr ON p.id = pr.player_id 
      GROUP BY p.id 
      ORDER BY count(pr.match_id) DESC 
      LIMIT 1
    `).get();
    player = playerWithPred || db.prepare('SELECT id, name FROM players ORDER BY id ASC LIMIT 1').get();
  }

  if (!player) {
    player = { id: 0, name: 'Guest' };
  }

  // 2. Fetch Teams from bootstrap-static cache or fallback
  let teamsMap = {};
  const bootstrapCache = getFplCache('bootstrap-static');
  if (bootstrapCache && bootstrapCache.data) {
    try {
      const parsed = JSON.parse(bootstrapCache.data);
      if (Array.isArray(parsed.teams) && parsed.teams.length > 0) {
        parsed.teams.forEach(t => {
          teamsMap[t.id] = {
            id: t.id,
            name: t.name,
            short: t.short_name || t.name.slice(0, 3).toUpperCase(),
            code: t.code || t.id
          };
        });
      }
    } catch (e) {
      console.warn('Error parsing bootstrap-static cache in whatif:', e.message);
    }
  }

  if (Object.keys(teamsMap).length === 0) {
    FALLBACK_TEAMS.forEach(t => {
      teamsMap[t.id] = { ...t };
    });
  }

  // 3. Fetch Fixtures from cache
  let fixturesList = [];
  const fixturesCache = getFplCache('fixtures');
  if (fixturesCache && fixturesCache.data) {
    try {
      fixturesList = JSON.parse(fixturesCache.data);
    } catch (e) {
      console.warn('Error parsing fixtures cache in whatif:', e.message);
    }
  }

  // 4. Fetch Predictions for this player
  const predictionRows = player.id ? db.prepare(`
    SELECT match_id, home_score, away_score 
    FROM predictions 
    WHERE player_id = ?
  `).all(player.id) : [];

  const predictionMap = {};
  predictionRows.forEach(p => {
    if (p.home_score !== null && p.home_score !== undefined &&
        p.away_score !== null && p.away_score !== undefined) {
      predictionMap[p.match_id] = {
        home_score: Number(p.home_score),
        away_score: Number(p.away_score)
      };
    }
  });

  // 5. Initialize team records
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
    matches: []
  });

  const realTableMap = {};
  const simTableMap = {};
  Object.values(teamsMap).forEach(t => {
    realTableMap[t.id] = createTeamRecord(t);
    simTableMap[t.id] = createTeamRecord(t);
  });

  let totalEvaluatedMatches = 0;
  let predictedMatchesCount = 0;
  let totalFinishedMatches = 0;
  const evaluatedPredictions = [];

  const now = new Date();
  const numericStartGw = Number(startGw) || 1;
  const numericGwLimit = gwLimit === 'all' ? Infinity : Number(gwLimit);

  // 6. Process each fixture
  fixturesList.forEach(f => {
    const gw = f.event;
    if (!gw || gw < numericStartGw || gw > numericGwLimit) return;

    const homeId = f.team_h;
    const awayId = f.team_a;
    if (!realTableMap[homeId]) {
      const hObj = teamsMap[homeId] || { id: homeId, name: `Team ${homeId}`, short: `T${homeId}`, code: homeId };
      realTableMap[homeId] = createTeamRecord(hObj);
      simTableMap[homeId] = createTeamRecord(hObj);
    }
    if (!realTableMap[awayId]) {
      const aObj = teamsMap[awayId] || { id: awayId, name: `Team ${awayId}`, short: `T${awayId}`, code: awayId };
      realTableMap[awayId] = createTeamRecord(aObj);
      simTableMap[awayId] = createTeamRecord(aObj);
    }

    const isFinished = Boolean(f.finished || f.finished_provisional);
    const isStarted = Boolean(f.started || (f.kickoff_time && now >= new Date(f.kickoff_time)));
    const hasActualScore = (f.team_h_score !== null && f.team_h_score !== undefined &&
                            f.team_a_score !== null && f.team_a_score !== undefined);
    const isRealPlayed = (isFinished || isStarted) && hasActualScore;

    // Real table calculation
    if (isRealPlayed) {
      totalFinishedMatches++;
      const actH = Number(f.team_h_score);
      const actA = Number(f.team_a_score);

      applyMatchResult(realTableMap[homeId], realTableMap[awayId], actH, actA, {
        fixtureId: f.id,
        gw,
        homeTeam: realTableMap[homeId].name,
        awayTeam: realTableMap[awayId].name,
        homeShort: realTableMap[homeId].short,
        awayShort: realTableMap[awayId].short,
        homeCode: realTableMap[homeId].code,
        awayCode: realTableMap[awayId].code,
        homeScore: actH,
        awayScore: actA,
        isPrediction: false
      });
    }

    // Simulated table calculation
    const pred = predictionMap[f.id];
    let simH = null;
    let simA = null;
    let isPredSource = false;

    if (mode === 'completed') {
      if (isRealPlayed) {
        totalEvaluatedMatches++;
        if (pred && !isNaN(pred.home_score) && !isNaN(pred.away_score)) {
          simH = Number(pred.home_score);
          simA = Number(pred.away_score);
          isPredSource = true;
          predictedMatchesCount++;
          evaluatedPredictions.push({
            fixtureId: f.id,
            gw,
            homeId,
            awayId,
            predH: simH,
            predA: simA,
            actH: Number(f.team_h_score),
            actA: Number(f.team_a_score)
          });
        } else {
          simH = Number(f.team_h_score);
          simA = Number(f.team_a_score);
        }
      }
    } else { // mode === 'all'
      if (pred && !isNaN(pred.home_score) && !isNaN(pred.away_score)) {
        totalEvaluatedMatches++;
        predictedMatchesCount++;
        simH = Number(pred.home_score);
        simA = Number(pred.away_score);
        isPredSource = true;
        if (isRealPlayed) {
          evaluatedPredictions.push({
            fixtureId: f.id,
            gw,
            homeId,
            awayId,
            predH: simH,
            predA: simA,
            actH: Number(f.team_h_score),
            actA: Number(f.team_a_score)
          });
        }
      } else if (isRealPlayed) {
        totalEvaluatedMatches++;
        simH = Number(f.team_h_score);
        simA = Number(f.team_a_score);
      }
    }

    if (simH !== null && simA !== null) {
      applyMatchResult(simTableMap[homeId], simTableMap[awayId], simH, simA, {
        fixtureId: f.id,
        gw,
        homeTeam: simTableMap[homeId].name,
        awayTeam: simTableMap[awayId].name,
        homeShort: simTableMap[homeId].short,
        awayShort: simTableMap[awayId].short,
        homeCode: simTableMap[homeId].code,
        awayCode: simTableMap[awayId].code,
        homeScore: simH,
        awayScore: simA,
        isPrediction: isPredSource,
        actualHomeScore: f.team_h_score,
        actualAwayScore: f.team_a_score
      });
    }
  });

  // 7. Sort according to Premier League rules
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

  // 8. Build Comparison List
  const comparisonList = simTable.map(sim => {
    const real = realRankMap[sim.id] || {
      rank: 20, points: 0, goalDiff: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, formSummary: []
    };
    const rankDiff = real.rank - sim.rank; // > 0 means sim rank is higher (better) than real
    const ptsDiff = sim.points - real.points; // > 0 means sim pts higher than real pts
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
      gdDiff
    };
  });

  // 9. Calculate KPIs
  // Most Difference in Points (Actual vs Predicted)
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

  const simLeader = simTable[0] || null;
  const realLeader = realTable[0] || null;

  const leaderPayload = simLeader ? {
    id: simLeader.id,
    name: simLeader.name,
    short: simLeader.short,
    code: simLeader.code,
    points: simLeader.points,
    goalDiff: simLeader.goalDiff,
    rank: 1
  } : null;

  const actualLeaderPayload = realLeader ? {
    id: realLeader.id,
    name: realLeader.name,
    short: realLeader.short,
    code: realLeader.code,
    points: realLeader.points,
    goalDiff: realLeader.goalDiff,
    rank: 1
  } : null;

  const sortedByClimb = [...comparisonList].sort((a, b) => b.rankDiff - a.rankDiff);
  const biggestClimber = (sortedByClimb[0] && sortedByClimb[0].rankDiff > 0) ? sortedByClimb[0] : null;

  const sortedByDrop = [...comparisonList].sort((a, b) => a.rankDiff - b.rankDiff);
  const biggestFaller = (sortedByDrop[0] && sortedByDrop[0].rankDiff < 0) ? sortedByDrop[0] : null;

  const coveragePercent = totalEvaluatedMatches > 0
    ? Math.round((predictedMatchesCount / totalEvaluatedMatches) * 100)
    : 0;

  const accuracyScore = calculatePredictionAccuracyScore(comparisonList, evaluatedPredictions, null, db);

  return {
    success: true,
    player: {
      id: player.id,
      name: player.name
    },
    simTable,
    realTable,
    comparisonList,
    kpis: {
      accuracyScore,
      mostDiffPoints,
      predictedLeader: leaderPayload,
      simLeader: leaderPayload,
      actualLeader: actualLeaderPayload,
      realLeader: actualLeaderPayload,
      biggestClimber: biggestClimber ? {
        id: biggestClimber.id,
        name: biggestClimber.name,
        short: biggestClimber.short,
        code: biggestClimber.code,
        rankDiff: biggestClimber.rankDiff,
        simRank: biggestClimber.simRank,
        realRank: biggestClimber.realRank
      } : null,
      biggestFaller: biggestFaller ? {
        id: biggestFaller.id,
        name: biggestFaller.name,
        short: biggestFaller.short,
        code: biggestFaller.code,
        rankDiff: biggestFaller.rankDiff,
        simRank: biggestFaller.simRank,
        realRank: biggestFaller.realRank
      } : null,
      coverage: {
        predictedMatchesCount,
        totalEvaluatedMatches,
        totalFinishedMatches,
        coveragePercent
      }
    },
    meta: {
      mode,
      startGw: numericStartGw,
      gwLimit,
      totalEvaluatedMatches,
      predictedMatchesCount,
      totalFinishedMatches,
      coveragePercent
    }
  };
}

/**
 * Calculates the composite Prediction Accuracy Score (PAS: 0-100)
 * Evaluates:
 * 1. Match Score Precision (50%): Exact scores, outcome hits, goal deviation
 * 2. Table Rank Proximity (35%): Spearman rank correlation & mean rank shift
 * 3. Points Calibration (15%): Mean absolute points error
 */
export function calculatePredictionAccuracyScore(comparisonList = [], evaluatedPredictions = [], customWeights = null, db = null) {
  const weights = customWeights || getAccuracyScoreWeights(db);

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
