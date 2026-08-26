// rulesExporter.js - Export scoring rules to PDF or high-res JPEG image

import { SCORING_TIERS, SCORING_BONUSES } from './scoring.js';

/**
 * Export rules as a professionally formatted PDF via print-ready document window.
 */
export function exportRulesToPdf() {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow popups to export the scoring rules as PDF.');
    return;
  }

  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const tiersHtml = SCORING_TIERS.map(t => {
    const isSvg = t.icon_type === 'svg' || (typeof t.icon === 'string' && t.icon.includes('.svg'));
    const iconHtml = isSvg
      ? `<img src="${window.location.origin}/${t.icon}" style="width:20px; height:20px; vertical-align:middle; object-fit:contain;" alt="" />`
      : `<span style="font-size:18px; line-height:1; vertical-align:middle;">${t.icon}</span>`;

    return `
      <tr>
        <td class="tier-cell">
          <span class="tier-badge p${t.pts}">Tier ${t.tier}</span>
        </td>
        <td class="icon-cell">${iconHtml}</td>
        <td class="name-cell">
          <strong>${escapeHtml(t.name)}</strong>
        </td>
        <td class="pts-cell">
          <span class="pts-pill p${t.pts}">${t.pts} ${t.pts === 1 ? 'pt' : 'pts'}</span>
        </td>
        <td class="desc-cell">
          <div class="rule-desc-text">${escapeHtml(t.short_desc || t.desc || '')}</div>
          ${t.desc && t.short_desc && t.desc !== t.short_desc ? `<div class="rule-sub-desc">${escapeHtml(t.desc)}</div>` : ''}
        </td>
        <td class="example-cell">
          ${t.example ? `<code class="example-code">${escapeHtml(t.example)}</code>` : '<span class="text-muted">—</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const bonusesHtml = SCORING_BONUSES.map(b => {
    const isSvg = b.icon_type === 'svg' || (typeof b.icon === 'string' && b.icon.includes('.svg'));
    const iconHtml = isSvg
      ? `<img src="${window.location.origin}/${b.icon}" style="width:20px; height:20px; vertical-align:middle; object-fit:contain;" alt="" />`
      : `<span style="font-size:18px; line-height:1; vertical-align:middle;">${b.icon}</span>`;

    return `
      <tr>
        <td class="icon-cell">${iconHtml}</td>
        <td class="name-cell">
          <strong>${escapeHtml(b.name)}</strong>
        </td>
        <td class="pts-cell">
          <span class="pts-pill p-bonus">+${b.pts} ${b.pts === 1 ? 'pt' : 'pts'}</span>
        </td>
        <td class="desc-cell">
          <div class="rule-desc-text">${escapeHtml(b.short_desc || b.desc || '')}</div>
          ${b.desc && b.short_desc && b.desc !== b.short_desc ? `<div class="rule-sub-desc">${escapeHtml(b.desc)}</div>` : ''}
        </td>
        <td class="example-cell">
          ${b.example ? `<code class="example-code">${escapeHtml(b.example)}</code>` : '<span class="text-muted">—</span>'}
        </td>
      </tr>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Premier League Score Predictor - Scoring Rules</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: #1e293b;
          background: #ffffff;
          padding: 10px 20px;
          line-height: 1.4;
          font-size: 13px;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 2.5px solid #37003c;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }
        .title-group h1 {
          font-family: 'Outfit', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: #37003c;
          letter-spacing: -0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .title-group p {
          color: #64748b;
          font-size: 12px;
          margin-top: 2px;
        }
        .date-badge {
          font-size: 11px;
          font-weight: 600;
          color: #37003c;
          background: #f1e6f5;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid #d4b0df;
        }
        .section-title {
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 18px 0 8px 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .rules-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 14px;
        }
        .rules-table th {
          background: #f8fafc;
          color: #475569;
          font-family: 'Outfit', sans-serif;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          text-align: left;
        }
        .rules-table td {
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          vertical-align: middle;
        }
        .rules-table tr:nth-child(even) td {
          background: #fafafa;
        }
        .tier-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          background: #e2e8f0;
          color: #334155;
          display: inline-block;
          white-space: nowrap;
        }
        .pts-pill {
          display: inline-block;
          font-weight: 800;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 12px;
          white-space: nowrap;
        }
        .pts-pill.p6 { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .pts-pill.p4 { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
        .pts-pill.p3 { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
        .pts-pill.p2 { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
        .pts-pill.p1 { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
        .pts-pill.p0 { background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; }
        .pts-pill.p-bonus { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }

        .icon-cell { text-align: center; width: 34px; }
        .tier-cell { width: 70px; }
        .pts-cell { width: 75px; text-align: center; }
        .name-cell { width: 140px; }
        .desc-cell { line-height: 1.35; }
        .rule-desc-text { font-size: 12px; font-weight: 500; color: #1e293b; }
        .rule-sub-desc { font-size: 11px; color: #64748b; margin-top: 2px; }
        .example-code {
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 11px;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          display: inline-block;
        }
        .footer-bar {
          margin-top: 24px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          color: #94a3b8;
          font-size: 10px;
        }
        .no-print-bar {
          background: #37003c;
          color: white;
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .btn-print {
          background: #00ff87;
          color: #37003c;
          border: none;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        @media print {
          .no-print-bar { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="no-print-bar">
        <span>📄 Scoring Rules Export &bull; Ready for PDF Print</span>
        <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
      </div>

      <div class="header-bar">
        <div class="title-group">
          <h1>⚽ Premier League Score Predictor</h1>
          <p>Official Scoring Engine Rules & Points Specification</p>
        </div>
        <div class="date-badge">📅 Effective: ${currentDate}</div>
      </div>

      <div class="section-title">🏆 Base Prediction Scoring Tiers</div>
      <table class="rules-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Icon</th>
            <th>Rule Name</th>
            <th>Points</th>
            <th>Scoring Criteria</th>
            <th>Example Scenario</th>
          </tr>
        </thead>
        <tbody>
          ${tiersHtml}
        </tbody>
      </table>

      ${SCORING_BONUSES.length > 0 ? `
        <div class="section-title">🔥 Additive Bonus Rules</div>
        <table class="rules-table">
          <thead>
            <tr>
              <th>Icon</th>
              <th>Bonus Name</th>
              <th>Bonus Pts</th>
              <th>Condition Criteria</th>
              <th>Example Scenario</th>
            </tr>
          </thead>
          <tbody>
            ${bonusesHtml}
          </tbody>
        </table>
      ` : ''}

      <div class="footer-bar">
        <span>Premier League Score Predictor &bull; Rules Engine</span>
        <span>Generated on ${currentDate} &bull; Save as PDF from print menu</span>
      </div>

      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.print();
          }, 400);
        });
      </script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

/**
 * Export rules as a high-resolution formatted JPEG image directly downloaded in browser.
 */
export async function exportRulesToJpeg() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // High-res retina scale (2x)
  const scale = 2;
  const width = 1000;

  // Calculate dynamic height based on tiers and bonuses
  const totalRows = SCORING_TIERS.length + SCORING_BONUSES.length;
  const height = Math.max(900, 240 + totalRows * 75);

  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#0e131f';
  ctx.fillRect(0, 0, width, height);

  // Gradient Top Bar
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#7c3aed');
  grad.addColorStop(0.5, '#00ff87');
  grad.addColorStop(1, '#06b6d4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 6);

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('⚽ Premier League Score Predictor', 36, 46);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Official Scoring Engine Rules & Points Specification', 36, 70);

  // Date pill
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect(width - 170, 28, 134, 30, 15);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`📅 ${dateStr}`, width - 156, 48);

  // Section: Base Tiers
  let y = 110;
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('🏆 BASE PREDICTION SCORING TIERS', 36, y);

  y += 18;

  // Draw Tiers
  for (let i = 0; i < SCORING_TIERS.length; i++) {
    const t = SCORING_TIERS[i];
    const cardY = y;
    const cardH = 64;

    // Card background
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.015)';
    ctx.beginPath();
    ctx.roundRect(36, cardY, width - 72, cardH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tier badge
    ctx.fillStyle = 'rgba(124, 58, 237, 0.25)';
    ctx.beginPath();
    ctx.roundRect(48, cardY + 16, 56, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`T${t.tier}`, 66, cardY + 36);

    // Icon (Text emoji or fallback symbol)
    const iconText = (t.icon && !t.icon.includes('/')) ? t.icon : '⚽';
    ctx.font = '22px sans-serif';
    ctx.fillText(iconText, 116, cardY + 40);

    // Name & Short Desc
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(t.name, 154, cardY + 28);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    const shortDesc = (t.short_desc || t.desc || '').slice(0, 52);
    ctx.fillText(shortDesc, 154, cardY + 48);

    // Points Pill
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(width - 240, cardY + 18, 64, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#064e3b';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${t.pts} Pts`, width - 230, cardY + 37);

    // Example chip
    if (t.example) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(width - 164, cardY + 18, 116, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(t.example.slice(0, 20), width - 158, cardY + 36);
    }

    y += cardH + 8;
  }

  // Section: Bonus Rules
  if (SCORING_BONUSES.length > 0) {
    y += 16;
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('🔥 ADDITIVE BONUS RULES', 36, y);

    y += 18;

    for (let i = 0; i < SCORING_BONUSES.length; i++) {
      const b = SCORING_BONUSES[i];
      const cardY = y;
      const cardH = 64;

      ctx.fillStyle = 'rgba(251, 191, 36, 0.04)';
      ctx.beginPath();
      ctx.roundRect(36, cardY, width - 72, cardH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const iconText = (b.icon && !b.icon.includes('/')) ? b.icon : '⭐';
      ctx.font = '22px sans-serif';
      ctx.fillText(iconText, 56, cardY + 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(b.name, 96, cardY + 28);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText((b.short_desc || b.desc || '').slice(0, 60), 96, cardY + 48);

      // Points pill
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(width - 240, cardY + 18, 64, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#451a03';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`+${b.pts} Pt`, width - 228, cardY + 37);

      if (b.example) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(width - 164, cardY + 18, 116, 28, 6);
        ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.font = '10px monospace';
        ctx.fillText(b.example.slice(0, 20), width - 158, cardY + 36);
      }

      y += cardH + 8;
    }
  }

  // Footer
  y = height - 26;
  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  ctx.fillText('Premier League Score Predictor • Generated scoring rules specification', 36, y);

  // Trigger Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'premier_league_scoring_rules.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.95);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
