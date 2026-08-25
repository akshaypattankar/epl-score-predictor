// tierIcons.js - Tier titles, inline SVG icon helpers, and Arsenal fan theme variants

export const TIER_TITLES = {
  1: 'The Vishwaguru',
  2: 'The Manager',
  3: 'The Fan',
  4: 'The Pundit',
  5: 'The Casual',
  6: 'The Infantino'
};

export const TIER_ORIGINAL_NAMES = {
  1: 'Bullseye',
  2: 'Outcome + GD',
  3: 'Outcome + Single Team',
  4: 'Outcome Only',
  5: 'Goals Only',
  6: 'Complete Miss'
};

export const TIER_EMOJIS = {
  1: '🔮',
  2: '📋',
  3: '🎙️',
  4: '📣',
  5: '🎲',
  6: '🛋️'
};

// Generic Minimalist Theme SVGs (Backup Set)
export const TIER_SVGS_GENERIC = {
  1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-1">
  <circle cx="24" cy="22" r="14" fill="#1E1B4B" stroke="#A78BFA" stroke-width="2.5" />
  <path d="M 17 13 A 11 11 0 0 1 31 27" fill="none" stroke="#C084FC" stroke-width="2" stroke-linecap="round" opacity="0.6" />
  <path d="M 24 14 L 25.5 19.5 L 31 21 L 25.5 22.5 L 24 28 L 22.5 22.5 L 17 21 L 22.5 19.5 Z" fill="#FBBF24" />
  <circle cx="24" cy="21" r="1.5" fill="#FFFFFF" />
  <path d="M 14 38 C 17 34, 31 34, 34 38 L 36 41 L 12 41 Z" fill="#312E81" stroke="#A78BFA" stroke-width="2" stroke-linejoin="round" />
  <line x1="16" y1="36" x2="32" y2="36" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" />
</svg>`,

  2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-2">
  <rect x="10" y="8" width="28" height="34" rx="4" fill="#0F172A" stroke="#38BDF8" stroke-width="2.5" />
  <rect x="18" y="5" width="12" height="5" rx="2" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
  <circle cx="24" cy="7.5" r="1" fill="#38BDF8" />
  <line x1="15" y1="24" x2="33" y2="24" stroke="#334155" stroke-width="1.5" stroke-dasharray="3 2" />
  <path d="M 16 16 L 20 20 M 20 16 L 16 20" stroke="#34D399" stroke-width="2.2" stroke-linecap="round" />
  <circle cx="30" cy="18" r="2.5" fill="none" stroke="#FBBF24" stroke-width="2.2" />
  <path d="M 18 28 Q 24 33, 29 27" fill="none" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 2" />
  <path d="M 27 24 L 30 27 L 26 29" fill="none" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`,

  3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-3">
  <path d="M 8 20 A 14 14 0 0 0 8 28" fill="none" stroke="#34D399" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 40 20 A 14 14 0 0 1 40 28" fill="none" stroke="#34D399" stroke-width="2.5" stroke-linecap="round" />
  <rect x="18" y="7" width="12" height="18" rx="6" fill="#0F172A" stroke="#34D399" stroke-width="2.5" />
  <line x1="18" y1="16" x2="30" y2="16" stroke="#34D399" stroke-width="1.5" opacity="0.8" />
  <path d="M 13 18 V 24 A 11 11 0 0 0 35 24 V 18" fill="none" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" />
  <line x1="24" y1="35" x2="24" y2="41" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" />
  <line x1="16" y1="41" x2="32" y2="41" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="24" cy="11" r="2" fill="#EF4444" />
</svg>`,

  4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-4">
  <path d="M 12 21 L 28 13 V 33 L 12 25 Z" fill="#0F172A" stroke="#60A5FA" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M 16 23 V 33 C 16 35, 19 35, 19 33 V 24.5" fill="none" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 33 16 A 12 12 0 0 1 33 30" fill="none" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 38 12 A 18 18 0 0 1 38 34" fill="none" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
  <rect x="8" y="20" width="4" height="6" rx="1.5" fill="#60A5FA" />
</svg>`,

  5: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-5">
  <rect x="8" y="18" width="20" height="20" rx="4" fill="#0F172A" stroke="#94A3B8" stroke-width="2.5" transform="rotate(-8 18 28)" />
  <g transform="rotate(-8 18 28)">
    <circle cx="12" cy="22" r="1.5" fill="#A78BFA" />
    <circle cx="24" cy="22" r="1.5" fill="#A78BFA" />
    <circle cx="18" cy="28" r="1.5" fill="#A78BFA" />
    <circle cx="12" cy="34" r="1.5" fill="#A78BFA" />
    <circle cx="24" cy="34" r="1.5" fill="#A78BFA" />
  </g>
  <rect x="22" y="10" width="18" height="18" rx="3.5" fill="#1E293B" stroke="#A78BFA" stroke-width="2.5" transform="rotate(14 31 19)" />
  <g transform="rotate(14 31 19)">
    <circle cx="26" cy="14" r="1.4" fill="#FFFFFF" />
    <circle cx="31" cy="19" r="1.4" fill="#FFFFFF" />
    <circle cx="36" cy="24" r="1.4" fill="#FFFFFF" />
  </g>
  <path d="M 12 8 L 13 11 L 16 12 L 13 13 L 12 16 L 11 13 L 8 12 L 11 11 Z" fill="#FBBF24" />
</svg>`,

  6: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-6">
  <rect x="10" y="22" width="28" height="14" rx="4" fill="#0F172A" stroke="#64748B" stroke-width="2.5" />
  <path d="M 13 14 C 13 11.5, 15 10, 17.5 10 L 30.5 10 C 33 10, 35 11.5, 35 14 V 22 H 13 Z" fill="#1E293B" stroke="#64748B" stroke-width="2.5" stroke-linejoin="round" />
  <rect x="6" y="18" width="7" height="18" rx="3" fill="#0F172A" stroke="#F43F5E" stroke-width="2" />
  <rect x="35" y="18" width="7" height="18" rx="3" fill="#0F172A" stroke="#F43F5E" stroke-width="2" />
  <line x1="12" y1="36" x2="10" y2="42" stroke="#64748B" stroke-width="2.5" stroke-linecap="round" />
  <line x1="36" y1="36" x2="38" y2="42" stroke="#64748B" stroke-width="2.5" stroke-linecap="round" />
  <path d="M 33 7 L 38 7 L 33 11 L 38 11" stroke="#F43F5E" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.85" />
</svg>`
};

// Arsenal Fan Special Custom Theme SVGs
export const TIER_SVGS_ARSENAL = {
  1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-1">
  <!-- Arsène Wenger - "Le Professeur" (The Oracle) -->
  <path d="M 24 4 L 25.5 8.5 L 30 9 L 26.5 12 L 27.5 16.5 L 24 14 L 20.5 16.5 L 21.5 12 L 18 9 L 22.5 8.5 Z" fill="#FBBF24" />
  <path d="M 16 23 C 16 16, 20 12, 24 12 C 28 12, 32 16, 32 23 C 32 26, 30 29, 29 31 L 19 31 C 18 29, 16 26, 16 23 Z" fill="#1E293B" stroke="#EF0107" stroke-width="2" />
  <path d="M 16 22 C 16 15, 20 12, 24 12 C 28 12, 32 15, 32 22 C 30 18, 26 15, 24 15 C 22 15, 18 18, 16 22 Z" fill="#E2E8F0" />
  <rect x="18" y="21" width="5" height="4" rx="1" fill="none" stroke="#FBBF24" stroke-width="1.8" />
  <rect x="25" y="21" width="5" height="4" rx="1" fill="none" stroke="#FBBF24" stroke-width="1.8" />
  <line x1="23" y1="23" x2="25" y2="23" stroke="#FBBF24" stroke-width="1.8" />
  <line x1="16" y1="23" x2="18" y2="23" stroke="#FBBF24" stroke-width="1.5" />
  <line x1="30" y1="23" x2="32" y2="23" stroke="#FBBF24" stroke-width="1.5" />
  <path d="M 13 44 C 13 36, 17 32, 24 32 C 31 32, 35 36, 35 44 Z" fill="#0F172A" stroke="#EF0107" stroke-width="2" />
  <path d="M 22 32 L 26 32 L 25 41 L 24 43 L 23 41 Z" fill="#EF0107" stroke="#FFFFFF" stroke-width="0.8" />
</svg>`,

  2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-2">
  <!-- Mikel Arteta - The Manager -->
  <path d="M 15 22 C 15 14, 19 10, 24 10 C 29 10, 33 14, 33 22 C 33 26, 30 29, 29 31 L 19 31 C 18 29, 15 26, 15 22 Z" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
  <path d="M 15 20 C 15 12, 19 9, 24 9 C 29 9, 33 12, 33 20 C 31 16, 27 12, 24 12 C 21 12, 17 16, 15 20 Z" fill="#090D16" stroke="#38BDF8" stroke-width="1" />
  <path d="M 11 44 C 11 35, 16 31, 24 31 C 32 31, 37 35, 37 44 Z" fill="#0F172A" stroke="#38BDF8" stroke-width="2" />
  <path d="M 22 31 L 26 31 L 25 41 L 24 43 L 23 41 Z" fill="#EF0107" />
  <circle cx="36" cy="18" r="7" fill="#0F172A" stroke="#FBBF24" stroke-width="1.8" />
  <path d="M 32 20 H 38 M 38 20 L 36 17 M 38 20 L 36 23" stroke="#FBBF24" stroke-width="1.8" stroke-linecap="round" />
</svg>`,

  3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-3">
  <!-- Ian Wright / Wrighty - The Pundit -->
  <rect x="18" y="6" width="12" height="16" rx="6" fill="#0F172A" stroke="#34D399" stroke-width="2.2" />
  <line x1="18" y1="14" x2="30" y2="14" stroke="#34D399" stroke-width="1.5" />
  <path d="M 13 16 V 21 A 11 11 0 0 0 35 21 V 16" fill="none" stroke="#60A5FA" stroke-width="2.2" stroke-linecap="round" />
  <line x1="24" y1="32" x2="24" y2="38" stroke="#60A5FA" stroke-width="2.5" />
  <line x1="17" y1="38" x2="31" y2="38" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="20" cy="11" r="2.5" fill="none" stroke="#FBBF24" stroke-width="1.5" />
  <circle cx="28" cy="11" r="2.5" fill="none" stroke="#FBBF24" stroke-width="1.5" />
  <line x1="22.5" y1="11" x2="25.5" y2="11" stroke="#FBBF24" stroke-width="1.5" />
  <rect x="19" y="40" width="10" height="5" rx="1" fill="#EF0107" stroke="#FFFFFF" stroke-width="0.8" />
</svg>`,

  4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-4">
  <!-- Gooner Fan - Arsenal Cannon -->
  <path d="M 24 5 L 40 10 V 24 C 40 34, 24 43, 24 43 C 24 43, 8 34, 8 24 V 10 Z" fill="#0F172A" stroke="#EF0107" stroke-width="2.5" />
  <path d="M 14 26 L 31 22 L 32 19 L 14 23 Z" fill="#EF0107" stroke="#FBBF24" stroke-width="1.5" stroke-linejoin="round" />
  <circle cx="20" cy="27" r="5" fill="#1E293B" stroke="#FBBF24" stroke-width="2" />
  <circle cx="20" cy="27" r="1.5" fill="#FBBF24" />
  <path d="M 15 27 L 11 31" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" />
  <path d="M 24 10 L 25 13 L 28 13 L 25.5 15 L 26.5 18 L 24 16 L 21.5 18 L 22.5 15 L 20 13 L 23 13 Z" fill="#FBBF24" />
</svg>`,

  5: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-5">
  <!-- Lucky Gooner Dice -->
  <rect x="8" y="18" width="20" height="20" rx="4" fill="#EF0107" stroke="#FFFFFF" stroke-width="2" transform="rotate(-8 18 28)" />
  <g transform="rotate(-8 18 28)">
    <circle cx="12" cy="22" r="1.5" fill="#FBBF24" />
    <circle cx="24" cy="22" r="1.5" fill="#FBBF24" />
    <circle cx="18" cy="28" r="1.5" fill="#FBBF24" />
    <circle cx="12" cy="34" r="1.5" fill="#FBBF24" />
    <circle cx="24" cy="34" r="1.5" fill="#FBBF24" />
  </g>
  <rect x="22" y="10" width="18" height="18" rx="3.5" fill="#0F172A" stroke="#FBBF24" stroke-width="2" transform="rotate(14 31 19)" />
  <g transform="rotate(14 31 19)">
    <circle cx="26" cy="14" r="1.4" fill="#FFFFFF" />
    <circle cx="31" cy="19" r="1.4" fill="#FFFFFF" />
    <circle cx="36" cy="24" r="1.4" fill="#FFFFFF" />
  </g>
  <circle cx="12" cy="10" r="2.5" fill="#FBBF24" />
</svg>`,

  6: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="tier-svg tier-svg-6">
  <!-- Spurs Cockerel Banter Icon (The Casual / 0 Pts) -->
  <circle cx="24" cy="33" r="9" fill="#1E293B" stroke="#64748B" stroke-width="2" />
  <line x1="15" y1="33" x2="33" y2="33" stroke="#64748B" stroke-width="1.5" />
  <path d="M 24 24 V 42" stroke="#64748B" stroke-width="1.5" />
  <path d="M 18 27 C 22 30, 22 36, 18 39" fill="none" stroke="#64748B" stroke-width="1.2" />
  <path d="M 30 27 C 26 30, 26 36, 30 39" fill="none" stroke="#64748B" stroke-width="1.2" />
  <path d="M 22 24 C 20 18, 23 14, 25 10 C 27 12, 29 14, 27 18 C 28 20, 27 24, 25 24 Z" fill="#334155" stroke="#94A3B8" stroke-width="1.8" />
  <path d="M 27 12 L 31 13 L 28 15 Z" fill="#FBBF24" />
  <path d="M 23 9 C 23 6, 27 6, 26 9 C 27 7, 30 9, 28 11 Z" fill="#F43F5E" />
  <line x1="23" y1="24" x2="23" y2="25" stroke="#94A3B8" stroke-width="2" />
  <line x1="25" y1="24" x2="25" y2="25" stroke="#94A3B8" stroke-width="2" />
  <rect x="30" y="6" width="14" height="9" rx="2" fill="#F43F5E" />
  <text x="37" y="13" font-size="7" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="var(--font-main)">0</text>
</svg>`
};

// Active Tier SVGs (Defaulting to Backup Generic Set)
export const TIER_SVGS = TIER_SVGS_GENERIC;

/**
 * Helper to get inline SVG string for a tier with custom width/height/class.
 */
export function getTierIconSvg(tier, size = 18, extraClass = '') {
  const svgStr = TIER_SVGS[tier] || '';
  if (!svgStr) return '';
  return svgStr.replace('<svg ', `<svg style="width: ${size}px; height: ${size}px; vertical-align: middle; display: inline-block;" class="${extraClass}" `);
}
