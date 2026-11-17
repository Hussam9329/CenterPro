import { registerOTel } from '@vercel/otel';

/** OpenTelemetry for the server: Next.js route and fetch spans plus the
 * `centerpro.db` spans from withDatabase. Traces reach Vercel when tracing or a
 * trace drain is enabled for the project, otherwise they are dropped at no cost. */
export function register() {
  registerOTel({ serviceName: 'centerpro' });
}
