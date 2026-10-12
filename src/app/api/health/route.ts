import { withState } from '@/server/auth';
import { apiRoute, jsonResponse } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => jsonResponse(await withState(request, async context => ({ database: 'connected', migration: 1, configured: !!context.auth.system }))));
}
