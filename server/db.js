import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dataDir = process.env.DATA_DIR;
if (!dataDir) {
  if (fs.existsSync('/app/data')) {
    dataDir = '/app/data';
  } else if (fs.existsSync(path.join(__dirname, 'data'))) {
    dataDir = path.join(__dirname, 'data');
  } else {
    dataDir = path.join(__dirname, '../data');
  }
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'epl_predictor.db');

// Migration fallback: If an existing db was written to /data/epl_predictor.db, copy it over
if (!fs.existsSync(dbPath) && fs.existsSync('/data/epl_predictor.db') && dataDir !== '/data') {
  try {
    fs.copyFileSync('/data/epl_predictor.db', dbPath);
    if (fs.existsSync('/data/epl_predictor.db-wal')) fs.copyFileSync('/data/epl_predictor.db-wal', `${dbPath}-wal`);
    if (fs.existsSync('/data/epl_predictor.db-shm')) fs.copyFileSync('/data/epl_predictor.db-shm', `${dbPath}-shm`);
    console.log('Migrated existing database from /data to persistent volume at', dbPath);
  } catch (err) {
    console.warn('Migration from /data warning:', err.message);
  }
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize updated DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    passcode TEXT DEFAULT '',
    timezone TEXT DEFAULT 'UTC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_players (
    group_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, player_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS predictions (
    match_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, player_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    player_id INTEGER,
    name TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS fpl_cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    dynamic_ttl INTEGER NOT NULL,
    match_state TEXT DEFAULT 'NORMAL'
  );
`);

// Handle migration for predictions table to share scores across all player groups
try {
  const tableInfo = db.prepare(`PRAGMA table_info(predictions)`).all();
  const pkColumns = tableInfo.filter(c => c.pk > 0).map(c => c.name);
  if (pkColumns.includes('group_id') || pkColumns.length > 2) {
    console.log('Migrating predictions table to shared player-centric schema (match_id, player_id)...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS predictions_new (
        match_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        home_score INTEGER,
        away_score INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (match_id, player_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );
      
      INSERT OR REPLACE INTO predictions_new (match_id, player_id, home_score, away_score, updated_at)
      SELECT match_id, player_id, home_score, away_score, MAX(updated_at)
      FROM predictions
      WHERE home_score IS NOT NULL AND away_score IS NOT NULL
      GROUP BY match_id, player_id;

      DROP TABLE predictions;
      ALTER TABLE predictions_new RENAME TO predictions;
    `);
    console.log('Successfully migrated predictions to shared player-centric schema.');
  }
} catch (e) {
  console.warn('Predictions schema migration warning:', e.message);
}

// Handle migration for timezone column in players and sessions table
try {
  const playerColumns = db.prepare(`PRAGMA table_info(players)`).all();
  if (!playerColumns.some(c => c.name === 'timezone')) {
    console.log('Adding timezone column to players table...');
    db.exec(`ALTER TABLE players ADD COLUMN timezone TEXT DEFAULT 'UTC';`);
  }
  const sessionColumns = db.prepare(`PRAGMA table_info(sessions)`).all();
  if (!sessionColumns.some(c => c.name === 'timezone')) {
    console.log('Adding timezone column to sessions table...');
    db.exec(`ALTER TABLE sessions ADD COLUMN timezone TEXT DEFAULT 'UTC';`);
  }
} catch (e) {
  console.warn('Timezone column migration check warning:', e.message);
}

export function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Handle migration for teams_filter column in groups table
try {
  const groupColumns = db.prepare(`PRAGMA table_info(groups)`).all();
  const hasTeamsFilter = groupColumns.some(c => c.name === 'teams_filter');
  if (!hasTeamsFilter) {
    console.log('Adding teams_filter column to groups table...');
    db.exec(`ALTER TABLE groups ADD COLUMN teams_filter TEXT DEFAULT 'ALL';`);
  }
} catch (e) {
  console.warn('Teams filter migration check warning:', e.message);
}

// Handle migration for passcode column
try {
  const columns = db.prepare(`PRAGMA table_info(players)`).all();
  const hasPasscode = columns.some(c => c.name === 'passcode');
  if (!hasPasscode) {
    console.log('Adding passcode column to players table...');
    db.exec(`ALTER TABLE players ADD COLUMN passcode TEXT DEFAULT '';`);
  }

  // Populate passcodes for any players missing one
  const missingPasscodes = db.prepare(`SELECT id, name FROM players WHERE passcode IS NULL OR passcode = ''`).all();
  const updatePasscode = db.prepare(`UPDATE players SET passcode = ? WHERE id = ?`);
  for (const p of missingPasscodes) {
    const code = generatePasscode();
    updatePasscode.run(code, p.id);
    console.log(`Assigned passcode ${code} to existing player "${p.name}".`);
  }
} catch (e) {
  console.warn('Passcode migration check warning:', e.message);
}

// Handle migration from legacy schema if old players table had group_id column
try {
  const columns = db.prepare(`PRAGMA table_info(players)`).all();
  const hasGroupId = columns.some(c => c.name === 'group_id');
  if (hasGroupId) {
    console.log('Migrating legacy players schema to master players directory...');
    // Copy existing player group assignments to group_players table
    db.exec(`
      INSERT OR IGNORE INTO group_players (group_id, player_id)
      SELECT group_id, id FROM players WHERE group_id IS NOT NULL;
    `);
  }
} catch (e) {
  console.warn('Migration check warning:', e.message);
}

// Seed default group and players if empty
const countGroup = db.prepare('SELECT COUNT(*) as cnt FROM groups').get();
if (countGroup.cnt === 0) {
  const groupRes = db.prepare('INSERT INTO groups (name) VALUES (?)').run('Main League');
  const groupId = groupRes.lastInsertRowid;

  const insertPlayer = db.prepare('INSERT OR IGNORE INTO players (name, passcode) VALUES (?, ?)');
  const assignPlayer = db.prepare('INSERT OR IGNORE INTO group_players (group_id, player_id) VALUES (?, ?)');

  ['Alice', 'Bob', 'Charlie', 'Dave'].forEach(name => {
    const code = generatePasscode();
    const pRes = insertPlayer.run(name, code);
    const pId = pRes.lastInsertRowid || db.prepare('SELECT id FROM players WHERE name = ?').get(name).id;
    assignPlayer.run(groupId, pId);
    console.log(`Seeded player ${name} with passcode: ${code}`);
  });

  console.log('Seeded default "Main League" group with Alice, Bob, Charlie, Dave.');
}

// ─── CREDENTIALS & ENV MANAGEMENT ─────────────────────────────────────────────
export function getAdminPassword() {
  try {
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../.env'),
      path.join(__dirname, '.env'),
      '/home/python/epl_score_predictor/.env'
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
          const [key, ...valParts] = trimmed.split('=');
          if (key.trim() === 'ADMIN_PASSWORD') {
            let val = valParts.join('=').trim();
            if (!val.startsWith('"') && !val.startsWith("'")) {
              val = val.split('#')[0].trim();
            }
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (val) return val;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error reading .env for ADMIN_PASSWORD:', e.message);
  }
  return process.env.ADMIN_PASSWORD || 'admin123';
}

export function syncCredentialsFile() {
  try {
    const adminPassword = getAdminPassword();
    const players = db.prepare('SELECT id, name, passcode, created_at FROM players ORDER BY id ASC').all();

    let content = `============================================================\n`;
    content += `EPL SCORE PREDICTOR — USER CREDENTIALS & PASSWORDS REFERENCE\n`;
    content += `============================================================\n`;
    content += `Last Updated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC\n\n`;

    content += `------------------------------------------------------------\n`;
    content += `ADMINISTRATOR CREDENTIALS:\n`;
    content += `------------------------------------------------------------\n`;
    content += `Role      : Admin\n`;
    content += `Password  : ${adminPassword}\n\n`;

    content += `------------------------------------------------------------\n`;
    content += `PLAYER CREDENTIALS:\n`;
    content += `------------------------------------------------------------\n`;
    content += `ID    | Username                       | Passcode / Password\n`;
    content += `------------------------------------------------------------\n`;

    if (players.length === 0) {
      content += `(No players found)\n`;
    } else {
      for (const p of players) {
        const idStr = String(p.id).padEnd(5, ' ');
        const nameStr = String(p.name).padEnd(30, ' ');
        const passStr = String(p.passcode || 'N/A');
        content += `${idStr}| ${nameStr}| ${passStr}\n`;
      }
    }
    content += `------------------------------------------------------------\n`;
    content += `Total Active Players: ${players.length}\n`;
    content += `============================================================\n`;

    const targetPaths = [
      path.join(dataDir, 'user_credentials.txt'),
      path.join(__dirname, '../user_credentials.txt'),
      path.join(process.cwd(), 'user_credentials.txt'),
      '/home/python/epl_score_predictor/user_credentials.txt'
    ];

    const written = new Set();
    for (const targetPath of targetPaths) {
      if (written.has(targetPath)) continue;
      written.add(targetPath);
      try {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log(`Updated credentials reference file at: ${targetPath}`);
      } catch (err) {
        console.warn(`Could not write credentials file to ${targetPath}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error syncing credentials file:', err.message);
  }
}

// Perform initial sync on DB load
syncCredentialsFile();

// ─── FPL CACHE HELPERS ────────────────────────────────────────────────────────
export function getFplCache(key) {
  try {
    return db.prepare('SELECT key, data, updated_at, dynamic_ttl, match_state FROM fpl_cache WHERE key = ?').get(key) || null;
  } catch (err) {
    console.error('Error reading FPL cache:', err.message);
    return null;
  }
}

export function setFplCache(key, dataString, dynamic_ttl, match_state = 'NORMAL') {
  try {
    const now = Date.now();
    db.prepare(`
      INSERT INTO fpl_cache (key, data, updated_at, dynamic_ttl, match_state)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at,
        dynamic_ttl = excluded.dynamic_ttl,
        match_state = excluded.match_state
    `).run(key, dataString, now, dynamic_ttl, match_state);
  } catch (err) {
    console.error('Error saving FPL cache:', err.message);
  }
}

export default db;

