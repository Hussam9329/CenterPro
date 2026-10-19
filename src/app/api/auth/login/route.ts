import { z } from 'zod';
import { login, setSessionCookie } from '@/server/auth';
import { apiRoute, jsonResponse, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.strictObject({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(512), remember: z.boolean() });
export async function POST(request: Request) {
  return apiRoute(async () => {
    const input = await readJson(request, schema, 4096);
    const outcome = await login(request, input);
    if (!outcome.ok) {
      const response = jsonResponse({ error: outcome.error }, outcome.status);
      if (outcome.status === 429) response.headers.set('Retry-After', String(outcome.retryAfterSeconds ?? 900));
      return response;
    }
    const response = jsonResponse(outcome.snapshot);
    setSessionCookie(response, outcome.token, outcome.remembered);
    return response;
  });
}
