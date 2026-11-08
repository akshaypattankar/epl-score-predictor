// server/heatmap_generator.js - Server-side SVG & PNG Heatmap Generator for ntfy alerts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { calculatePredictionPoints } from './notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for base64 encoded team crests to avoid reading from disk on every render
const crestBase64Cache = new Map();

/**
 * Get base64 Data URI for a team's crest PNG.
 */
export function getTeamCrestDataUri(teamCode) {
  if (!teamCode) return '';
  if (crestBase64Cache.has(teamCode)) {
    return crestBase64Cache.get(teamCode);
  }

  const candidateDirs = [
    path.join(__dirname, '../assets/team_crests/png_crests'),
    '/app/assets/team_crests/png_crests',
    path.resolve(process.cwd(), 'assets/team_crests/png_crests'),
    path.resolve(process.cwd(), '../assets/team_crests/png_crests'),
    path.resolve('/home/python/epl_score_predictor/assets/team_crests/png_crests')
  ];

  for (const dir of candidateDirs) {
    const file = path.join(dir, `${teamCode}.png`);
    if (fs.existsSync(file)) {
      try {
        const b64 = fs.readFileSync(file).toString('base64');
        const uri = `data:image/png;base64,${b64}`;
        crestBase64Cache.set(teamCode, uri);
        return uri;
      } catch (e) {
        // Continue
      }
    }
  }

  return '';
}

/**
 * Resolve font files and directories for @resvg/resvg-js
 */
function getAvailableFontFiles() {
  const candidateDirs = [
    path.join(__dirname, 'fonts'),
    '/app/fonts',
    path.resolve(process.cwd(), 'server/fonts'),
    path.resolve(process.cwd(), 'fonts'),
    '/usr/share/fonts/truetype/dejavu',
    '/usr/share/fonts/dejavu'
  ];

  const files = [];
  const dirs = [];
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      if (!dirs.includes(dir)) dirs.push(dir);
      const regular = path.join(dir, 'DejaVuSans.ttf');
      const bold = path.join(dir, 'DejaVuSans-Bold.ttf');
      if (fs.existsSync(regular) && !files.includes(regular)) files.push(regular);
      if (fs.existsSync(bold) && !files.includes(bold)) files.push(bold);
    }
  }
  return { files, dirs };
}

/**
 * Escape XML special characters for SVG text.
 */
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate SVG for a Match Heatmap (Kickoff Prediction Distribution or Full-Time Actual Score & Points).
 */
export function generateMatchHeatmapSvg({
  fixture,
  homeTeam,
  awayTeam,
  playersWithPreds = [],
  actualScore = null,
  leagueName = 'League',
  isFullTime = false
}) {
  const homeShort = escapeXml(homeTeam.short || 'H');
  const awayShort = escapeXml(awayTeam.short || 'A');
  const homeName = escapeXml(homeTeam.name || 'Home');
  const awayName = escapeXml(awayTeam.name || 'Away');
  const cleanLeague = escapeXml(leagueName || 'League');
  const gwStr = fixture?.event ? `Gameweek ${fixture.event}` : 'Premier League';

  const homeCrestUri = getTeamCrestDataUri(homeTeam.code || homeTeam.id);
  const awayCrestUri = getTeamCrestDataUri(awayTeam.code || awayTeam.id);

  const actH = actualScore ? Number(actualScore.home) : (fixture?.team_h_score !== null && fixture?.team_h_score !== undefined ? Number(fixture.team_h_score) : null);
  const actA = actualScore ? Number(actualScore.away) : (fixture?.team_a_score !== null && fixture?.team_a_score !== undefined ? Number(fixture.team_a_score) : null);
  const hasActual = actH !== null && actA !== null;

  // Compute maximum goals to determine grid size (minimum 0-5, up to 6)
  let maxGoal = 5;
  if (hasActual) {
    maxGoal = Math.max(maxGoal, actH, actA);
  }
  for (const p of playersWithPreds) {
    if (p.pred_h !== null && p.pred_h !== undefined && p.pred_h !== '') {
      maxGoal = Math.max(maxGoal, Number(p.pred_h), Number(p.pred_a));
    }
  }
  maxGoal = Math.min(6, Math.max(5, maxGoal)); // Cap at 6 (7x7) to ensure high readability on mobile

  const gridSize = maxGoal + 1; // 0 to maxGoal
  const cellWidth = Math.floor(460 / gridSize);
  const cellHeight = Math.floor(360 / gridSize);
  const gridStartX = 135;
  const gridStartY = 125;

  const totalWidth = 640;
  const totalHeight = gridStartY + (gridSize * cellHeight) + 60;

  // Map predictions to grid cells: cellPreds[`${h}_${a}`] = [{ name, pts, tierName, tierIcon }]
  const cellPreds = {};
  for (let h = 0; h <= maxGoal; h++) {
    for (let a = 0; a <= maxGoal; a++) {
      cellPreds[`${h}_${a}`] = [];
    }
  }

  for (const p of playersWithPreds) {
    if (p.pred_h !== null && p.pred_h !== undefined && p.pred_h !== '') {
      const ph = Number(p.pred_h);
      const pa = Number(p.pred_a);
      if (ph <= maxGoal && pa <= maxGoal) {
        let evalRes = null;
        if (hasActual) {
          evalRes = calculatePredictionPoints(actH, actA, ph, pa);
        }
        cellPreds[`${ph}_${pa}`].push({
          name: p.name || 'Player',
          pts: evalRes ? evalRes.total : 0,
          tierName: evalRes ? evalRes.tierName : '',
          tierIcon: evalRes ? evalRes.tierIcon : ''
        });
      }
    }
  }

  // Header Title & Tagline
  const modeTitle = isFullTime
    ? 'FINAL RESULT &amp; POINTS HEATMAP'
    : 'MATCH PREDICTIONS HEATMAP';
  const scorelineSub = hasActual && isFullTime
    ? `${homeName} ${actH} – ${actA} ${awayName} · ${cleanLeague}`
    : `${homeName} vs ${awayName} · ${cleanLeague}`;

  let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="100%" stop-color="#141c2e"/>
    </linearGradient>
  </defs>

  <!-- Background card -->
  <rect width="${totalWidth}" height="${totalHeight}" rx="16" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5"/>

  <!-- Top Title Bar -->
  <text x="${totalWidth / 2}" y="32" fill="#f8fafc" font-family="'DejaVu Sans', sans-serif" font-size="16" font-weight="800" text-anchor="middle">
    ${modeTitle}
  </text>
  <text x="${totalWidth / 2}" y="52" fill="#94a3b8" font-family="'DejaVu Sans', sans-serif" font-size="12" font-weight="500" text-anchor="middle">
    ${escapeXml(scorelineSub)} · ${escapeXml(gwStr)}
  </text>

  <!-- Home Team (Top Axis) Badge & Label -->
  <g transform="translate(${gridStartX + (gridSize * cellWidth) / 2}, 88)">
    ${homeCrestUri ? `<image href="${homeCrestUri}" x="-75" y="-18" width="24" height="24" />` : ''}
    <text x="${homeCrestUri ? '-44' : '0'}" y="0" fill="#38bdf8" font-family="'DejaVu Sans', sans-serif" font-size="13" font-weight="700" text-anchor="${homeCrestUri ? 'start' : 'middle'}">
      ${homeShort} (Home Goals) →
    </text>
  </g>

  <!-- Away Team (Left Axis) Crest (Upright) & Label -->
  <g transform="translate(35, ${gridStartY + (gridSize * cellHeight) / 2 - 80})">
    ${awayCrestUri ? `<image href="${awayCrestUri}" x="0" y="0" width="26" height="26" />` : ''}
  </g>
  <g transform="translate(48, ${gridStartY + (gridSize * cellHeight) / 2 + 35}) rotate(-90)">
    <text x="0" y="0" fill="#f43f5e" font-family="'DejaVu Sans', sans-serif" font-size="13" font-weight="700" text-anchor="middle">
      ${awayShort} (Away Goals) ←
    </text>
  </g>

  <!-- Column Headers (Home 0..maxGoal) -->
  <g transform="translate(${gridStartX}, ${gridStartY - 12})">
`;

  for (let h = 0; h <= maxGoal; h++) {
    const isActCol = hasActual && h === actH;
    const colFill = isActCol ? '#38bdf8' : '#64748b';
    const colFontWeight = isActCol ? '800' : '600';
    svg += `    <text x="${h * cellWidth + cellWidth / 2}" y="0" fill="${colFill}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="${colFontWeight}" text-anchor="middle">${h}</text>\n`;
  }

  svg += `  </g>\n\n  <!-- Grid Cells & Row Headers -->\n  <g transform="translate(${gridStartX}, ${gridStartY})">\n`;

  // Draw Grid Rows and Cells
  for (let a = 0; a <= maxGoal; a++) {
    const isActRow = hasActual && a === actA;
    const rowFill = isActRow ? '#f43f5e' : '#64748b';
    const rowFontWeight = isActRow ? '800' : '600';

    // Row Header (Away Goal a)
    svg += `    <text x="-16" y="${a * cellHeight + cellHeight / 2 + 5}" fill="${rowFill}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="${rowFontWeight}" text-anchor="middle">${a}</text>\n`;

    for (let h = 0; h <= maxGoal; h++) {
      const isActualCell = hasActual && h === actH && a === actA;
      const preds = cellPreds[`${h}_${a}`] || [];
      const count = preds.length;
      const x = h * cellWidth;
      const y = a * cellHeight;

      let cellFill = '#111827';
      let cellStroke = '#1e293b';
      let strokeWidth = '1';

      if (isFullTime && isActualCell) {
        // Actual Final Score Cell: High-contrast emerald border
        cellFill = count > 0 ? '#064e3b' : '#022c22';
        cellStroke = '#10b981';
        strokeWidth = '2.5';
      } else if (count > 0) {
        if (isFullTime) {
          // Tint based on highest points scored in this cell
          const maxPts = Math.max(...preds.map(p => p.pts));
          if (maxPts >= 10) {
            cellFill = '#4c1d95'; // Exact score purple
            cellStroke = '#8b5cf6';
          } else if (maxPts >= 7) {
            cellFill = '#0e7490'; // Outcome + GD cyan
            cellStroke = '#06b6d4';
          } else if (maxPts >= 5) {
            cellFill = '#1d4ed8'; // Blue
            cellStroke = '#3b82f6';
          } else if (maxPts >= 3) {
            cellFill = '#1e3a8a'; // Deep blue
            cellStroke = '#60a5fa';
          } else if (maxPts >= 1) {
            cellFill = '#78350f'; // Amber
            cellStroke = '#f59e0b';
          } else {
            cellFill = '#334155'; // Missed
            cellStroke = '#64748b';
          }
          strokeWidth = '1.5';
        } else {
          // Kickoff mode: prediction density gradient
          if (count >= 3) {
            cellFill = '#4338ca'; // Indigo
            cellStroke = '#818cf8';
          } else if (count === 2) {
            cellFill = '#0369a1'; // Sky blue
            cellStroke = '#38bdf8';
          } else {
            cellFill = '#1e3a5f'; // Slate blue
            cellStroke = '#0284c7';
          }
          strokeWidth = '1.5';
        }
      }

      svg += `    <rect x="${x + 2}" y="${y + 2}" width="${cellWidth - 4}" height="${cellHeight - 4}" rx="6" fill="${cellFill}" stroke="${cellStroke}" stroke-width="${strokeWidth}" />\n`;

      if (isFullTime && isActualCell) {
        // Target / Bullseye icon + "ACTUAL" text
        svg += `    <g transform="translate(${x + cellWidth / 2}, ${y + 14})">
      <circle cx="-25" cy="-3" r="4.5" fill="none" stroke="#34d399" stroke-width="1.5"/>
      <circle cx="-25" cy="-3" r="2" fill="#34d399"/>
      <text x="-16" y="0" fill="#34d399" font-family="'DejaVu Sans', sans-serif" font-size="9" font-weight="700" text-anchor="start">ACTUAL</text>
    </g>\n`;
      }

      if (count > 0) {
        const countY = (isFullTime && isActualCell) ? y + 32 : y + cellHeight / 2 - 3;
        const countFill = isActualCell ? '#34d399' : (count >= 2 ? '#ffffff' : '#38bdf8');
        svg += `    <text x="${x + cellWidth / 2}" y="${countY}" fill="${countFill}" font-family="'DejaVu Sans', sans-serif" font-size="${count >= 2 ? '15' : '14'}" font-weight="800" text-anchor="middle">${count}</text>\n`;

        // Format concise player text that fits without overflowing cell boundaries
        let displayText = '';
        if (count === 1) {
          const p = preds[0];
          const shortName = (p.name || '').split(' ')[0].slice(0, 7);
          displayText = (isFullTime && p.pts > 0) ? `${shortName} (+${p.pts})` : shortName;
          if (displayText.length > 12) displayText = displayText.slice(0, 11) + '…';
        } else if (count === 2) {
          const p1 = (preds[0].name || '').split(' ')[0].slice(0, 4);
          const p2 = (preds[1].name || '').split(' ')[0].slice(0, 4);
          displayText = `${p1}, ${p2}`;
        } else {
          const p1 = (preds[0].name || '').split(' ')[0].slice(0, 5);
          displayText = `${p1} +${count - 1}`;
        }

        const namesY = (isFullTime && isActualCell) ? y + 47 : y + cellHeight / 2 + 12;
        svg += `    <text x="${x + cellWidth / 2}" y="${namesY}" fill="#cbd5e1" font-family="'DejaVu Sans', sans-serif" font-size="9" font-weight="500" text-anchor="middle">${escapeXml(displayText)}</text>\n`;
      }
    }
  }

  svg += `  </g>\n\n  <!-- Bottom Legend -->\n`;

  const legendY = totalHeight - 20;
  if (isFullTime) {
    svg += `
  <g transform="translate(${totalWidth / 2}, ${legendY})">
    <rect x="-240" y="-12" width="12" height="12" rx="3" fill="#064e3b" stroke="#10b981" stroke-width="1.5"/>
    <text x="-222" y="-2" fill="#34d399" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="700">Actual Result</text>

    <rect x="-135" y="-12" width="12" height="12" rx="3" fill="#4c1d95" stroke="#8b5cf6" stroke-width="1.5"/>
    <text x="-117" y="-2" fill="#c084fc" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">Exact Score (10pts)</text>

    <rect x="25" y="-12" width="12" height="12" rx="3" fill="#0e7490" stroke="#06b6d4" stroke-width="1.5"/>
    <text x="43" y="-2" fill="#38bdf8" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">Outcome &amp; GD (7pts)</text>

    <rect x="180" y="-12" width="12" height="12" rx="3" fill="#1d4ed8" stroke="#3b82f6" stroke-width="1.5"/>
    <text x="198" y="-2" fill="#93c5fd" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">Other (+pts)</text>
  </g>
`;
  } else {
    svg += `
  <g transform="translate(${totalWidth / 2}, ${legendY})">
    <rect x="-170" y="-12" width="12" height="12" rx="3" fill="#1e3a5f" stroke="#0284c7" stroke-width="1.5"/>
    <text x="-152" y="-2" fill="#38bdf8" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">1 Prediction</text>

    <rect x="-40" y="-12" width="12" height="12" rx="3" fill="#0369a1" stroke="#38bdf8" stroke-width="1.5"/>
    <text x="-22" y="-2" fill="#7dd3fc" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">2 Predictions</text>

    <rect x="90" y="-12" width="12" height="12" rx="3" fill="#4338ca" stroke="#818cf8" stroke-width="1.5"/>
    <text x="108" y="-2" fill="#a5b4fc" font-family="'DejaVu Sans', sans-serif" font-size="10" font-weight="600">3+ Predictions</text>
  </g>
`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Render an SVG string into a high-DPI PNG Buffer using @resvg/resvg-js.
 */
export function renderHeatmapPng(svgString) {
  const { files, dirs } = getAvailableFontFiles();

  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: 640 },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 1,
    font: {
      loadSystemFonts: true,
      fontDirs: dirs.length > 0 ? dirs : undefined,
      fontFiles: files.length > 0 ? files : undefined,
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans'
    }
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * High-level helper: generate both SVG and PNG buffer for a match.
 */
export function generateMatchHeatmapPng(options) {
  const svg = generateMatchHeatmapSvg(options);
  const png = renderHeatmapPng(svg);
  return { svg, png };
}
