import { asc, eq } from 'drizzle-orm';
import { AUTH_SCHEMA_VERSION, assertAuthStoreForBackup, type AuthStore, type StoredQrDisplayCredential, type StoredSystemCredential } from '@/lib/local-auth';
import type { DbExecutor } from './connection';
import * as schema from './schema';
import { loadData } from './data-repository';
import { validateAuthReferences } from './reference-validation';

export async function loadAuthStore(db: DbExecutor): Promise<AuthStore> {
  const rows = await db.select().from(schema.credentials).orderBy(asc(schema.credentials.accountKey));
  const auth: AuthStore = { schema: AUTH_SCHEMA_VERSION, system: null, employees: {} };
  for (const row of rows) {
    if (row.accountKey === 'SYSTEM') auth.system = row.credential as StoredSystemCredential;
    else if (row.accountKey === 'QR_DISPLAY') auth.qrDisplay = row.credential as StoredQrDisplayCredential;
    else auth.employees[row.accountKey] = row.credential;
  }
  assertAuthStoreForBackup(auth);
  return auth;
}

export async function saveAuthStore(db: DbExecutor, auth: AuthStore): Promise<void> {
  assertAuthStoreForBackup(auth);
  const data = await loadData(db);
  validateAuthReferences(data, auth, false);
  const desired = [ ...(auth.system ? [{ accountKey: 'SYSTEM', employeeId: null, credential: auth.system }] : []),
    ...(auth.qrDisplay ? [{ accountKey: 'QR_DISPLAY', employeeId: null, credential: auth.qrDisplay }] : []),
    ...Object.entries(auth.employees).map(([id, credential]) => ({ accountKey: id, employeeId: id, credential })) ];
  const existing = await db.select().from(schema.credentials);
  const old = new Map(existing.map(row => [row.accountKey, row.credential]));
  const ids = new Set(desired.map(row => row.accountKey));
  for (const row of existing) if (!ids.has(row.accountKey)) await db.delete(schema.credentials).where(eq(schema.credentials.accountKey, row.accountKey));
  for (const row of desired) if (JSON.stringify(old.get(row.accountKey)) !== JSON.stringify(row.credential)) {
    await db.insert(schema.credentials).values(row).onConflictDoUpdate({ target: schema.credentials.accountKey, set: { credential: row.credential, employeeId: row.employeeId } });
  }
}
