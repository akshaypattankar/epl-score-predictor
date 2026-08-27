import db, { syncCredentialsFile } from './db.js';

console.log('=== EPL SCORE PREDICTOR - DUMPING USER CREDENTIALS ===');
const players = db.prepare('SELECT id, name, passcode, created_at FROM players ORDER BY id ASC').all();
console.table(players);

syncCredentialsFile();
console.log(`Successfully dumped credentials for ${players.length} active player(s).`);
console.log('========================================================');

