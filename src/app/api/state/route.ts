import type { RemoteUnchanged } from '@/lib/server-contract';
import { baghdadDate, makeSnapshot, withReadState } from '@/server/auth';
import { loadData } from '@/server/db/repository';
import { apiRoute, jsonResponse } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every write bumps the revision, so a signed-in reader that already holds the
 * current revision gets a tiny answer instead of the whole document. */
function knownRevision(request: Request): number | null {
  const value = new URL(request.url).searchParams.get('revision');
  return value !== null && /^\d{1,15}$/.test(value) ? Number(value) : null;
}

export async function GET(request: Request) {
  const known = knownRevision(request);
  return apiRoute(async () => jsonResponse(await withReadState(request, [], async context => {
    if (context.identity && known === context.revision) {
      const today = baghdadDate(context.now);
      return {
        unchanged: true, session: context.identity.actor, revision: context.revision, remembered: context.identity.remembered,
        today, month: today.slice(0, 7), serverTime: context.now.toISOString(),
      } satisfies RemoteUnchanged;
    }
    return makeSnapshot({ ...context, data: await loadData(context.tx) });
  })));
}
