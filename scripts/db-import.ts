import { readFile } from 'node:fs/promises';
import { withDatabase } from '../src/server/db/connection';
import { importBackup, inspectBackup } from '../src/server/db/import-backup';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter(arg => arg !== '--dry-run');
  if (files.length !== 1 || files[0].startsWith('--')) throw new Error('Usage: npm run db:import -- /path/to/CenterPro-backup.json [--dry-run]');
  const { backup, summary } = await inspectBackup(await readFile(files[0], 'utf8'));
  // Counts/digest only. Credentials and personal details must never enter logs.
  if (dryRun) { console.log(JSON.stringify({ status: 'VALIDATED_WITHOUT_DATABASE_ACCESS', ...summary }, null, 2)); return; }
  const status = await withDatabase(db => db.transaction(tx => importBackup(tx, backup)));
  console.log(JSON.stringify({ status, ...summary }, null, 2));
}

void main().catch(error => {
  // Database errors can contain bound parameter values; do not log their cause.
  const known = error instanceof Error && (error.name === 'DataReferenceError' || error.name === 'PhotoValidationError' || /^(Usage:|Import refused:|ملف |بيانات |تعذر |تحتوي |النسخة )/.test(error.message));
  console.error(known ? error.message : 'Backup import failed. No partial data was committed; check configuration and database constraints.');
  process.exitCode = 1;
});
