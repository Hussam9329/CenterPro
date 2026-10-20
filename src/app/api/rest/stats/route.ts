import { withState } from '@/server/auth';
import { apiRoute, jsonResponse } from '@/server/http';
import { restStatistics } from '@/server/rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => {
    const raw = new URL(request.url).searchParams.get('days');
    const days = raw && ['7', '30', '90'].includes(raw) ? Number(raw) : null;
    return jsonResponse(await withState(request, context => restStatistics(context, days)));
  });
}
