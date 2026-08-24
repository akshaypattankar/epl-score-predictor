import db, { syncCredentialsFile } from './db.js';

console.log('--- DB PLAYERS ---');
const players = db.prepare('SELECT id, name, passcode, created_at FROM players ORDER BY id ASC').all();
console.table(players);

syncCredentialsFile();
console.log('--- SYNC COMPLETED ---');
