import { isIP } from 'node:net';
import type { DemoData } from '@/lib/types';

export function trustedRequestIp(request: Request): string | null {
  // Vercel overwrites this header at its edge. Generic X-Forwarded-For supplied
  // by a caller is not an authority for the rate-limit bucket.
  const value = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim().slice(0, 64) : undefined;
  return value && isIP(value) ? value : null;
}

export function stampAuditMetadata(request: Request, before: DemoData, after: DemoData): void {
  const existing = new Set(before.audit.map(row => row.id));
  const ip = trustedRequestIp(request);
  const userAgent = request.headers.get('user-agent')?.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500);
  for (const row of after.audit) if (!existing.has(row.id)) {
    if (ip) row.ip = ip;
    if (userAgent) row.userAgent = userAgent;
  }
}
