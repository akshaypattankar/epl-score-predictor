// rulesEditor.js - Modular Scoring Rules & Tiers Editor with Streamlined Freeform Input & Dynamic SVG Asset Support

import { SCORING_TIERS, SCORING_BONUSES, updateScoringRulesState } from './scoring.js';
import { apiUpdateScoringRules, apiResetScoringRules, apiFetchSvgAssets } from './api.js';

// Fallback known SVGs if API is unavailable
const FALLBACK_SVGS = [
  'assets/icons/oracle.svg',
  'assets/icons/manager.svg',
  'assets/icons/fan.svg',
  'assets/icons/pundit.svg',
  'assets/icons/lucky-guess.svg',
  'assets/icons/casual.svg',
];

// Internal editor state
let _editorRules = [];
let _activeCategoryTab = 'tiers'; // 'tiers' | 'bonuses' | 'all'
let _discoveredSvgs = [...FALLBACK_SVGS];
let _resetConfirmTimeout = null;
let _callbacks = {
  onRulesUpdated: null
};

/**
 * Universal icon renderer supporting text emojis and SVG image assets.
 * @param {string} icon - Emoji string or SVG file path
 * @param {string} iconType - 'emoji' | 'svg'
 * @param {number} size - Pixel size (width/height or font-size)
 * @param {string} extraClass - Additional CSS class
 */
export function renderIconElement(icon, iconType, size = 28, extraClass = '') {
  if (!icon) return '⚽';
  const isSvg = iconType === 'svg' || (typeof icon === 'string' && (icon.startsWith('assets/') || icon.endsWith('.svg') || icon.includes('.svg')));
  if (isSvg) {
    return `<img src="${icon}" width="${size}" height="${size}" alt="Icon" class="rule-icon-asset ${extraClass}" style="width:${size}px; height:${size}px; object-fit:contain; vertical-align:middle; display:inline-block;" />`;
  }
  return `<span class="rule-icon-emoji-char ${extraClass}" style="font-size:${size}px; line-height:1; vertical-align:middle; display:inline-block;">${icon}</span>`;
}

import { exportRulesToPdf, exportRulesToJpeg } from './rulesExporter.js';

/**
 * Initialize the scoring rules editor modal and bind global event listeners.
 * @param {Object} options
 * @param {Function} options.onRulesUpdated - Callback when rules are saved/updated
 */
export function initRulesEditorModal(options = {}) {
  _callbacks.onRulesUpdated = options.onRulesUpdated || null;

  // Bind trigger buttons
  document.getElementById('openScoringRulesEditorBtn')?.addEventListener('click', openRulesEditorModal);
  document.getElementById('mgmtOpenScoringRulesBtn')?.addEventListener('click', openRulesEditorModal);
  document.getElementById('closeScoringRulesModalBtn')?.addEventListener('click', closeRulesEditorModal);
  document.getElementById('cancelScoringRulesBtn')?.addEventListener('click', closeRulesEditorModal);
  document.getElementById('saveScoringRulesBtn')?.addEventListener('click', saveScoringRules);
  document.getElementById('resetScoringRulesBtn')?.addEventListener('click', resetScoringRules);
  document.getElementById('modalExportPdfBtn')?.addEventListener('click', exportRulesToPdf);
  document.getElementById('modalExportJpgBtn')?.addEventListener('click', exportRulesToJpeg);

  // Close on backdrop click
  document.getElementById('scoringRulesModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'scoringRulesModal') closeRulesEditorModal();
  });
}

/**
 * Open the scoring rules editor modal and initialize working state.
 */
export async function openRulesEditorModal() {
  const modal = document.getElementById('scoringRulesModal');
  if (!modal) return;

  // Fetch latest list of SVGs dynamically from assets folder
  try {
    const assets = await apiFetchSvgAssets();
    if (Array.isArray(assets) && assets.length > 0) {
      _discoveredSvgs = assets;
    }
  } catch (e) {
    // Keep fallback list
  }

  // Build clean snapshot clone from active state
  _editorRules = [
    ...SCORING_TIERS.map(t => ({
      rule_type: 'tier',
      id: String(t.tier),
      name: t.name || `Tier ${t.tier}`,
      pts: Number(t.pts ?? 0),
      icon: t.icon || '⚽',
      icon_type: t.icon_type === 'svg' || (t.icon && t.icon.includes('.svg')) ? 'svg' : 'emoji',
      badge_class: t.badgeClass || `p${t.pts}`,
      short_desc: t.shortDesc || '',
      desc: t.desc || '',
      example: t.example || '',
      condition_type: t.condition_type || null,
      min_goals: t.minGoals ?? null,
      min_goals_mode: t.minGoalsMode || 'BOTH',
      min_goals_enabled: Boolean(t.minGoalsEnabled),
      goal_diff: t.goalDiff ?? null,
      goal_diff_enabled: Boolean(t.goalDiffEnabled)
    })),
    ...SCORING_BONUSES.map(b => ({
      rule_type: 'bonus',
      id: String(b.id),
      name: b.name || 'Bonus Rule',
      pts: Number(b.pts ?? 1),
      icon: b.icon || '⭐',
      icon_type: b.icon_type === 'svg' || (b.icon && b.icon.includes('.svg')) ? 'svg' : 'emoji',
      badge_class: b.badgeClass || 'p-bonus',
      short_desc: b.shortDesc || '',
      desc: b.desc || '',
      example: b.example || '',
      condition_type: null,
      min_goals: b.minGoals ?? null,
      min_goals_mode: b.minGoalsMode || 'BOTH',
      min_goals_enabled: b.minGoalsEnabled != null ? Boolean(b.minGoalsEnabled) : (b.minGoals != null),
      goal_diff: b.goalDiff ?? null,
      goal_diff_enabled: Boolean(b.goalDiffEnabled)
    }))
  ];

  clearError();
  renderModalContent();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Close modal.
 */
export function closeRulesEditorModal() {
  const modal = document.getElementById('scoringRulesModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

/**
 * Render the whole modal inner markup.
 */
function renderModalContent() {
  const container = document.getElementById('scoringRulesEditorRoot');
  if (!container) return;

  const tiersCount = _editorRules.filter(r => r.rule_type === 'tier').length;
  const bonusesCount = _editorRules.filter(r => r.rule_type === 'bonus').length;

  container.innerHTML = `
    <!-- Top Filter Navigation Tabs & Add Actions -->
    <div class="rules-editor-header-bar">
      <div class="rules-editor-tabs">
        <button type="button" class="rules-tab-btn ${_activeCategoryTab === 'tiers' ? 'active' : ''}" data-tab="tiers">
          <span>🏆 Base Tiers</span>
          <span class="rules-tab-badge">${tiersCount}</span>
        </button>
        <button type="button" class="rules-tab-btn ${_activeCategoryTab === 'bonuses' ? 'active' : ''}" data-tab="bonuses">
          <span>🔥 Bonus Rules</span>
          <span class="rules-tab-badge">${bonusesCount}</span>
        </button>
        <button type="button" class="rules-tab-btn ${_activeCategoryTab === 'all' ? 'active' : ''}" data-tab="all">
          <span>📋 All Rules</span>
          <span class="rules-tab-badge">${tiersCount + bonusesCount}</span>
        </button>
      </div>

      <div class="rules-editor-quick-actions">
        <button type="button" class="btn btn-sm rules-add-btn" data-add-rule="tier">
          <span>➕</span> Add Tier
        </button>
        <button type="button" class="btn btn-sm rules-add-btn rules-add-bonus-btn" data-add-rule="bonus">
          <span>➕</span> Add Bonus
        </button>
      </div>
    </div>

    <!-- Rules List Cards Container -->
    <div class="rules-editor-cards-list" id="rulesEditorCardsList">
      ${renderRulesCardsHtml()}
    </div>
  `;

  attachEventHandlers();
}

/**
 * Render HTML for the cards based on active tab.
 */
function renderRulesCardsHtml() {
  let list = _editorRules;
  if (_activeCategoryTab === 'tiers') {
    list = _editorRules.filter(r => r.rule_type === 'tier');
  } else if (_activeCategoryTab === 'bonuses') {
    list = _editorRules.filter(r => r.rule_type === 'bonus');
  }

  if (list.length === 0) {
    return `
      <div class="rules-empty-state">
        <div style="font-size:2.5rem; margin-bottom:8px;">🔍</div>
        <p>No rules found in this category.</p>
        <button type="button" class="btn btn-sm btn-primary rules-add-btn" data-add-rule="${_activeCategoryTab === 'bonuses' ? 'bonus' : 'tier'}" style="margin-top:12px;">
          ➕ Add ${_activeCategoryTab === 'bonuses' ? 'Bonus Rule' : 'Tier'}
        </button>
      </div>
    `;
  }

  return list.map((rule, idx) => buildSingleRuleCard(rule, idx)).join('');
}

/**
 * Build HTML for a single rule card.
 */
function buildSingleRuleCard(rule, idx) {
  const isTier = rule.rule_type === 'tier';
  const isSvg = rule.icon_type === 'svg';
  const canRemove = !isTier || _editorRules.filter(r => r.rule_type === 'tier').length > 1;

  // Condition values
  const minGoalsEnabled = Boolean(rule.min_goals_enabled);
  const minGoalsMode = rule.min_goals_mode || 'BOTH';
  const minGoalsVal = rule.min_goals ?? 4;

  const goalDiffEnabled = Boolean(rule.goal_diff_enabled);
  const goalDiffVal = rule.goal_diff ?? 2;

  const badgeDisplay = isTier ? `${rule.pts} pts` : `+${rule.pts} pts`;
  const badgeClass = rule.badge_class || (isTier ? `p${rule.pts}` : 'p-bonus');

  return `
    <div class="rule-card-editor glass-card ${isTier ? `tier-card-theme tier-${rule.id}` : `bonus-card-theme bonus-${rule.id}`}" data-rule-type="${rule.rule_type}" data-rule-id="${rule.id}">
      
      <!-- Card Top Bar: Icon Badge, Title, Points, Type, Delete -->
      <div class="rule-card-top-bar">
        <div class="rule-card-identity">
          <div class="rule-card-icon-preview">
            ${renderIconElement(rule.icon, rule.icon_type, 32)}
          </div>
          <div class="rule-card-title-group">
            <span class="rule-type-pill ${isTier ? 'pill-tier' : 'pill-bonus'}">
              ${isTier ? `Tier ${rule.id}` : 'Additive Bonus'}
            </span>
            <input type="text" class="form-input rule-name-input rule-editor-field"
              data-field="name" value="${escapeHtml(rule.name || '')}"
              placeholder="Rule Name (e.g. The Vishwaguru)" maxlength="64" />
          </div>
        </div>

        <div class="rule-card-pts-stepper-box">
          <label class="rule-input-label">Points</label>
          <div class="rule-pts-stepper">
            <button type="button" class="rule-pts-step-btn" data-step="-1" title="Decrease points">−</button>
            <input type="number" class="form-input rule-pts-input rule-editor-field"
              data-field="pts" value="${rule.pts ?? 0}" min="0" max="99" />
            <button type="button" class="rule-pts-step-btn" data-step="1" title="Increase points">+</button>
          </div>
        </div>

        <div class="rule-card-badge-preview">
          <label class="rule-input-label">Badge</label>
          <span class="pts-badge ${badgeClass} rule-live-badge">${badgeDisplay}</span>
        </div>

        <div class="rule-card-actions">
          <button type="button" class="btn-icon rule-remove-btn" data-remove-type="${rule.rule_type}" data-remove-id="${rule.id}"
            title="${canRemove ? 'Delete this rule' : 'At least one tier is required'}" ${!canRemove ? 'disabled' : ''}>
            🗑️
          </button>
        </div>
      </div>

      <!-- Icon Section: Segmented Switch + Freeform Direct Input -->
      <div class="rule-card-icon-section">
        <div class="rule-icon-switcher-header">
          <span class="rule-section-label">🎨 Rule Icon</span>
          
          <div class="icon-type-segmented-control">
            <button type="button" class="icon-segment-btn ${!isSvg ? 'active' : ''}" data-icon-type="emoji">
              <span>😊</span> Text Emoji
            </button>
            <button type="button" class="icon-segment-btn ${isSvg ? 'active' : ''}" data-icon-type="svg">
              <span>🖼️</span> SVG Asset
            </button>
          </div>
        </div>

        ${!isSvg ? `
          <!-- Freeform Emoji / Text Symbol Input -->
          <div class="emoji-freeform-container">
            <div class="emoji-input-with-preview">
              <div class="emoji-preview-avatar">
                ${renderIconElement(rule.icon, 'emoji', 36)}
              </div>
              <div style="flex:1;">
                <label class="rule-input-label">Type or Paste Any Emoji / Symbol:</label>
                <input type="text" class="form-input emoji-direct-input rule-editor-field"
                  data-field="icon" value="${escapeHtml(rule.icon || '⚽')}"
                  placeholder="Enter any emoji (e.g. 🔮, ⚽, 👑, 🥇, 🎯)..." maxlength="16" />
              </div>
            </div>
          </div>
        ` : `
          <!-- SVG Asset Path Input with File Chips -->
          <div class="svg-freeform-container">
            <div class="svg-input-with-preview">
              <div class="svg-preview-avatar">
                ${renderIconElement(rule.icon, 'svg', 36)}
              </div>
              <div style="flex:1; min-width:0;">
                <label class="rule-input-label">SVG File Path (in project assets folder):</label>
                <input type="text" class="form-input svg-path-direct-input rule-editor-field"
                  data-field="icon" value="${escapeHtml(rule.icon || 'assets/icons/oracle.svg')}"
                  placeholder="e.g. assets/icons/my_icon.svg" />
              </div>
            </div>

            <!-- Detected SVGs in folder as simple file chips -->
            <div class="svg-detected-files-box">
              <span class="svg-detected-label">Available SVG files:</span>
              <div class="svg-file-chips-grid">
                ${_discoveredSvgs.map(filePath => {
                  const fileName = filePath.split('/').pop();
                  const isSelected = rule.icon === filePath;
                  return `
                    <button type="button" class="svg-file-chip ${isSelected ? 'selected' : ''}" data-svg-path="${filePath}" title="${filePath}">
                      <img src="${filePath}" alt="" width="18" height="18" style="vertical-align:middle;" />
                      <span>${fileName}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `}
      </div>

      <!-- Condition Rules (Toggles & Thresholds) -->
      <div class="rule-card-conditions-section">
        <span class="rule-section-label">⚙️ Condition Criteria</span>
        <div class="rule-conditions-grid">
          
          <!-- Min Goals Condition -->
          <div class="rule-condition-box ${minGoalsEnabled ? 'enabled' : ''}">
            <div class="condition-box-header">
              <label class="condition-toggle-label">
                <input type="checkbox" class="rule-editor-field" data-field="min_goals_enabled" ${minGoalsEnabled ? 'checked' : ''} />
                <span>⚽ Match Goals Threshold</span>
              </label>
              <span class="condition-status-pill ${minGoalsEnabled ? 'on' : 'off'}">${minGoalsEnabled ? 'Active' : 'Disabled'}</span>
            </div>
            ${minGoalsEnabled ? `
              <div class="condition-controls-row">
                <select class="control-dropdown rule-editor-field" data-field="min_goals_mode">
                  <option value="BOTH" ${minGoalsMode === 'BOTH' ? 'selected' : ''}>Match Total (Both Teams)</option>
                  <option value="EITHER" ${minGoalsMode === 'EITHER' ? 'selected' : ''}>Either Team Alone</option>
                  <option value="HOME" ${minGoalsMode === 'HOME' ? 'selected' : ''}>Home Team Goals</option>
                  <option value="AWAY" ${minGoalsMode === 'AWAY' ? 'selected' : ''}>Away Team Goals</option>
                </select>
                <div class="condition-value-stepper">
                  <span class="condition-math-symbol">≥</span>
                  <input type="number" class="form-input condition-number-input rule-editor-field"
                    data-field="min_goals" value="${minGoalsVal}" min="1" max="20" />
                  <span class="condition-unit">goals</span>
                </div>
              </div>
            ` : `<div class="condition-disabled-note">No minimum goals requirement</div>`}
          </div>

          <!-- Goal Difference Condition -->
          <div class="rule-condition-box ${goalDiffEnabled ? 'enabled' : ''}">
            <div class="condition-box-header">
              <label class="condition-toggle-label">
                <input type="checkbox" class="rule-editor-field" data-field="goal_diff_enabled" ${goalDiffEnabled ? 'checked' : ''} />
                <span>🎯 Goal Difference Margin</span>
              </label>
              <span class="condition-status-pill ${goalDiffEnabled ? 'on' : 'off'}">${goalDiffEnabled ? 'Active' : 'Disabled'}</span>
            </div>
            ${goalDiffEnabled ? `
              <div class="condition-controls-row">
                <span class="condition-label-text">Winning Margin</span>
                <div class="condition-value-stepper">
                  <span class="condition-math-symbol">≥</span>
                  <input type="number" class="form-input condition-number-input rule-editor-field"
                    data-field="goal_diff" value="${goalDiffVal}" min="1" max="15" />
                  <span class="condition-unit">goals</span>
                </div>
              </div>
            ` : `<div class="condition-disabled-note">No goal margin requirement</div>`}
          </div>

        </div>
      </div>

      <!-- Explanations & Examples Section -->
      <div class="rule-card-descriptions-section">
        <span class="rule-section-label">📝 Description & Example</span>
        
        <div class="descriptions-input-grid">
          <div class="desc-field-group">
            <label class="rule-input-label">Short Summary (Tooltip / Chip)</label>
            <input type="text" class="form-input rule-editor-field" data-field="short_desc"
              value="${escapeHtml(rule.short_desc || '')}"
              placeholder="e.g. Exact scoreline predicted" maxlength="120" />
          </div>

          <div class="desc-field-group">
            <label class="rule-input-label">Full Explanation</label>
            <input type="text" class="form-input rule-editor-field" data-field="desc"
              value="${escapeHtml(rule.desc || '')}"
              placeholder="e.g. Awarded when you predict the exact score for both teams." maxlength="300" />
          </div>

          <div class="desc-field-group full-width">
            <label class="rule-input-label">Example Scenario <span class="input-hint">(Format: Actual X–Y | Predicted X–Y)</span></label>
            <input type="text" class="form-input rule-editor-field" data-field="example"
              value="${escapeHtml(rule.example || '')}"
              placeholder="Actual 3–1 | Predicted 3–1" maxlength="140" />
          </div>
        </div>
      </div>

      <!-- Live Preview Container inside Card -->
      <div class="rule-card-preview-section">
        <div class="preview-section-header">
          <span class="preview-tag">👁️ Live Display Preview</span>
        </div>
        <div class="preview-cards-wrapper">
          <div class="scoring-rule-card ${isTier ? `tier-${rule.id}` : 'bonus-1'}" style="padding:12px; max-width:280px; margin:0 auto; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm);">
            <div class="rule-icon">${renderIconElement(rule.icon, rule.icon_type, 32)}</div>
            <div class="rule-title">${escapeHtml(rule.name || 'Rule Title')}</div>
            <div class="rule-pts">${isTier ? `${rule.pts} Pts` : `+${rule.pts} Pts`}</div>
            <p class="rule-desc" style="font-size:0.78rem;">${escapeHtml(rule.short_desc || rule.desc || 'Condition description goes here.')}</p>
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Attach all interactive event handlers in the modal.
 */
function attachEventHandlers() {
  const root = document.getElementById('scoringRulesEditorRoot');
  if (!root) return;

  // Category Tab Switching
  root.querySelectorAll('.rules-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeCategoryTab = btn.dataset.tab;
      renderModalContent();
    });
  });

  // Add Rule Buttons
  root.querySelectorAll('.rules-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.addRule;
      addNewRule(type);
    });
  });

  // Remove Rule Buttons
  root.querySelectorAll('.rule-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.rule-card-editor');
      if (!card) return;
      const { ruleType, ruleId } = card.dataset;
      removeRule(ruleType, ruleId);
    });
  });

  // Points Stepper Buttons (+ / -)
  root.querySelectorAll('.rule-pts-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.rule-card-editor');
      if (!card) return;
      const { ruleType, ruleId } = card.dataset;
      const rule = findRule(ruleType, ruleId);
      if (!rule) return;

      const step = parseInt(btn.dataset.step, 10) || 0;
      const currentPts = Number(rule.pts || 0);
      const newPts = Math.max(0, Math.min(99, currentPts + step));
      rule.pts = newPts;
      if (rule.rule_type === 'tier') {
        rule.badge_class = `p${newPts}`;
      }

      // Update inputs and badges in-place
      const ptsInput = card.querySelector('.rule-pts-input');
      if (ptsInput) ptsInput.value = newPts;
      const liveBadge = card.querySelector('.rule-live-badge');
      if (liveBadge) {
        liveBadge.textContent = rule.rule_type === 'tier' ? `${newPts} pts` : `+${newPts} pts`;
        liveBadge.className = `pts-badge ${rule.badge_class || (rule.rule_type === 'tier' ? `p${newPts}` : 'p-bonus')} rule-live-badge`;
      }
      const previewPts = card.querySelector('.preview-cards-wrapper .rule-pts');
      if (previewPts) {
        previewPts.textContent = rule.rule_type === 'tier' ? `${newPts} Pts` : `+${newPts} Pts`;
      }
    });
  });

  // Icon Type Segmented Control (Emoji vs SVG)
  root.querySelectorAll('.icon-segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.rule-card-editor');
      if (!card) return;
      const { ruleType, ruleId } = card.dataset;
      const rule = findRule(ruleType, ruleId);
      if (!rule) return;

      const targetType = btn.dataset.iconType; // 'emoji' | 'svg'
      if (rule.icon_type === targetType) return;

      rule.icon_type = targetType;

      // Cleanly transition icon value
      if (targetType === 'emoji') {
        // If current icon was an SVG path, assign a default emoji
        if (!rule.icon || rule.icon.includes('/') || rule.icon.includes('.svg')) {
          rule.icon = rule.rule_type === 'tier' ? '🔮' : '⭐';
        }
      } else {
        // If current icon was an emoji, assign the first available SVG asset path
        if (!rule.icon || !rule.icon.includes('.svg')) {
          rule.icon = _discoveredSvgs[0] || 'assets/icons/oracle.svg';
        }
      }

      renderModalContent();
    });
  });

  // SVG File Quick-Select Chips
  root.querySelectorAll('.svg-file-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const card = chip.closest('.rule-card-editor');
      if (!card) return;
      const { ruleType, ruleId } = card.dataset;
      const rule = findRule(ruleType, ruleId);
      if (!rule) return;

      const selectedPath = chip.dataset.svgPath;
      rule.icon = selectedPath;
      rule.icon_type = 'svg';

      renderModalContent();
    });
  });

  // Input Field Changes
  root.querySelectorAll('.rule-editor-field').forEach(input => {
    const handler = (e) => {
      const card = input.closest('.rule-card-editor');
      if (!card) return;
      const { ruleType, ruleId } = card.dataset;
      const rule = findRule(ruleType, ruleId);
      if (!rule) return;

      const field = input.dataset.field;
      let val;

      if (input.type === 'checkbox') {
        val = input.checked;
      } else if (input.type === 'number') {
        val = input.value === '' ? null : (parseInt(input.value, 10) || 0);
      } else {
        val = input.value;
      }

      rule[field] = val;

      // Re-render if structural condition toggles change
      if (field === 'min_goals_enabled' || field === 'goal_diff_enabled') {
        renderModalContent();
        return;
      }

      // Live update preview elements
      if (field === 'name') {
        const titleEl = card.querySelector('.preview-cards-wrapper .rule-title');
        if (titleEl) titleEl.textContent = val || 'Rule Title';
      }
      if (field === 'pts') {
        if (rule.rule_type === 'tier') rule.badge_class = `p${val}`;
        const liveBadge = card.querySelector('.rule-live-badge');
        if (liveBadge) {
          liveBadge.textContent = rule.rule_type === 'tier' ? `${val} pts` : `+${val} pts`;
          liveBadge.className = `pts-badge ${rule.badge_class || (rule.rule_type === 'tier' ? `p${val}` : 'p-bonus')} rule-live-badge`;
        }
        const previewPts = card.querySelector('.preview-cards-wrapper .rule-pts');
        if (previewPts) {
          previewPts.textContent = rule.rule_type === 'tier' ? `${val} Pts` : `+${val} Pts`;
        }
      }
      if (field === 'short_desc' || field === 'desc') {
        const previewDesc = card.querySelector('.preview-cards-wrapper .rule-desc');
        if (previewDesc) {
          previewDesc.textContent = rule.short_desc || rule.desc || 'Condition description goes here.';
        }
      }
      if (field === 'icon') {
        const iconBox = card.querySelector('.rule-card-icon-preview');
        if (iconBox) iconBox.innerHTML = renderIconElement(val, rule.icon_type, 32);
        
        const avatarBox = card.querySelector('.emoji-preview-avatar, .svg-preview-avatar');
        if (avatarBox) avatarBox.innerHTML = renderIconElement(val, rule.icon_type, 36);

        const previewIcon = card.querySelector('.preview-cards-wrapper .rule-icon');
        if (previewIcon) previewIcon.innerHTML = renderIconElement(val, rule.icon_type, 32);
      }
    };

    input.addEventListener('input', handler);
    if (input.tagName === 'SELECT' || input.type === 'checkbox') {
      input.addEventListener('change', handler);
    }
  });
}

/**
 * Add a new tier or bonus rule.
 */
function addNewRule(ruleType) {
  clearError();

  if (ruleType === 'tier') {
    const existingTiers = _editorRules.filter(r => r.rule_type === 'tier');
    const newId = String(existingTiers.length + 1);

    _editorRules.push({
      rule_type: 'tier',
      id: newId,
      name: `New Tier ${newId}`,
      pts: Math.max(0, (existingTiers[existingTiers.length - 1]?.pts || 1) - 1),
      icon: '⚽',
      icon_type: 'emoji',
      badge_class: `p${Math.max(0, (existingTiers[existingTiers.length - 1]?.pts || 1) - 1)}`,
      short_desc: '',
      desc: '',
      example: '',
      condition_type: 'miss',
      min_goals: null,
      min_goals_mode: 'BOTH',
      min_goals_enabled: false,
      goal_diff: null,
      goal_diff_enabled: false
    });
    _activeCategoryTab = 'tiers';
  } else {
    const newId = `bonus_${Date.now()}`;
    _editorRules.push({
      rule_type: 'bonus',
      id: newId,
      name: 'New Bonus Rule',
      pts: 1,
      icon: '⭐',
      icon_type: 'emoji',
      badge_class: 'p-bonus',
      short_desc: '',
      desc: '',
      example: '',
      condition_type: null,
      min_goals: null,
      min_goals_mode: 'BOTH',
      min_goals_enabled: false,
      goal_diff: null,
      goal_diff_enabled: false
    });
    _activeCategoryTab = 'bonuses';
  }

  renderModalContent();

  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('.rule-card-editor');
    const lastCard = cards[cards.length - 1];
    if (lastCard) lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/**
 * Remove a rule.
 */
function removeRule(ruleType, ruleId) {
  clearError();
  const tiers = _editorRules.filter(r => r.rule_type === 'tier');
  if (ruleType === 'tier' && tiers.length <= 1) {
    showError('You must maintain at least one scoring tier.');
    return;
  }

  _editorRules = _editorRules.filter(
    r => !(r.rule_type === ruleType && String(r.id) === String(ruleId))
  );

  // Renumber tiers sequentially
  let tierIdx = 1;
  _editorRules = _editorRules.map(r => {
    if (r.rule_type !== 'tier') return r;
    return { ...r, id: String(tierIdx++) };
  });

  renderModalContent();
}

/**
 * Find rule in editor working copy.
 */
function findRule(ruleType, ruleId) {
  return _editorRules.find(r => r.rule_type === ruleType && String(r.id) === String(ruleId));
}

/**
 * Save scoring rules to backend API and update state.
 */
export async function saveScoringRules() {
  clearError();
  if (!_editorRules.length) return;

  const tiers = _editorRules.filter(r => r.rule_type === 'tier');
  if (tiers.length === 0) {
    showError('You must have at least one scoring tier.');
    return;
  }

  // Validate rules
  for (const r of _editorRules) {
    const label = r.name?.trim() || `${r.rule_type} ${r.id}`;
    if (!r.name || !r.name.trim()) {
      showError(`"${label}" must have a rule name.`);
      return;
    }
    if (typeof r.pts !== 'number' || r.pts < 0) {
      showError(`"${label}" must have a valid points value (≥ 0).`);
      return;
    }
    if (!r.icon || !r.icon.trim()) {
      showError(`"${label}" must have an icon or emoji.`);
      return;
    }
  }

  const saveBtn = document.getElementById('saveScoringRulesBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Saving Rules…';
  }

  try {
    const result = await apiUpdateScoringRules(_editorRules);
    if (result && result.rules) {
      updateScoringRulesState(result.rules);
    }
    closeRulesEditorModal();

    if (typeof _callbacks.onRulesUpdated === 'function') {
      _callbacks.onRulesUpdated(result?.rules || _editorRules);
    }
  } catch (err) {
    showError(err.message || 'Failed to save scoring rules.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save Scoring Rules';
    }
  }
}

/**
 * Reset scoring rules to factory defaults with intuitive two-step confirmation.
 */
export async function resetScoringRules() {
  const resetBtn = document.getElementById('resetScoringRulesBtn');
  if (!resetBtn) return;

  // First click: Request confirmation on the button
  if (!resetBtn.dataset.confirming) {
    resetBtn.dataset.confirming = 'true';
    resetBtn.innerHTML = '⚠️ Click again to confirm reset';
    resetBtn.style.background = 'rgba(239,68,68,0.3)';
    resetBtn.style.color = '#ffffff';

    if (_resetConfirmTimeout) clearTimeout(_resetConfirmTimeout);
    _resetConfirmTimeout = setTimeout(() => {
      resetBtn.removeAttribute('data-confirming');
      resetBtn.innerHTML = '🔄 Reset to Default Rules';
      resetBtn.style.background = 'rgba(239,68,68,0.12)';
      resetBtn.style.color = '#f87171';
    }, 4500);
    return;
  }

  // Second click: Proceed with reset
  if (_resetConfirmTimeout) clearTimeout(_resetConfirmTimeout);
  resetBtn.removeAttribute('data-confirming');
  resetBtn.disabled = true;
  resetBtn.innerHTML = '⏳ Resetting…';

  try {
    const result = await apiResetScoringRules();
    if (result && result.rules) {
      updateScoringRulesState(result.rules);
    }
    closeRulesEditorModal();

    if (typeof _callbacks.onRulesUpdated === 'function') {
      _callbacks.onRulesUpdated(result?.rules);
    }
  } catch (err) {
    showError(err.message || 'Failed to reset scoring rules.');
  } finally {
    resetBtn.disabled = false;
    resetBtn.innerHTML = '🔄 Reset to Default Rules';
    resetBtn.style.background = 'rgba(239,68,68,0.12)';
    resetBtn.style.color = '#f87171';
  }
}

function showError(msg) {
  const errEl = document.getElementById('scoringRulesSaveError');
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function clearError() {
  const errEl = document.getElementById('scoringRulesSaveError');
  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }
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
