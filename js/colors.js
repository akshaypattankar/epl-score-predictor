// js/colors.js - Golden-Ratio Contrasting Player Palette System
// Shared across Dashboard, Heatmaps, Wagers, and Standings views.

const sessionBaseHue = Math.floor(Math.random() * 360);
const sessionPlayerColorMap = new Map();

/**
 * Converts HSL values to a 6-digit hex color code.
 */
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Fine-tunes saturation and lightness per hue region based on human visual perception (Helmholtz-Kohlrausch effect)
 * so that colors across the spectrum have balanced perceived brightness on dark backgrounds.
 */
export function getTunedHsl(hue) {
  const h = ((hue % 360) + 360) % 360;
  let s = 88;
  let l = 60;

  if (h >= 40 && h <= 95) {
    // Yellows, Ambers, Chartreuse - slightly lower lightness to avoid washed out neon
    l = 52;
    s = 92;
  } else if (h >= 215 && h <= 290) {
    // Blues, Indigos, Deep Violets - boost lightness for crisp readability on dark glass
    l = 66;
    s = 90;
  } else if (h >= 340 || h <= 25) {
    // Coral, Crimson, Flame Red
    l = 60;
    s = 92;
  } else if (h >= 140 && h <= 200) {
    // Emerald, Teal, Cyan
    l = 56;
    s = 88;
  } else {
    // Magenta, Purple, Rose
    l = 62;
    s = 88;
  }

  return { h, s, l };
}

/**
 * Re-indexes all active group players to guarantee maximally distinct,
 * contrasting hues distributed via Golden Angle stepping.
 */
export function recalculateGroupPlayerColors(playersList) {
  if (!Array.isArray(playersList) || playersList.length === 0) return;
  sessionPlayerColorMap.clear();

  // Stable sort by numeric ID
  const sorted = [...playersList].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

  sorted.forEach((player, idx) => {
    // Golden angle distribution: (base + idx * 137.507764°) % 360°
    const hue = (sessionBaseHue + (idx * 137.507764)) % 360;
    const { h, s, l } = getTunedHsl(hue);
    const hex = hslToHex(h, s, l);

    if (player.id != null) {
      sessionPlayerColorMap.set(`id_${player.id}`, hex);
    }
    if (player.name) {
      sessionPlayerColorMap.set(`name_${player.name.toLowerCase().trim()}`, hex);
    }
  });
}

export function getPlayerColor(playerOrIdOrName) {
  if (playerOrIdOrName == null) {
    const { h, s, l } = getTunedHsl(sessionBaseHue);
    return hslToHex(h, s, l);
  }

  let idKey = null;
  let nameKey = null;

  if (typeof playerOrIdOrName === 'object') {
    if (playerOrIdOrName.id != null) idKey = `id_${playerOrIdOrName.id}`;
    if (playerOrIdOrName.name) nameKey = `name_${playerOrIdOrName.name.toLowerCase().trim()}`;
  } else if (typeof playerOrIdOrName === 'number') {
    idKey = `id_${playerOrIdOrName}`;
  } else if (typeof playerOrIdOrName === 'string') {
    if (/^\d+$/.test(playerOrIdOrName.trim())) {
      idKey = `id_${playerOrIdOrName.trim()}`;
    } else {
      nameKey = `name_${playerOrIdOrName.toLowerCase().trim()}`;
    }
  }

  if (idKey && sessionPlayerColorMap.has(idKey)) return sessionPlayerColorMap.get(idKey);
  if (nameKey && sessionPlayerColorMap.has(nameKey)) return sessionPlayerColorMap.get(nameKey);

  // Dynamic fallback for any unmapped player
  const nextIdx = sessionPlayerColorMap.size;
  const hue = (sessionBaseHue + (nextIdx * 137.507764)) % 360;
  const { h, s, l } = getTunedHsl(hue);
  const color = hslToHex(h, s, l);

  if (idKey) sessionPlayerColorMap.set(idKey, color);
  if (nameKey) sessionPlayerColorMap.set(nameKey, color);

  return color;
}

export function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(56, 189, 248, ${alpha})`;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(56, 189, 248, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function darkenHex(hex, factor = 0.45) {
  if (!hex || typeof hex !== 'string') return '#0f172a';
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return '#0f172a';
  const r = Math.round(((num >> 16) & 255) * factor);
  const g = Math.round(((num >> 8) & 255) * factor);
  const b = Math.round((num & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getPlayerColorShades(playerOrIdOrName) {
  const primary = getPlayerColor(playerOrIdOrName);
  return {
    primary,
    border: hexToRgba(primary, 0.45),
    glow: hexToRgba(primary, 0.25),
    subtleGlow: hexToRgba(primary, 0.15),
    bgSubtle: hexToRgba(primary, 0.08),
    bgCardTop: hexToRgba(primary, 0.18),
    badgeBg: `radial-gradient(circle at 35% 35%, ${hexToRgba(primary, 0.35)} 0%, ${hexToRgba(primary, 0.08)} 100%)`,
    badgeBorder: hexToRgba(primary, 0.55),
    chipBg: hexToRgba(primary, 0.14),
    chipBorder: hexToRgba(primary, 0.35),
    textGradient: `linear-gradient(135deg, var(--text-main) 25%, ${primary} 100%)`
  };
}

/**
 * Renders an image rank badge (for ranks 1-10) using graphical assets,
 * or formatted numeric text (#11, #12...) for ranks beyond 10.
 *
 * @param {number} rank - Player rank (1-indexed)
 * @param {Object} [options]
 * @param {number} [options.size] - Image dimension in pixels (default: 24)
 * @param {string} [options.className] - Additional CSS class name(s)
 * @param {string} [options.alt] - Custom alt text
 * @returns {string} Rendered HTML string
 */
export function getRankBadgeHtml(rank, options = {}) {
  const r = parseInt(rank, 10);
  const size = options.size || 24;
  const extraClass = options.className ? ` ${options.className}` : '';
  const alt = options.alt || `Rank #${r}`;

  if (r >= 1 && r <= 10) {
    return `<img src="assets/ranks/rank-badge-${r}.png" alt="${alt}" class="rank-badge-img${extraClass}" width="${size}" height="${size}" loading="lazy" onerror="this.onerror=null;this.replaceWith('#${r}');" />`;
  }
  return `<span class="rank-badge-text${extraClass}">#${r || '–'}</span>`;
}

