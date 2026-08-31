// server/backup.js - CLI & Cron Database Backup Utility
import { backupDatabase, listBackups } from './db.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.includes('-l')) {
    console.log('📦 Existing Database Backups:');
    const backups = listBackups();
    if (backups.length === 0) {
      console.log('  No backup snapshots found in data/backups/');
    } else {
      backups.forEach((b, idx) => {
        console.log(`  [${idx + 1}] ${b.filename.padEnd(46)} ${b.sizeFormatted.padStart(10)} (${b.createdAt})`);
      });
      console.log(`Total: ${backups.length} backup(s)`);
    }
    process.exit(0);
  }

  console.log('🔄 Creating hot point-in-time SQLite database snapshot...');
  try {
    const result = await backupDatabase();
    console.log('🎉 Database backup complete!');
    console.log(`   File     : ${result.filename}`);
    console.log(`   Size     : ${result.sizeFormatted}`);
    console.log(`   Location : ${result.path}`);
    console.log(`   Retained : ${result.retainedBackups} backup snapshot(s) in rotation`);
    if (result.prunedCount > 0) {
      console.log(`   Pruned   : ${result.prunedCount} old snapshot(s) according to retention policy`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Database backup failed:', err.message);
    process.exit(1);
  }
}

main();
