import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { withDatabase } from '../src/server/db/connection';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) throw new Error('Usage: npm run db:migrate -- [--check]');
  const migration = await readFile(new URL('../drizzle/0001_centerpro.sql', import.meta.url), 'utf8');
  const digest = createHash('sha256').update(migration).digest('hex');
  const result = await withDatabase(db => db.transaction(async tx => {
    if (args.includes('--check')) {
      const existing = await tx.execute<{ present: boolean }>(sql`select exists(select 1 from information_schema.tables where table_schema = 'centerpro' and table_name = '_migrations') as present`);
      if (!existing.rows[0]?.present) return 'PENDING';
      const applied = await tx.execute<{ digest: string }>(sql`select digest from centerpro._migrations where id = '0001_centerpro'`);
      if (!applied.rows.length) return 'PENDING';
      if (applied.rows[0].digest !== digest) throw new Error('Applied migration checksum mismatch.');
      return 'CURRENT';
    }
    await tx.execute(sql`select pg_advisory_xact_lock(527518151)`);
    await tx.execute(sql`create schema if not exists centerpro`);
    await tx.execute(sql`create table if not exists centerpro._migrations (id text primary key, digest text not null, applied_at timestamptz not null default now())`);
    const applied = await tx.execute<{ digest: string }>(sql`select digest from centerpro._migrations where id = '0001_centerpro'`);
    if (applied.rows.length) {
      if (applied.rows[0].digest !== digest) throw new Error('Applied migration checksum mismatch.');
      return 'ALREADY_CURRENT';
    }
    await tx.execute(sql.raw(migration));
    await tx.execute(sql`insert into centerpro._migrations(id, digest) values ('0001_centerpro', ${digest})`);
    await tx.execute(sql`revoke all on centerpro._migrations from public`);
    return 'MIGRATED_EMPTY_SCHEMA';
  }));
  console.log(JSON.stringify({ status: result, migration: '0001_centerpro', digest }));
}

void main().catch(() => { console.error('Database migration failed. No partial migration was committed; check configuration, connectivity and migration checksum.'); process.exitCode = 1; });
