// server/notifications.js - ntfy Push Notification Service for EPL Score Predictor
import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import db, { getAppSetting, setAppSetting, getFplCache, setFplCache, getScoringRules } from './db.js';
import { FALLBACK_TEAMS } from './whatif.js';
import { generateMatchHeatmapPng } from './heatmap_generator.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore
}

export function slugifyTopic(name, id) {
  const clean = (name || 'league')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  const hash = crypto.randomBytes(3).toString('hex');
  return `epl-${clean || 'league'}-${id || '0'}-${hash}`;
}

export function getNtfyConfig() {
  const enabledStr = getAppSetting('ntfy_enabled', '1');
  const serverUrl = getAppSetting('ntfy_server', 'https://ntfy.sh').replace(/\/+$/, '');
  const appUrl = getAppSetting('ntfy_app_url', '').replace(/\/+$/, '');
  const reminderHoursRaw = getAppSetting('ntfy_reminder_hours', '24,2');
  const kickoffMinutesRaw = getAppSetting('ntfy_kickoff_minutes', '15');
  const includeHeatmapsStr = getAppSetting('ntfy_include_heatmaps', '1');

  const reminderHours = reminderHoursRaw
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => b - a);

  const kickoffMinutes = parseInt(kickoffMinutesRaw, 10) || 15;
  const includeHeatmaps = includeHeatmapsStr !== '0' && includeHeatmapsStr !== 'false';

  return {
    enabled: enabledStr === '1' || enabledStr === 'true',
    serverUrl,
    appUrl,
    reminderHours,
    kickoffMinutes,
    includeHeatmaps
  };
}

/**
 * Send an HTTP POST push notification to an ntfy topic.
 * Uses native https/http client with family: 4 to prevent Docker/Tailscale IPv6 connection timeouts.
 * Supports image attachments (PNG/JPEG) for rich in-app/lockscreen graphical previews.
 */
export async function sendNtfyNotification({
  serverUrl = null,
  topic,
  title,
  message,
  priority = 3, // 1 to 5
  tags = 'soccer',
  clickUrl = null,
  icon = null,
  markdown = true,
  attachmentBuffer = null,
  attachmentFilename = null
}) {
  if (!topic || !topic.trim()) {
    throw new Error('Topic is required to send ntfy notification');
  }

  const config = getNtfyConfig();
  const baseServer = (serverUrl || config.serverUrl || 'https://ntfy.sh').replace(/\/+$/, '');
  const cleanTopic = topic.trim();
  const urlStr = `${baseServer}/${cleanTopic}`;

  const targetClickUrl = clickUrl || config.appUrl || undefined;
  const cleanTitle = title || 'EPL Predictor Alert';
  const encodedTitle = '=?utf-8?B?' + Buffer.from(cleanTitle, 'utf-8').toString('base64') + '?=';

  const isAttachment = Boolean(attachmentBuffer && Buffer.isBuffer(attachmentBuffer) && attachmentBuffer.length > 0);
  const cleanMessage = message || '';

  const headers = {
    'Title': encodedTitle,
    'Priority': String(priority || 3),
    'Tags': tags || 'soccer',
  };

  if (isAttachment) {
    headers['Filename'] = attachmentFilename || 'heatmap.png';
    headers['Content-Type'] = 'image/png';
    headers['Content-Length'] = attachmentBuffer.length;
    if (cleanMessage) {
      headers['Message'] = '=?utf-8?B?' + Buffer.from(cleanMessage, 'utf-8').toString('base64') + '?=';
    }
  } else {
    headers['Content-Type'] = 'text/plain; charset=utf-8';
    headers['Content-Length'] = Buffer.byteLength(cleanMessage, 'utf-8');
  }

  if (markdown) {
    headers['Markdown'] = 'yes';
  }

  if (icon) {
    headers['Icon'] = icon;
  }

  if (targetClickUrl) {
    headers['Click'] = targetClickUrl;
    headers['Actions'] = `view, Open EPL Predictor, ${targetClickUrl}, clear=true`;
  }

  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(urlStr);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.request(parsedUrl, {
        method: 'POST',
        family: 4,
        headers
      }, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(respData));
            } catch (e) {
              resolve({ success: true, body: respData });
            }
          } else {
            reject(new Error(`ntfy server returned HTTP ${res.statusCode}: ${respData || res.statusMessage}`));
          }
        });
      });

      req.on('error', reject);
      if (isAttachment) {
        req.write(attachmentBuffer);
      } else if (cleanMessage) {
        req.write(cleanMessage);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Build team ID to Team Object lookup from bootstrap-static cache or fallback catalog.
 */
export function getTeamsMap() {
  const map = {};
  FALLBACK_TEAMS.forEach(t => {
    map[t.id] = { id: t.id, name: t.name, short: t.short, code: t.code };
  });

  const cache = getFplCache('bootstrap-static');
  if (cache && cache.data) {
    try {
      const parsed = JSON.parse(cache.data);
      if (Array.isArray(parsed.teams)) {
        parsed.teams.forEach(t => {
          map[t.id] = {
            id: t.id,
            name: t.name,
            short: t.short_name || t.name.slice(0, 3).toUpperCase(),
            code: t.code || t.id
          };
        });
      }
    } catch (e) {
      // Use fallback
    }
  }

  return map;
}

/**
 * Normalize and check if a fixture is in scope for a given group.
 */
export function isFixtureInGroupScope(fixture, group, gw) {
  if (!group) return true;
  const startGw = group.start_gw ? Number(group.start_gw) : 1;
  const fixtureGw = Number(gw || fixture.event || 1);
  if (fixtureGw < startGw) return false;

  const filter = group.teams_filter;
  if (!filter || filter === 'ALL') return true;

  let parsed = filter;
  if (typeof filter === 'string') {
    try {
      parsed = JSON.parse(filter);
    } catch (e) {
      parsed = filter;
    }
  }

  let allowedTeams = null;
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].from_gw !== undefined) {
    const segment = parsed.find(s => fixtureGw >= Number(s.from_gw) && (s.to_gw == null || fixtureGw <= Number(s.to_gw)));
    if (!segment || segment.teams === 'ALL' || !segment.teams) return true;
    allowedTeams = Array.isArray(segment.teams) ? segment.teams : null;
  } else if (Array.isArray(parsed) && parsed.length > 0) {
    allowedTeams = parsed;
  }

  if (!allowedTeams || allowedTeams.length === 0) return true;

  const homeName = fixture.home_name || fixture.homeTeam?.name || '';
  const awayName = fixture.away_name || fixture.awayTeam?.name || '';

  const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalize(homeName);
  const awayNorm = normalize(awayName);

  return allowedTeams.some(t => {
    const tNorm = normalize(t);
    return tNorm === homeNorm || tNorm === awayNorm;
  });
}

/**
 * Evaluate single prediction points using active scoring rules from DB.
 * Returns total points, exact scoring tier name, and tier icon from the rules.
 */
export function calculatePredictionPoints(actH, actA, predH, predA) {
  if ([actH, actA, predH, predA].some(v => v === null || v === undefined || isNaN(v))) {
    return {
      total: 0,
      tier: 6,
      tierName: 'No Prediction',
      tierIcon: '',
      isExact: false,
      outcome: false,
      base: 0,
      bonusPts: 0,
      earnedBonuses: []
    };
  }

  const allRules = getScoringRules();
  const tiers = Array.isArray(allRules) ? allRules.filter(r => r.rule_type === 'tier') : [];
  const bonuses = Array.isArray(allRules) ? allRules.filter(r => r.rule_type === 'bonus') : [];

  const actOutcome = Math.sign(actH - actA);
  const predOutcome = Math.sign(predH - predA);
  const isCorrectOutcome = actOutcome === predOutcome;
  const isExactScore = actH === predH && actA === predA;
  const isExactGD = (actH - actA) === (predH - predA);
  const isOneTeamGoalsExact = actH === predH || actA === predA;

  let tierId = 6;
  if (isExactScore) tierId = 1;
  else if (isCorrectOutcome && isExactGD && !(actH === 0 && actA === 0)) tierId = 2;
  else if (isCorrectOutcome && isOneTeamGoalsExact) tierId = 3;
  else if (isCorrectOutcome) tierId = 4;
  else if (isOneTeamGoalsExact) tierId = 5;

  const tierObj = tiers.find(t => String(t.id) === String(tierId)) || {
    name: tierId === 6 ? 'Infantino' : `Tier ${tierId}`,
    pts: tierId === 1 ? 10 : (tierId === 2 ? 7 : (tierId === 3 ? 5 : (tierId === 4 ? 3 : (tierId === 5 ? 1 : 0)))),
    icon: tierId === 1 ? '🔮' : (tierId === 6 ? '🤡' : '🎯')
  };

  const base = Number(tierObj.pts) || 0;
  let bonusPts = 0;
  const earnedBonuses = [];

  // Evaluate active bonus rules
  if (isCorrectOutcome) {
    for (const b of bonuses) {
      let qualified = true;
      if (b.min_goals_enabled && b.min_goals != null) {
        const target = Number(b.min_goals);
        const mode = b.min_goals_mode || 'BOTH';
        if (mode === 'HOME') {
          qualified = qualified && (actH >= target && predH >= target);
        } else if (mode === 'AWAY') {
          qualified = qualified && (actA >= target && predA >= target);
        } else if (mode === 'EITHER') {
          qualified = qualified && (actH >= target || actA >= target) && (predH >= target || predA >= target);
        } else {
          qualified = qualified && ((actH + actA) >= target && (predH + predA) >= target);
        }
      }

      if (b.goal_diff_enabled && b.goal_diff != null) {
        const targetGD = Number(b.goal_diff);
        const actualGD = Math.abs(actH - actA);
        const predGD = Math.abs(predH - predA);
        qualified = qualified && actualGD >= targetGD && predGD >= targetGD;
      }

      if (b.id === 'drawBonus') {
        qualified = (actH === actA && isExactScore);
      }

      if (qualified) {
        const pts = Number(b.pts) || 0;
        bonusPts += pts;
        earnedBonuses.push({ name: b.name, icon: b.icon || '✨', pts });
      }
    }
  }

  return {
    total: base + bonusPts,
    tier: tierId,
    tierName: tierObj.name,
    tierIcon: tierObj.icon || '',
    isExact: isExactScore,
    outcome: isCorrectOutcome,
    base,
    bonusPts,
    earnedBonuses
  };
}

/**
 * 1. Check and send alerts right at the start of the game once inputs lock.
 * Contains everyone's prediction in the group along with team crests and club short names.
 */
export async function checkAndSendMatchKickoffAlerts(fixtures, teamsMap, config) {
  if (!config.enabled) return 0;
  const now = Date.now();
  let sentCount = 0;

  const groups = db.prepare('SELECT * FROM groups').all();
  if (groups.length === 0) return 0;

  for (const f of fixtures) {
    // Skip if finished or postponed
    if (f.finished || f.finished_provisional || f.postponed) continue;
    if (!f.kickoff_time) continue;

    const koTime = new Date(f.kickoff_time).getTime();
    if (isNaN(koTime)) continue;

    // Has kickoff time passed or match started? Inputs lock at this moment.
    const hasStarted = Boolean(f.started) || (koTime > 0 && now >= koTime);
    if (!hasStarted) continue;

    const timeSinceKickoff = now - koTime;
    // Only send real-time alert if match kicked off within the last 30 minutes
    const isRecentKickoff = timeSinceKickoff >= 0 && timeSinceKickoff <= 30 * 60 * 1000;

    const homeTeam = teamsMap[f.team_h] || { id: f.team_h, name: `Team ${f.team_h}`, short: `T${f.team_h}`, code: f.team_h };
    const awayTeam = teamsMap[f.team_a] || { id: f.team_a, name: `Team ${f.team_a}`, short: `T${f.team_a}`, code: f.team_a };

    const homeCrestInline = `https://resources.premierleague.com/premierleague/badges/50/t${homeTeam.code || homeTeam.id}.png`;
    const awayCrestInline = `https://resources.premierleague.com/premierleague/badges/50/t${awayTeam.code || awayTeam.id}.png`;
    const homeBadgeIcon = `https://resources.premierleague.com/premierleague/badges/70/t${homeTeam.code || homeTeam.id}.png`;

    for (const group of groups) {
      const fixtureWithNames = { ...f, home_name: homeTeam.name, away_name: awayTeam.name };
      if (!isFixtureInGroupScope(fixtureWithNames, group, f.event)) continue;

      const topic = group.ntfy_topic;
      if (!topic) continue;

      const refId = `match_${f.id}_lock_group_${group.id}`;
      const legacyRefId = `match_${f.id}_kickoff_group_${group.id}`;
      const alreadySent = db.prepare(`
        SELECT 1 FROM sent_notifications 
        WHERE type IN ('match_lock', 'match_kickoff') 
          AND reference_id IN (?, ?) 
          AND target_topic = ?
      `).get(refId, legacyRefId, topic);
      if (alreadySent) continue;

      if (!isRecentKickoff) {
        // Silently record historical kickoffs so we don't spam after server restart
        db.prepare(`
          INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
          VALUES (?, ?, ?, ?, ?)
        `).run('match_lock', refId, topic, 'Historical Kickoff', 'Match started > 30m ago');
        continue;
      }

      // Fetch all players in this group with their predictions for this match
      const playersInGroup = db.prepare(`
        SELECT p.id, p.name, pr.home_score as pred_h, pr.away_score as pred_a
        FROM players p
        JOIN group_players gp ON p.id = gp.player_id
        LEFT JOIN predictions pr ON p.id = pr.player_id AND pr.match_id = ?
        WHERE gp.group_id = ?
        ORDER BY p.name ASC
      `).all(f.id, group.id);

      const predLines = playersInGroup.map(p => {
        const hasPred = p.pred_h !== null && p.pred_a !== null && p.pred_h !== '' && p.pred_a !== '';
        if (hasPred) {
          return `• **${p.name}**: \`${p.pred_h} - ${p.pred_a}\``;
        } else {
          return `• **${p.name}**: *(No prediction)*`;
        }
      });

      const title = `🔒 Kickoff: ${homeTeam.short} vs ${awayTeam.short}`;
      const gwStr = f.event ? `Gameweek ${f.event}` : 'Premier League';
      const message = [
        `![${homeTeam.short}](${homeCrestInline}) **${homeTeam.short}** vs **${awayTeam.short}** ![${awayTeam.short}](${awayCrestInline})`,
        `### 🔒 Inputs Locked — Match Underway!`,
        `**${homeTeam.name}** vs **${awayTeam.name}**`,
        `*${gwStr} · League: ${group.name}*`,
        '',
        '---',
        '### 📋 Group Predictions:',
        predLines.length > 0 ? predLines.join('\n') : '*(No players found)*'
      ].join('\n');

      // Generate Predictions Heatmap PNG if enabled
      let heatmapBuffer = null;
      let heatmapFilename = null;
      if (config.includeHeatmaps) {
        try {
          const { png } = generateMatchHeatmapPng({
            fixture: f,
            homeTeam,
            awayTeam,
            playersWithPreds: playersInGroup,
            leagueName: group.name,
            isFullTime: false
          });
          heatmapBuffer = png;
          heatmapFilename = `heatmap_${homeTeam.short}_vs_${awayTeam.short}.png`;
        } catch (err) {
          console.warn(`[ntfy] Failed to generate kickoff heatmap for match ${f.id}:`, err.message);
        }
      }

      try {
        await sendNtfyNotification({
          serverUrl: config.serverUrl,
          topic,
          title,
          message,
          priority: 4,
          tags: 'soccer,lock,whistle,bar_chart',
          icon: homeBadgeIcon,
          markdown: true,
          attachmentBuffer: heatmapBuffer,
          attachmentFilename: heatmapFilename
        });

        db.prepare(`
          INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
          VALUES (?, ?, ?, ?, ?)
        `).run('match_lock', refId, topic, title, message);

        sentCount++;
        console.log(`[ntfy] Sent kickoff & locked predictions alert for match ${f.id} (${homeTeam.short} vs ${awayTeam.short}) to "${group.name}" (${topic})`);
      } catch (err) {
        console.error(`[ntfy] Error sending kickoff alert for match ${f.id} to ${topic}:`, err.message);
      }
    }
  }

  return sentCount;
}

let inFlightFixturesRefresh = null;

/**
 * Fetch fresh fixtures directly from FPL API and update SQLite fpl_cache.
 * Uses native https with family: 4 to prevent Docker/Tailscale IPv6 hangs.
 */
export async function refreshFixturesDataset() {
  if (inFlightFixturesRefresh) {
    return inFlightFixturesRefresh;
  }

  inFlightFixturesRefresh = (async () => {
    try {
      console.log('[ntfy] Refreshing FPL fixtures dataset from fantasy.premierleague.com...');
      const url = 'https://fantasy.premierleague.com/api/fixtures/';

      const json = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          family: 4,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EPL-Predictor/1.0',
            'Accept': 'application/json'
          }
        }, (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`FPL API responded with HTTP ${res.statusCode}`));
          }
          let raw = '';
          res.on('data', chunk => { raw += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error('Failed to parse FPL fixtures JSON: ' + e.message));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(12000, () => {
          req.destroy(new Error('FPL fixtures refresh timed out'));
        });
      });

      if (Array.isArray(json) && json.length > 0) {
        setFplCache('fixtures', JSON.stringify(json), 60000, 'NORMAL');
        console.log(`[ntfy] Successfully refreshed fixtures dataset (${json.length} fixtures updated in cache).`);
        return json;
      }
      return null;
    } catch (err) {
      console.warn('[ntfy] Fixtures dataset refresh warning:', err.message);
      const cached = getFplCache('fixtures');
      if (cached && cached.data) {
        try { return JSON.parse(cached.data); } catch (e) {}
      }
      return null;
    } finally {
      inFlightFixturesRefresh = null;
    }
  })();

  return inFlightFixturesRefresh;
}

/**
 * 2. Check and send full-time result & points earned alerts 10 minutes after the game finishes.
 * - Confirms match status is finished (f.finished === true).
 * - Waits 10 minutes after first detecting finished status to allow injury time & stats settlement.
 * - Refreshes the FPL fixtures dataset before calculating points and dispatching the notification.
 * - Uses exact scoring tier names and icons from the active rules in DB.
 */
export async function checkAndSendMatchFinishedAlerts(fixtures, teamsMap, config) {
  if (!config.enabled) return 0;
  let sentCount = 0;

  const groups = db.prepare('SELECT * FROM groups').all();
  if (groups.length === 0) return 0;

  const now = Date.now();
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  for (const f of fixtures) {
    // Strict status check: must be officially finished (not just provisional)
    if (!f.finished) continue;
    if (f.team_h_score === null || f.team_a_score === null || f.team_h_score === undefined || f.team_a_score === undefined) continue;

    const koTime = f.kickoff_time ? new Date(f.kickoff_time).getTime() : 0;
    const timeSinceKickoff = now - koTime;

    // Check finish tracking record in DB
    let tracker = db.prepare('SELECT * FROM match_finish_tracking WHERE match_id = ?').get(f.id);

    if (!tracker) {
      // Historical past matches (> 6h ago): record as already notified silently
      if (koTime > 0 && timeSinceKickoff > 6 * 60 * 60 * 1000) {
        db.prepare(`
          INSERT OR REPLACE INTO match_finish_tracking (match_id, first_finished_at, dataset_refreshed_at, notification_sent_at)
          VALUES (?, ?, ?, ?)
        `).run(f.id, now - TEN_MINUTES_MS, now, now);

        for (const group of groups) {
          if (group.ntfy_topic) {
            const refId = `match_${f.id}_finished_group_${group.id}`;
            db.prepare(`
              INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
              VALUES (?, ?, ?, ?, ?)
            `).run('match_finished', refId, group.ntfy_topic, 'Historical Finished', 'Historical match');
          }
        }
        continue;
      }

      // First time observing this match as finished: start the 10-minute timer!
      db.prepare(`
        INSERT OR REPLACE INTO match_finish_tracking (match_id, first_finished_at, dataset_refreshed_at, notification_sent_at)
        VALUES (?, ?, 0, 0)
      `).run(f.id, now);
      console.log(`[ntfy] Match ${f.id} status is now FINISHED. Starting 10-minute buffer to account for injury time & stat settlements...`);
      continue;
    }

    // Already notified for this match
    if (tracker.notification_sent_at > 0) {
      continue;
    }

    // Check if 10 minutes have elapsed since the match was marked finished
    const elapsedSinceFinish = now - tracker.first_finished_at;
    if (elapsedSinceFinish < TEN_MINUTES_MS) {
      const remainingSec = Math.ceil((TEN_MINUTES_MS - elapsedSinceFinish) / 1000);
      console.log(`[ntfy] Match ${f.id} finished. 10-minute buffer in progress (${remainingSec}s remaining before dataset refresh & alert)...`);
      continue;
    }

    // 10 minutes have elapsed! Refresh dataset from FPL API
    console.log(`[ntfy] 10-minute buffer elapsed for Match ${f.id}. Refreshing FPL dataset...`);
    let activeMatch = f;
    try {
      const refreshedFixtures = await refreshFixturesDataset();
      if (Array.isArray(refreshedFixtures)) {
        const fresh = refreshedFixtures.find(x => x.id === f.id);
        if (fresh) {
          activeMatch = fresh;
        }
      }
    } catch (e) {
      console.warn(`[ntfy] Failed to refresh fixtures before notification for match ${f.id}:`, e.message);
    }

    // Re-verify finished status after refresh
    if (!activeMatch.finished) {
      console.warn(`[ntfy] Match ${f.id} status is no longer finished after refresh. Postponing alert.`);
      continue;
    }

    const actH = Number(activeMatch.team_h_score);
    const actA = Number(activeMatch.team_a_score);

    const homeTeam = teamsMap[activeMatch.team_h] || { id: activeMatch.team_h, name: `Team ${activeMatch.team_h}`, short: `T${activeMatch.team_h}`, code: activeMatch.team_h };
    const awayTeam = teamsMap[activeMatch.team_a] || { id: activeMatch.team_a, name: `Team ${activeMatch.team_a}`, short: `T${activeMatch.team_a}`, code: activeMatch.team_a };

    const homeCrestInline = `https://resources.premierleague.com/premierleague/badges/50/t${homeTeam.code || homeTeam.id}.png`;
    const awayCrestInline = `https://resources.premierleague.com/premierleague/badges/50/t${awayTeam.code || awayTeam.id}.png`;
    const homeBadgeIcon = `https://resources.premierleague.com/premierleague/badges/70/t${homeTeam.code || homeTeam.id}.png`;

    for (const group of groups) {
      const fixtureWithNames = { ...activeMatch, home_name: homeTeam.name, away_name: awayTeam.name };
      if (!isFixtureInGroupScope(fixtureWithNames, group, activeMatch.event)) continue;

      const topic = group.ntfy_topic;
      if (!topic) continue;

      const refId = `match_${activeMatch.id}_finished_group_${group.id}`;
      const alreadySent = db.prepare('SELECT 1 FROM sent_notifications WHERE type = ? AND reference_id = ? AND target_topic = ?').get('match_finished', refId, topic);
      if (alreadySent) continue;

      // Calculate player points in this group for this match using scoring tier names from rules
      const playersInGroup = db.prepare(`
        SELECT p.id, p.name, pr.home_score as pred_h, pr.away_score as pred_a
        FROM players p
        JOIN group_players gp ON p.id = gp.player_id
        LEFT JOIN predictions pr ON p.id = pr.player_id AND pr.match_id = ?
        WHERE gp.group_id = ?
        ORDER BY p.name ASC
      `).all(activeMatch.id, group.id);

      const evaluatedResults = [];
      for (const p of playersInGroup) {
        const hasPred = p.pred_h !== null && p.pred_a !== null && p.pred_h !== '' && p.pred_a !== '';
        if (hasPred) {
          const evalRes = calculatePredictionPoints(actH, actA, Number(p.pred_h), Number(p.pred_a));
          evaluatedResults.push({
            name: p.name,
            predH: p.pred_h,
            predA: p.pred_a,
            pts: evalRes.total,
            tierName: evalRes.tierName,
            tierIcon: evalRes.tierIcon,
            earnedBonuses: evalRes.earnedBonuses || [],
            hasPred: true
          });
        } else {
          evaluatedResults.push({
            name: p.name,
            predH: null,
            predA: null,
            pts: 0,
            tierName: 'No Prediction',
            tierIcon: '',
            earnedBonuses: [],
            hasPred: false
          });
        }
      }

      // Sort by points earned descending, then alphabetically by player name
      evaluatedResults.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

      const scoreLines = evaluatedResults.map(r => {
        if (!r.hasPred) {
          return `• **${r.name}**: *(No prediction)* → **+0 pts**`;
        }
        const iconStr = r.tierIcon ? ` ${r.tierIcon}` : '';
        const nameStr = r.tierName ? ` *(${r.tierName})*` : '';
        const bonusStr = r.earnedBonuses.length > 0
          ? ` ` + r.earnedBonuses.map(b => `${b.icon} *+${b.pts} ${b.name}*`).join(' ')
          : '';
        return `• **${r.name}**: \`${r.predH} - ${r.predA}\` → **+${r.pts} pts**${iconStr}${nameStr}${bonusStr}`;
      });

      const title = `🏁 Full-Time: ${homeTeam.short} ${actH} - ${actA} ${awayTeam.short}`;
      const gwStr = activeMatch.event ? `Gameweek ${activeMatch.event}` : 'Premier League';
      const message = [
        `![${homeTeam.short}](${homeCrestInline}) **${homeTeam.short} ${actH} - ${actA} ${awayTeam.short}** ![${awayTeam.short}](${awayCrestInline})`,
        `### 🏁 Final: ${homeTeam.name} ${actH} - ${actA} ${awayTeam.name}`,
        `*${gwStr} · League: ${group.name}*`,
        '',
        '---',
        '### 🏆 Points Earned This Match:',
        scoreLines.length > 0 ? scoreLines.join('\n') : '*(No players found)*'
      ].join('\n');

      // Generate Full-Time Actual Score & Points Heatmap PNG if enabled
      let heatmapBuffer = null;
      let heatmapFilename = null;
      if (config.includeHeatmaps) {
        try {
          const { png } = generateMatchHeatmapPng({
            fixture: activeMatch,
            homeTeam,
            awayTeam,
            playersWithPreds: playersInGroup,
            actualScore: { home: actH, away: actA },
            leagueName: group.name,
            isFullTime: true
          });
          heatmapBuffer = png;
          heatmapFilename = `final_heatmap_${homeTeam.short}_${actH}_${actA}_${awayTeam.short}.png`;
        } catch (err) {
          console.warn(`[ntfy] Failed to generate full-time heatmap for match ${activeMatch.id}:`, err.message);
        }
      }

      try {
        await sendNtfyNotification({
          serverUrl: config.serverUrl,
          topic,
          title,
          message,
          priority: 3,
          tags: 'soccer,checkered_flag,trophy,bar_chart',
          icon: homeBadgeIcon,
          markdown: true,
          attachmentBuffer: heatmapBuffer,
          attachmentFilename: heatmapFilename
        });

        db.prepare(`
          INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
          VALUES (?, ?, ?, ?, ?)
        `).run('match_finished', refId, topic, title, message);

        sentCount++;
        console.log(`[ntfy] Sent full-time result & points for match ${activeMatch.id} (${homeTeam.short} ${actH}-${actA} ${awayTeam.short}) to group "${group.name}" (${topic})`);
      } catch (err) {
        console.error(`[ntfy] Error sending full-time alert for match ${activeMatch.id} to ${topic}:`, err.message);
      }
    }

    // Mark notification sent in match_finish_tracking
    db.prepare(`
      UPDATE match_finish_tracking
      SET dataset_refreshed_at = ?, notification_sent_at = ?
      WHERE match_id = ?
    `).run(Date.now(), Date.now(), f.id);
  }

  return sentCount;
}

/**
 * 3. Check and send prediction reminders before Gameweek deadline.
 */
export async function checkAndSendPredictionReminders(fixtures, teamsMap, config, options = {}) {
  if (!config.enabled && !options.force) return 0;
  const now = Date.now();
  let sentCount = 0;

  // Group fixtures by Gameweek
  const gwFixturesMap = {};
  for (const f of fixtures) {
    if (!f.event) continue;
    if (!gwFixturesMap[f.event]) gwFixturesMap[f.event] = [];
    gwFixturesMap[f.event].push(f);
  }

  // Find the next upcoming gameweek (first GW with unplayed matches whose first kickoff is in the future)
  const gwNumbers = Object.keys(gwFixturesMap).map(Number).sort((a, b) => a - b);
  const groups = db.prepare('SELECT * FROM groups').all();

  for (const gw of gwNumbers) {
    const gwFixtures = gwFixturesMap[gw] || [];
    const unstarted = gwFixtures.filter(f => !f.started && !f.finished && f.kickoff_time);
    if (unstarted.length === 0) continue;

    // Find earliest kickoff time for this GW
    const kickoffs = unstarted.map(f => new Date(f.kickoff_time).getTime()).filter(t => !isNaN(t) && t > now);
    if (kickoffs.length === 0) continue;

    const firstKickoffTime = Math.min(...kickoffs);
    const timeDiffHours = (firstKickoffTime - now) / (1000 * 60 * 60);

    for (const group of groups) {
      const topic = group.ntfy_topic;
      if (!topic) continue;

      // Filter in-scope fixtures for this group in this GW
      const groupInScopeFixtures = unstarted.filter(f => {
        const homeTeam = teamsMap[f.team_h] || { name: `Team ${f.team_h}` };
        const awayTeam = teamsMap[f.team_a] || { name: `Team ${f.team_a}` };
        return isFixtureInGroupScope({ ...f, home_name: homeTeam.name, away_name: awayTeam.name }, group, gw);
      });

      if (groupInScopeFixtures.length === 0) continue;

      // Check which players in this group have missing predictions
      const playersInGroup = db.prepare(`
        SELECT p.id, p.name, p.ntfy_topic as player_topic
        FROM players p
        JOIN group_players gp ON p.id = gp.player_id
        WHERE gp.group_id = ?
      `).all(group.id);

      const playersWithPending = [];
      for (const p of playersInGroup) {
        let missingCount = 0;
        for (const f of groupInScopeFixtures) {
          const pred = db.prepare('SELECT 1 FROM predictions WHERE match_id = ? AND player_id = ? AND home_score IS NOT NULL AND away_score IS NOT NULL').get(f.id, p.id);
          if (!pred) missingCount++;
        }
        if (missingCount > 0) {
          playersWithPending.push({ ...p, missingCount });
        }
      }

      if (playersWithPending.length === 0 && !options.force) continue;

      // Check reminder hour thresholds (e.g. 24h, 2h)
      const thresholds = options.force ? [0] : config.reminderHours;

      for (const thresh of thresholds) {
        const isTimeTriggered = !options.force && timeDiffHours <= thresh && timeDiffHours > Math.max(0, thresh - 1.5);
        if (!options.force && !isTimeTriggered) continue;

        const refId = options.force
          ? `manual_gw_${gw}_group_${group.id}_${Math.floor(now / 3600000)}`
          : `reminder_gw_${gw}_group_${group.id}_${thresh}h`;

        const alreadySent = db.prepare('SELECT 1 FROM sent_notifications WHERE type = ? AND reference_id = ? AND target_topic = ?').get('deadline_reminder', refId, topic);
        if (alreadySent && !options.force) continue;

        const hoursLeftStr = timeDiffHours >= 1
          ? `${Math.round(timeDiffHours)} hours`
          : `${Math.max(1, Math.round(timeDiffHours * 60))} minutes`;

        const title = `⏰ GW ${gw} Prediction Reminder: ${group.name}`;
        const pendingNames = playersWithPending.map(p => `${p.name} (${p.missingCount} remaining)`).join(', ');
        const message = `Gameweek ${gw} kicks off in ~${hoursLeftStr}!\n\n${playersWithPending.length} player(s) still have pending predictions:\n${pendingNames || 'All set'}\n\nEnter your scores before deadline!`;

        try {
          await sendNtfyNotification({
            serverUrl: config.serverUrl,
            topic,
            title,
            message,
            priority: 4,
            tags: 'soccer,alarm_clock,warning'
          });

          db.prepare(`
            INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
            VALUES (?, ?, ?, ?, ?)
          `).run('deadline_reminder', refId, topic, title, message);

          sentCount++;
          console.log(`[ntfy] Sent GW ${gw} reminder to group "${group.name}" (${topic})`);

          // Also send personal alert to individual players who have personal topics configured
          for (const p of playersWithPending) {
            if (p.player_topic && p.player_topic.trim() && p.player_topic.trim() !== topic) {
              const personalRefId = `${refId}_player_${p.id}`;
              const personalSent = db.prepare('SELECT 1 FROM sent_notifications WHERE type = ? AND reference_id = ? AND target_topic = ?').get('deadline_reminder', personalRefId, p.player_topic);
              if (!personalSent) {
                try {
                  await sendNtfyNotification({
                    serverUrl: config.serverUrl,
                    topic: p.player_topic,
                    title: `⏰ Prediction Reminder: ${group.name}`,
                    message: `Hi ${p.name}, you have ${p.missingCount} unpredicted match(es) for Gameweek ${gw} in ${group.name}.\nFirst kickoff is in ~${hoursLeftStr}. Submit your predictions now!`,
                    priority: 4,
                    tags: 'soccer,warning'
                  });

                  db.prepare(`
                    INSERT OR IGNORE INTO sent_notifications (type, reference_id, target_topic, title, message)
                    VALUES (?, ?, ?, ?, ?)
                  `).run('deadline_reminder', personalRefId, p.player_topic, title, message);
                } catch (e) {
                  console.error(`[ntfy] Failed personal reminder for ${p.name}:`, e.message);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[ntfy] Error sending GW ${gw} reminder to group ${group.name}:`, err.message);
        }
      }
    }

    // Only process the nearest upcoming gameweek
    break;
  }

  return sentCount;
}

/**
 * Main cycle runner: runs checks for kickoff alerts, finished match alerts, and prediction reminders.
 */
export async function runNotificationCycle() {
  const config = getNtfyConfig();
  if (!config.enabled) return;

  const fixturesCache = getFplCache('fixtures');
  if (!fixturesCache || !fixturesCache.data) return;

  let fixtures = [];
  try {
    fixtures = JSON.parse(fixturesCache.data);
  } catch (e) {
    return;
  }

  if (!Array.isArray(fixtures) || fixtures.length === 0) return;

  const teamsMap = getTeamsMap();

  try {
    await checkAndSendMatchKickoffAlerts(fixtures, teamsMap, config);
    await checkAndSendMatchFinishedAlerts(fixtures, teamsMap, config);
    await checkAndSendPredictionReminders(fixtures, teamsMap, config);
  } catch (err) {
    console.error('[ntfy] Error in notification cycle:', err);
  }
}

/**
 * Start the background notification polling scheduler.
 */
let schedulerInterval = null;
export function startNotificationScheduler(intervalMs = 60000) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  console.log(`[ntfy] Starting notification background engine (cycle every ${Math.round(intervalMs / 1000)}s)...`);
  // Run first cycle shortly after start
  setTimeout(() => {
    runNotificationCycle().catch(err => console.error('[ntfy] Initial cycle error:', err.message));
  }, 5000);

  schedulerInterval = setInterval(() => {
    runNotificationCycle().catch(err => console.error('[ntfy] Scheduled cycle error:', err.message));
  }, intervalMs);
}
