import { withState } from '@/server/auth';
import { apiRoute, jsonResponse } from '@/server/http';
import { restOverview } from '@/server/rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => jsonResponse(await withState(request, context => restOverview(context))));
}
