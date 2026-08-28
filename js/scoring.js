// scoring.js - EPL Prediction Scoring Engine

/**
 * Evaluate a prediction against an actual result.
 *
 * @param {number} actH  - Actual home goals
 * @param {number} actA  - Actual away goals
 * @param {number} predH - Predicted home goals
 * @param {number} predA - Predicted away goals
 * @returns {{ base: number, highScoringBonus: number, drawBonus: number, total: number, tier: number, isExactScore: boolean, isCorrectOutcome: boolean }} | null
 */
export function evaluatePrediction(actH, actA, predH, predA) {
  // All four values must be valid numbers
  if ([actH, actA, predH, predA].some(v => v === null || v === undefined || isNaN(v))) {
    return null;
  }

  const actOutcome  = Math.sign(actH - actA);
  const predOutcome = Math.sign(predH - predA);

  const isCorrectOutcome   = actOutcome === predOutcome;
  const isExactScore        = actH === predH && actA === predA;
  const isExactGD           = (actH - actA) === (predH - predA);
  const isOneTeamGoalsExact = actH === predH || actA === predA;

  // Base points (mutually exclusive, highest tier wins)
  let tier;
  if (isExactScore)                                                      { tier = 1; }
  else if (isCorrectOutcome && isExactGD && !(actH === 0 && actA === 0)) { tier = 2; }
  else if (isCorrectOutcome && isOneTeamGoalsExact)    { tier = 3; }
  else if (isCorrectOutcome)                           { tier = 4; }
  else if (isOneTeamGoalsExact)                        { tier = 5; }
  else                                                 { tier = 6; }

  const tierObj = SCORING_TIERS.find(t => t.tier === tier) || { pts: 0 };
  const base = tierObj.pts;

  // Bonus points (additive)
  let highScoringBonus = 0;
  let drawBonus = 0;
  let customBonusesTotal = 0;
  const activeBonuses = [];

  for (const b of SCORING_BONUSES) {
    let qualified = true;

    // Check Min Goals filter if enabled
    if (b.minGoalsEnabled && b.minGoals != null) {
      const target = Number(b.minGoals);
      const mode = b.minGoalsMode || 'BOTH';

      if (mode === 'HOME') {
        qualified = qualified && (actH >= target && predH >= target);
      } else if (mode === 'AWAY') {
        qualified = qualified && (actA >= target && predA >= target);
      } else if (mode === 'EITHER') {
        const actMatch = (actH >= target || actA >= target);
        const predMatch = (predH >= target || predA >= target);
        qualified = qualified && actMatch && predMatch;
      } else { // 'BOTH' (default: total match goals >= target)
        qualified = qualified && (actH + actA >= target && predH + predA >= target);
      }
    }

    // Check Goal Difference filter if enabled
    if (qualified && b.goalDiffEnabled && b.goalDiff != null) {
      const targetGD = Math.abs(Number(b.goalDiff));
      const actGD = Math.abs(actH - actA);
      const predGD = Math.abs(predH - predA);
      qualified = qualified && (actGD >= targetGD && predGD >= targetGD);
    }

    // Rule specific built-in requirements
    if (b.id === 'drawBonus' || b.condition_type === 'exact_draw') {
      qualified = qualified && (actH === actA && isExactScore);
    } else {
      // Non-draw bonus rules require predicting correct match outcome
      qualified = qualified && isCorrectOutcome;
    }

    if (qualified) {
      if (b.id === 'highScoring') highScoringBonus += b.pts;
      else if (b.id === 'drawBonus') drawBonus += b.pts;
      else customBonusesTotal += b.pts;

      activeBonuses.push({
        id: b.id,
        name: b.name,
        pts: b.pts,
        icon: b.icon || '⭐',
        icon_type: b.icon_type || 'emoji',
        shortDesc: b.shortDesc || b.short_desc || '',
        desc: b.desc || ''
      });
    }
  }

  const total = base + highScoringBonus + drawBonus + customBonusesTotal;

  return { base, highScoringBonus, drawBonus, customBonusesTotal, activeBonuses, total, tier, isExactScore, isCorrectOutcome };
}

/** CSS class for a points badge */
export function ptsBadgeClass(evalResult) {
  if (evalResult === null || evalResult === undefined) return 'pending';
  if (typeof evalResult === 'object') {
    const tier = evalResult.tier ?? 6;
    const hasBonus = Boolean(
      (evalResult.highScoringBonus && evalResult.highScoringBonus > 0) ||
      (evalResult.drawBonus && evalResult.drawBonus > 0) ||
      (evalResult.total > evalResult.base)
    );
    return `tier-${tier}${hasBonus ? ' has-bonus-border' : ''}`;
  }
  const map = { 8:'tier-1 has-bonus-border', 7:'tier-1 has-bonus-border', 6:'tier-1', 5:'tier-2 has-bonus-border', 4:'tier-2', 3:'tier-3', 2:'tier-4', 1:'tier-5', 0:'tier-6' };
  return map[evalResult] ?? 'tier-6';
}

/** Human-readable tier label */
export function tierLabel(tier) {
  const tObj = SCORING_TIERS.find(t => t.tier === tier);
  if (tObj) {
    const isSvg = tObj.icon_type === 'svg' || (typeof tObj.icon === 'string' && tObj.icon.includes('.svg'));
    const iconPrefix = isSvg ? '' : `${tObj.icon} `;
    return `${iconPrefix}${tObj.name} (${tObj.pts} ${tObj.pts === 1 ? 'pt' : 'pts'})`;
  }
  return '-';
}

/** Complete definitions of all Premier League scoring tiers (Mutable for dynamic updates) */
export let SCORING_TIERS = [
  {
    tier: 1,
    name: 'The Vishwaguru',
    pts: 6,
    icon: '🔮',
    icon_type: 'emoji',
    badgeClass: 'p6',
    shortDesc: 'Exact match scoreline',
    desc: 'Correctly predicted the exact final scoreline for both teams.',
    example: 'Actual 3–1 | Predicted 3–1',
    condition_type: 'exact_score'
  },
  {
    tier: 2,
    name: 'The Manager',
    pts: 4,
    icon: '📋',
    icon_type: 'emoji',
    badgeClass: 'p4',
    shortDesc: 'Correct winner/draw + exact GD',
    desc: 'Correct match outcome (Home/Away/Draw) AND exact goal difference matched.',
    example: 'Actual 3–1 (GD +2) | Predicted 2–0 (GD +2)',
    condition_type: 'outcome_gd'
  },
  {
    tier: 3,
    name: 'The Fan',
    pts: 3,
    icon: '🎙️',
    icon_type: 'emoji',
    badgeClass: 'p3',
    shortDesc: 'Correct winner/draw + 1 team score',
    desc: 'Correct match outcome, incorrect GD, but correctly predicted either home or away score.',
    example: 'Actual 3–1 | Predicted 3–0 or 2–1',
    condition_type: 'outcome_one_team'
  },
  {
    tier: 4,
    name: 'The Pundit',
    pts: 2,
    icon: '📣',
    icon_type: 'emoji',
    badgeClass: 'p2',
    shortDesc: 'Correct winner/draw only',
    desc: 'Correct match outcome only; goal difference and individual team scores are incorrect.',
    example: 'Actual 3–1 | Predicted 4–0 or 1–0',
    condition_type: 'outcome_only'
  },
  {
    tier: 5,
    name: 'The Casual',
    pts: 1,
    icon: '🎲',
    icon_type: 'emoji',
    badgeClass: 'p1',
    shortDesc: 'Wrong outcome, 1 team score matched',
    desc: 'Incorrect match outcome, but correctly predicted one team\'s exact goal tally.',
    example: 'Actual 3–1 (Home Win) | Predicted 3–3 (Draw) or 0–1 (Away Win)',
    condition_type: 'wrong_outcome_one_team'
  },
  {
    tier: 6,
    name: 'The Infantino',
    pts: 0,
    icon: '🛋️',
    icon_type: 'emoji',
    badgeClass: 'p0',
    shortDesc: 'Incorrect outcome & 0 team goals',
    desc: 'Incorrect match outcome and neither team\'s score was predicted correctly.',
    example: 'Actual 3–1 | Predicted 0–2',
    condition_type: 'miss'
  }
];

/** Complete definitions of additive bonus scoring rules (Mutable for dynamic updates) */
export let SCORING_BONUSES = [
  {
    id: 'highScoring',
    name: 'High-Scoring Thriller Bonus',
    pts: 1,
    icon: '🔥',
    icon_type: 'emoji',
    badgeClass: 'p-bonus',
    shortDesc: 'Actual & predicted goals both ≥ 4 + correct outcome',
    desc: 'Awarded when both total actual goals and total predicted goals are 4 or more, and you predicted the correct outcome.',
    example: 'Actual 3–1 (4 goals) | Predicted 4–0 (4 goals)',
    minGoals: 4,
    minGoalsMode: 'BOTH',
    minGoalsEnabled: true,
    goalDiff: null,
    goalDiffEnabled: false
  },
  {
    id: 'goalRush',
    name: 'Goal Rush Bonus',
    pts: 1,
    icon: '⚡',
    icon_type: 'emoji',
    badgeClass: 'p-bonus',
    shortDesc: 'Either team goals ≥ 5 & GD ≥ 3 + correct outcome',
    desc: 'Awarded when either team scores 5 or more goals with a goal difference of 3 or more, and you predicted the correct outcome.',
    example: 'Actual 5–0 (GD +5) | Predicted 5–2 (GD +3)',
    minGoals: 5,
    minGoalsMode: 'EITHER',
    minGoalsEnabled: true,
    goalDiff: 3,
    goalDiffEnabled: true
  },
  {
    id: 'drawBonus',
    name: 'Exact Draw Premium',
    pts: 1,
    icon: '✨',
    icon_type: 'emoji',
    badgeClass: 'p-bonus',
    shortDesc: 'Exact draw scoreline predicted',
    desc: 'Awarded when match ends in a draw and you predicted the exact draw scoreline.',
    example: 'Actual 2–2 | Predicted 2–2',
    minGoals: null,
    minGoalsMode: 'BOTH',
    minGoalsEnabled: false,
    goalDiff: null,
    goalDiffEnabled: false
  }
];

/**
 * Update active scoring rules in state dynamically at runtime.
 * @param {Array} rawRules
 */
export function updateScoringRulesState(rawRules) {
  if (!Array.isArray(rawRules) || rawRules.length === 0) return;

  const tiers = [];
  const bonuses = [];

  for (const r of rawRules) {
    if (r.rule_type === 'tier') {
      const tierNum = Number(r.id);
      const iconType = r.icon_type ? r.icon_type : (r.icon && r.icon.includes('.svg') ? 'svg' : 'emoji');
      tiers.push({
        tier: tierNum,
        name: r.name,
        pts: Number(r.pts),
        icon: r.icon || '⚽',
        icon_type: iconType,
        badgeClass: r.badge_class || `p${r.pts}`,
        shortDesc: r.short_desc || '',
        desc: r.desc || '',
        example: r.example || '',
        condition_type: r.condition_type || (
          tierNum === 1 ? 'exact_score' :
          tierNum === 2 ? 'outcome_gd' :
          tierNum === 3 ? 'outcome_one_team' :
          tierNum === 4 ? 'outcome_only' :
          tierNum === 5 ? 'wrong_outcome_one_team' : 'miss'
        )
      });
    } else if (r.rule_type === 'bonus') {
      const iconType = r.icon_type ? r.icon_type : (r.icon && r.icon.includes('.svg') ? 'svg' : 'emoji');
      bonuses.push({
        id: String(r.id),
        name: r.name,
        pts: Number(r.pts),
        icon: r.icon || '⭐',
        icon_type: iconType,
        badgeClass: r.badge_class || 'p-bonus',
        shortDesc: r.short_desc || '',
        desc: r.desc || '',
        example: r.example || '',
        minGoals: r.min_goals != null ? Number(r.min_goals) : (r.id === 'highScoring' ? 4 : null),
        minGoalsMode: r.min_goals_mode || 'BOTH',
        minGoalsEnabled: r.min_goals_enabled != null ? Boolean(r.min_goals_enabled) : (r.min_goals != null || r.id === 'highScoring'),
        goalDiff: r.goal_diff != null ? Number(r.goal_diff) : null,
        goalDiffEnabled: Boolean(r.goal_diff_enabled)
      });
    }
  }

  if (tiers.length > 0) {
    tiers.sort((a, b) => a.tier - b.tier);
    SCORING_TIERS.length = 0;
    SCORING_TIERS.push(...tiers);
  }

  if (bonuses.length > 0) {
    SCORING_BONUSES.length = 0;
    SCORING_BONUSES.push(...bonuses);
  }
}

/**
 * Render a polished HTML example container for a scoring rule.
 * @param {string} exampleStr
 * @returns {string} HTML string
 */
export function renderExampleContainer(exampleStr) {
  if (!exampleStr) return '';

  let htmlContent = '';

  if (exampleStr.includes('|')) {
    const parts = exampleStr.split('|').map(s => s.trim());
    const actualText = parts[0].replace(/^Actual\s*/i, '');
    const predText = parts[1].replace(/^Predicted\s*/i, '');

    let calcTag = '';
    let cleanPredText = predText;
    const calcMatch = predText.match(/\((Total:[^)]+)\)/i);
    if (calcMatch) {
      calcTag = `<span class="example-calc-pill">${calcMatch[1]}</span>`;
      cleanPredText = predText.replace(/\((Total:[^)]+)\)/i, '').trim();
    }

    htmlContent = `
      <div class="example-flex-row">
        <div class="example-chip actual-chip">
          <span class="example-chip-tag">Actual</span>
          <span class="example-chip-val">${actualText}</span>
        </div>
        <span class="example-vs-badge">VS</span>
        <div class="example-chip pred-chip">
          <span class="example-chip-tag">Predicted</span>
          <span class="example-chip-val">${cleanPredText}</span>
        </div>
        ${calcTag}
      </div>
    `;
  } else if (exampleStr.includes('+')) {
    const plusParts = exampleStr.split('+').map(s => s.trim());
    const actualText = plusParts[0].replace(/^Actual\s*/i, '');
    const bonusText = plusParts[1];

    htmlContent = `
      <div class="example-flex-row">
        <div class="example-chip actual-chip">
          <span class="example-chip-tag">Actual</span>
          <span class="example-chip-val">${actualText}</span>
        </div>
        <span class="example-plus-badge">+</span>
        <div class="example-chip bonus-chip">
          <span class="example-chip-val">${bonusText}</span>
        </div>
      </div>
    `;
  } else {
    htmlContent = `
      <div class="example-flex-row">
        <div class="example-chip gen-chip">
          <span class="example-chip-val">${exampleStr}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="rule-example-box">
      <div class="rule-example-header">
        <span class="rule-example-icon">💡</span>
        <span class="rule-example-title">Example Scenario</span>
      </div>
      <div class="rule-example-body">
        ${htmlContent}
      </div>
    </div>
  `;
}

/**
 * Get detailed scoring breakdown for a prediction against an actual result.
 *
 * @param {number|null} actH
 * @param {number|null} actA
 * @param {number|null} predH
 * @param {number|null} predA
 * @returns {object} Full breakdown details
 */
export function getPredictionBreakdown(actH, actA, predH, predA, isLive = false) {
  const hasResult = actH !== null && actA !== null && actH !== undefined && actA !== undefined;
  const hasPred = predH !== null && predA !== null && predH !== undefined && predA !== undefined;

  if (!hasPred) {
    return {
      status: 'no_prediction',
      hasResult,
      isLive: Boolean(isLive),
      hasPred: false,
      total: 0,
      tier: null,
      tierInfo: null,
      bonuses: [],
      explanation: 'No prediction was entered for this match.',
      summaryLines: []
    };
  }

  if (!hasResult) {
    return {
      status: 'pending_result',
      hasResult: false,
      isLive: false,
      hasPred: true,
      predScore: `${predH} – ${predA}`,
      total: null,
      tier: null,
      tierInfo: null,
      bonuses: [],
      explanation: 'Match result pending kickoff or conclusion.',
      summaryLines: []
    };
  }

  const res = evaluatePrediction(actH, actA, predH, predA);
  if (!res) {
    return {
      status: 'invalid',
      hasResult: true,
      isLive: Boolean(isLive),
      hasPred: true,
      total: 0,
      tier: null,
      tierInfo: null,
      bonuses: [],
      explanation: 'Unable to evaluate score.',
      summaryLines: []
    };
  }

  const tierInfo = SCORING_TIERS.find(t => t.tier === res.tier) || SCORING_TIERS[5];
  const bonuses = (res.activeBonuses || []).map(b => ({
    id: b.id,
    name: b.name,
    pts: b.pts,
    icon: b.icon || '⭐',
    icon_type: b.icon_type || 'emoji',
    reason: b.shortDesc || b.desc || `${b.name} criteria met.`
  }));

  // Explanation construction
  let explanation = '';
  if (isLive) {
    if (res.tier === 1) {
      explanation = '🔮 Exact Score! Prediction currently matches the live match scoreline.';
    } else if (res.tier === 2) {
      explanation = `📋 The Manager: Currently matching winner/draw with exact goal difference (${(actH - actA) >= 0 ? '+' : ''}${actH - actA}).`;
    } else if (res.tier === 3) {
      const matchedSide = actH === predH ? 'Home team goals' : 'Away team goals';
      explanation = `🎙️ The Fan: Current outcome & matched ${matchedSide} exactly (${actH === predH ? actH : actA}).`;
    } else if (res.tier === 4) {
      explanation = '📣 The Pundit: Current match outcome (winner or draw) matched.';
    } else if (res.tier === 5) {
      const matchedSide = actH === predH ? 'Home' : 'Away';
      explanation = `🎲 The Casual: Wrong outcome, but matched ${matchedSide} goals (${actH === predH ? actH : actA}) as a consolation.`;
    } else {
      explanation = '🛋️ The Infantino: Incorrect match outcome and zero correct team goals against live score.';
    }
  } else {
    if (res.tier === 1) {
      explanation = '🔮 Perfect Score! The Vishwaguru predicted the exact match scoreline.';
    } else if (res.tier === 2) {
      explanation = `📋 The Manager: Correct winner/draw with exact goal difference (${(actH - actA) >= 0 ? '+' : ''}${actH - actA}).`;
    } else if (res.tier === 3) {
      const matchedSide = actH === predH ? 'Home team goals' : 'Away team goals';
      explanation = `🎙️ The Fan: Correct outcome & matched ${matchedSide} exactly (${actH === predH ? actH : actA}).`;
    } else if (res.tier === 4) {
      explanation = '📣 The Pundit: Correct match outcome (winner or draw) predicted.';
    } else if (res.tier === 5) {
      const matchedSide = actH === predH ? 'Home' : 'Away';
      explanation = `🎲 The Casual: Wrong outcome, but matched ${matchedSide} goals (${actH === predH ? actH : actA}) as a consolation.`;
    } else {
      explanation = '🛋️ The Infantino: Incorrect match outcome and zero correct team goals.';
    }
  }

  const summaryLines = [
    { label: `${tierInfo.icon} ${tierInfo.name}`, pts: res.base, isBonus: false }
  ];

  for (const b of bonuses) {
    summaryLines.push({ label: `${b.icon} ${b.name}`, pts: b.pts, isBonus: true });
  }

  return {
    status: 'evaluated',
    hasResult: true,
    isLive: Boolean(isLive),
    predScore: `${predH} – ${predA}`,
    actScore: `${actH} – ${actA}`,
    eval: res,
    tier: res.tier,
    tierInfo,
    bonuses,
    total: res.total,
    explanation,
    summaryLines
  };
}

