import { eq } from 'drizzle-orm';
import { parseSystemBackup, type SystemBackup } from '@/lib/system-backup';
import { assertEvaluationState } from '@/lib/evaluations';
import { validateSalaryConfig } from '@/lib/payroll';
import { externalizePhotos, validatePhotoData } from '@/server/photos';
import type { DbExecutor } from './connection';
import { state, imports, sessions } from './schema';
import { DataReferenceError, dataCounts, loadAuthStore, loadData, lockState, saveAuthStore, saveData, validateAuthReferences, validateDataReferences } from './repository';

export function validateImport(backup: SystemBackup): void {
  validateDataReferences(backup.payload.data);
  validateAuthReferences(backup.payload.data, backup.payload.authentication.credentials);
  validatePhotoData(backup.payload.data, true);
  const issues: Record<string, number> = {};
  // A backup can preserve malformed legacy records for recovery. An import must
  // not install a state which the server would reject on every later mutation.
  // Report incompatibility; never silently repair historical or financial data.
  try { assertEvaluationState(backup.payload.data); } catch { issues['evaluations.invalidState'] = 1; }
  for (const department of backup.payload.data.departments) {
    try { validateSalaryConfig(department.salary); } catch { issues['departments.invalidSalaryConfig'] = (issues['departments.invalidSalaryConfig'] ?? 0) + 1; }
  }
  if (Object.keys(issues).length) throw new DataReferenceError(issues);
}

export async function inspectBackup(text: string) {
  const backup = await parseSystemBackup(text);
  validateImport(backup);
  return { backup, summary: {
    digest: backup.integrity.digest, exportedAt: backup.payload.exportedAt,
    sourceRevision: backup.payload.source.revision, counts: dataCounts(backup.payload.data),
    employeeCredentials: Object.keys(backup.payload.authentication.credentials.employees).length,
    hasSystemOwner: backup.payload.authentication.credentials.system !== null,
  } };
}

/** Caller MUST wrap in one transaction. Empty-only import never merges or resets.
 * Retry of an already imported digest is a no-op, even after subsequent user work. */
export async function importBackup(db: DbExecutor, backup: SystemBackup): Promise<'IMPORTED' | 'ALREADY_IMPORTED'> {
  // Enforce integrity even for programmatic callers that bypass the CLI inspector.
  await parseSystemBackup(JSON.stringify(backup));
  validateImport(backup);
  const revision = await lockState(db);
  const prior = await db.select({ digest: imports.digest }).from(imports).where(eq(imports.digest, backup.integrity.digest));
  if (prior.length) return 'ALREADY_IMPORTED';
  const before = await loadData(db);
  const auth = await loadAuthStore(db);
  const currentImports = await db.select({ digest: imports.digest }).from(imports).limit(1);
  const currentSessions = await db.select({ token: sessions.tokenHash }).from(sessions).limit(1);
  if (revision !== 0 || Object.values(dataCounts(before)).some(count => count > 0) || auth.system || Object.keys(auth.employees).length || currentImports.length || currentSessions.length) {
    throw new Error('Import refused: this database already contains data or accounts. Nothing was changed. Use a reviewed merge migration; never reset the database.');
  }
  const storedData = await externalizePhotos(backup.payload.data);
  await saveData(db, before, storedData);
  await saveAuthStore(db, backup.payload.authentication.credentials);
  // Backup metadata never becomes a business record or an authenticated session.
  await db.update(state).set({ revision: Math.max(1, backup.payload.source.revision) }).where(eq(state.id, 1));
  await db.insert(imports).values({ digest: backup.integrity.digest, sourceRevision: backup.payload.source.revision, counts: dataCounts(backup.payload.data), metadata: { exportedAt: backup.payload.exportedAt, source: backup.payload.source, preferences: backup.payload.preferences, passwordKdf: backup.payload.authentication.passwordKdf } });
  return 'IMPORTED';
}
