import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { clearSessionCookie, makeSnapshot, readSessionToken, withState } from '@/server/auth';
import { hashSessionToken } from '@/server/auth-crypto';
import { sessions } from '@/server/db/schema';
import { apiRoute, jsonResponse, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return apiRoute(async () => {
    await readJson(request, z.strictObject({}), 256);
    const snapshot = await withState(request, async context => {
      const token = readSessionToken(request);
      if (token) await context.tx.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
      return makeSnapshot({ ...context, identity: null });
    });
    const response = jsonResponse(snapshot);
    clearSessionCookie(response);
    return response;
  });
}
