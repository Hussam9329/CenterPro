import { asc, eq, sql, type SQL } from 'drizzle-orm';
import type { DemoData } from '@/lib/types';
import { assertPhotosExternalized } from '@/server/photos';
import type { DbExecutor } from './connection';
import * as schema from './schema';
import { collectionNames, descriptors, type CollectionName } from './collections';
import { validateDataReferences } from './reference-validation';

type JsonRecord = { id: string; [key: string]: unknown };

/** Every writer must call this first in its transaction; never use a browser revision as a lock. */
export async function lockState(db: DbExecutor): Promise<number> {
  const rows = await db.select({ revision: schema.state.revision }).from(schema.state).where(eq(schema.state.id, 1)).for('update');
  if (!rows[0]) throw new Error('Database has not been migrated.');
  return rows[0].revision;
}

export async function bumpRevision(db: DbExecutor): Promise<number> {
  const rows = await db.update(schema.state).set({ revision: sql`${schema.state.revision} + 1` }).where(eq(schema.state.id, 1)).returning({ revision: schema.state.revision });
  if (!rows[0]) throw new Error('Database has not been migrated.');
  return rows[0].revision;
}

/** Use inside a transaction (lockState for writes; repeatable-read for plain reads). */
export async function loadData(db: DbExecutor): Promise<DemoData> {
  const rows = await db.select().from(schema.state).where(eq(schema.state.id, 1));
  if (!rows[0]) throw new Error('Database has not been migrated.');
  const data: Record<string, unknown> = { ...rows[0].extras, settings: rows[0].settings };
  for (const name of collectionNames) {
    const table = schema[name];
    data[name] = (await db.select({ record: table.record }).from(table).orderBy(asc(table.position), asc(table.id))).map(row => row.record);
  }
  return data as unknown as DemoData;
}

function recordArray(data: DemoData, name: CollectionName): JsonRecord[] { return data[name] as unknown as JsonRecord[]; }
function qualifiedTable(name: CollectionName): SQL { return sql`${sql.identifier('centerpro')}.${sql.identifier(descriptors[name].table)}`; }

/** Diff only changed records. The JSON document is authoritative for full fidelity.
 * Must run under lockState in the SAME transaction as authorization and revision. */
export async function saveData(db: DbExecutor, before: DemoData, after: DemoData): Promise<void> {
  validateDataReferences(after);
  assertPhotosExternalized(after);
  // Child deletions first, parent insertions first. Deferred FKs allow one atomic
  // command to move employees or correct references without a transient failure.
  await db.execute(sql`set constraints all deferred`);
  const previousOpen = before.workdays.find(row => row.state === 'OPEN');
  if (previousOpen && after.workdays.find(row => row.id === previousOpen.id)?.state !== 'OPEN') {
    await db.update(schema.workdays).set({ status: 'CLOSED' }).where(eq(schema.workdays.id, previousOpen.id));
  }
  for (const name of [...collectionNames].reverse()) {
    const retained = new Set(recordArray(after, name).map(row => row.id));
    const removed = recordArray(before, name).filter(row => !retained.has(row.id)).map(row => row.id);
    if (removed.length) await db.execute(sql`delete from ${qualifiedTable(name)} where id in (${sql.join(removed.map(id => sql`${id}`), sql`, `)})`);
  }
  for (const name of collectionNames) {
    const old = new Map(recordArray(before, name).map((record, position) => [record.id, { json: JSON.stringify(record), position }]));
    const changed = recordArray(after, name).map((record, position) => ({ record, position, json: JSON.stringify(record) }))
      .filter(row => old.get(row.record.id)?.json !== row.json || old.get(row.record.id)?.position !== row.position);
    const projection = Object.entries(descriptors[name].columns);
    const columns = ['id', 'position', 'record', ...projection.map(([column]) => column)];
    for (let offset = 0; offset < changed.length; offset += 200) {
      const values = changed.slice(offset, offset + 200).map(row => {
        const cells = [sql`${row.record.id}`, sql`${row.position}`, sql`${row.json}::jsonb`, ...projection.map(([, key]) => sql`${row.record[key] ?? null}`)];
        return sql`(${sql.join(cells, sql`, `)})`;
      });
      if (!values.length) continue;
      const assignments = columns.slice(1).map(column => sql`${sql.identifier(column)} = excluded.${sql.identifier(column)}`);
      await db.execute(sql`insert into ${qualifiedTable(name)} (${sql.join(columns.map(column => sql.identifier(column)), sql`, `)}) values ${sql.join(values, sql`, `)} on conflict (id) do update set ${sql.join(assignments, sql`, `)}`);
    }
  }
  const extras = Object.fromEntries(Object.entries(after).filter(([key]) => key !== 'settings' && !collectionNames.includes(key as CollectionName)));
  await db.update(schema.state).set({ settings: after.settings, extras }).where(eq(schema.state.id, 1));
}

export function dataCounts(data: DemoData): Record<CollectionName, number> {
  return Object.fromEntries(collectionNames.map(name => [name, data[name].length])) as Record<CollectionName, number>;
}
