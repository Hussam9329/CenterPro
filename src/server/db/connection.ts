import { SpanStatusCode, trace } from '@opentelemetry/api';
import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Db = NeonDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/** Database work slower than this is logged, so it shows up in Vercel logs even without a trace exporter. */
export const SLOW_DATABASE_MS = 1_000;
const tracer = trace.getTracer('centerpro');

/** Connections never cross a serverless request boundary. No startup migration or seed. */
export async function withDatabase<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');
  return tracer.startActiveSpan('centerpro.db', async span => {
    const started = performance.now();
    const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 15_000 });
    try {
      return await operation(drizzle({ client: pool, schema }));
    } catch (error) {
      // Status only: driver errors can carry SQL and row values, which must not reach telemetry.
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      await pool.end();
      const ms = Math.round(performance.now() - started);
      span.setAttribute('centerpro.db.duration_ms', ms);
      if (ms >= SLOW_DATABASE_MS) console.warn(`[centerpro] slow database operation: ${ms} ms`);
      span.end();
    }
  });
}
