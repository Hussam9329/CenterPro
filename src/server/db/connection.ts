import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Db = NeonDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/** Connections never cross a serverless request boundary. No startup migration or seed. */
export async function withDatabase<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 15_000 });
  try {
    return await operation(drizzle({ client: pool, schema }));
  } finally {
    await pool.end();
  }
}
