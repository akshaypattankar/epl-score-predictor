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
  let base, tier;
  if (isExactScore)                                    { base = 6; tier = 1; }
  else if (isCorrectOutcome && isExactGD)              { base = 4; tier = 2; }
  else if (isCorrectOutcome && isOneTeamGoalsExact)    { base = 3; tier = 3; }
  else if (isCorrectOutcome)                           { base = 2; tier = 4; }
  else if (isOneTeamGoalsExact)                        { base = 1; tier = 5; }
  else                                                 { base = 0; tier = 6; }

  // Bonus points (additive)
  const highScoringBonus = (actH + actA >= 4 && predH + predA >= 4 && isCorrectOutcome) ? 1 : 0;
  const drawBonus        = (actH === actA && isExactScore)                         ? 1 : 0;

  const total = base + highScoringBonus + drawBonus;

  return { base, highScoringBonus, drawBonus, total, tier, isExactScore, isCorrectOutcome };
}

/** CSS class for a points badge */
export function ptsBadgeClass(total) {
  if (total === null || total === undefined) return 'pending';
  const map = { 8:'p8', 7:'p7', 6:'p6', 5:'p5', 4:'p4', 3:'p3', 2:'p2', 1:'p1', 0:'p0' };
  return map[total] ?? 'p0';
}

/** Human-readable tier label */
export function tierLabel(tier) {
  const labels = {
    1: '🔮 The Vishwaguru (6 pts)',
    2: '📋 The Manager (4 pts)',
    3: '🎙️ The Fan (3 pts)',
    4: '📣 The Pundit (2 pts)',
    5: '🎲 The Casual (1 pt)',
    6: '🛋️ The Infantino (0 pts)',
  };
  return labels[tier] ?? '-';
}

/** Complete definitions of all Premier League scoring tiers */
export const SCORING_TIERS = [
  {
    tier: 1,
    name: 'The Vishwaguru',
    pts: 6,
    icon: '🔮',
    badgeClass: 'p6',
    shortDesc: 'Exact match scoreline',
    desc: 'Correctly predicted the exact final scoreline for both teams.',
    example: 'Actual 3–1 | Predicted 3–1'
  },
  {
    tier: 2,
    name: 'The Manager',
    pts: 4,
    icon: '📋',
    badgeClass: 'p4',
    shortDesc: 'Correct winner/draw + exact GD',
    desc: 'Correct match outcome (Home/Away/Draw) AND exact goal difference matched.',
    example: 'Actual 3–1 (GD +2) | Predicted 2–0 (GD +2)'
  },
  {
    tier: 3,
    name: 'The Fan',
    pts: 3,
    icon: '🎙️',
    badgeClass: 'p3',
    shortDesc: 'Correct winner/draw + 1 team score',
    desc: 'Correct match outcome, incorrect GD, but correctly predicted either home or away score.',
    example: 'Actual 3–1 | Predicted 3–0 or 2–1'
  },
  {
    tier: 4,
    name: 'The Pundit',
    pts: 2,
    icon: '📣',
    badgeClass: 'p2',
    shortDesc: 'Correct winner/draw only',
    desc: 'Correct match outcome only; goal difference and individual team scores are incorrect.',
    example: 'Actual 3–1 | Predicted 4–0 or 1–0'
  },
  {
    tier: 5,
    name: 'The Casual',
    pts: 1,
    icon: '🎲',
    badgeClass: 'p1',
    shortDesc: 'Wrong outcome, 1 team score matched',
    desc: 'Incorrect match outcome, but correctly predicted one team\'s exact goal tally.',
    example: 'Actual 3–1 (Home Win) | Predicted 3–3 (Draw) or 0–1 (Away Win)'
  },
  {
    tier: 6,
    name: 'The Infantino',
    pts: 0,
    icon: '🛋️',
    badgeClass: 'p0',
    shortDesc: 'Incorrect outcome & 0 team goals',
    desc: 'Incorrect match outcome and neither team\'s score was predicted correctly.',
    example: 'Actual 3–1 | Predicted 0–2'
  }
];

/** Complete definitions of additive bonus scoring rules */
export const SCORING_BONUSES = [
  {
    id: 'highScoring',
    name: 'High-Scoring Thriller Bonus',
    pts: 1,
    icon: '🔥',
    shortDesc: 'Actual & predicted goals both ≥ 4 + correct outcome',
    desc: 'Awarded when both total actual goals and total predicted goals are 4 or more, and you predicted the correct outcome.',
    example: 'Actual 3–1 (4 goals) | Predicted 3–1 (4 goals)'
  },
  {
    id: 'drawBonus',
    name: 'Exact Draw Premium',
    pts: 1,
    icon: '✨',
    shortDesc: 'Exact draw scoreline predicted',
    desc: 'Awarded when match ends in a draw and you predicted the exact draw scoreline (The Vishwaguru on a draw).',
    example: 'Actual 2–2 | Predicted 2–2 (Total: 6+1+1 = 8 pts)'
  }
];

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
export function getPredictionBreakdown(actH, actA, predH, predA) {
  const hasResult = actH !== null && actA !== null && actH !== undefined && actA !== undefined;
  const hasPred = predH !== null && predA !== null && predH !== undefined && predA !== undefined;

  if (!hasPred) {
    return {
      status: 'no_prediction',
      hasResult,
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
  const bonuses = [];

  if (res.highScoringBonus > 0) {
    bonuses.push({
      id: 'highScoring',
      name: 'High-Scoring Thriller',
      pts: 1,
      icon: '🔥',
      reason: `Both actual (${actH + actA}) and predicted (${predH + predA}) totals were ≥ 4 goals with correct outcome.`
    });
  }

  if (res.drawBonus > 0) {
    bonuses.push({
      id: 'drawBonus',
      name: 'Exact Draw Premium',
      pts: 1,
      icon: '✨',
      reason: `Match ended in a draw (${actH}–${actA}) and exact score was predicted.`
    });
  }

  // Explanation construction
  let explanation = '';
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

  const summaryLines = [
    { label: `${tierInfo.icon} ${tierInfo.name}`, pts: res.base, isBonus: false }
  ];

  for (const b of bonuses) {
    summaryLines.push({ label: `${b.icon} ${b.name}`, pts: b.pts, isBonus: true });
  }

  return {
    status: 'evaluated',
    hasResult: true,
    hasPred: true,
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

