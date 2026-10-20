import { z } from 'zod';
import { GAME_IDS } from '@/lib/rest/games';
import { withState } from '@/server/auth';
import { apiRoute, jsonResponse, readJson } from '@/server/http';
import { recordPlay } from '@/server/rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.strictObject({
  id: z.uuid(), game: z.enum(GAME_IDS), startedAt: z.iso.datetime(),
  durationMs: z.number().int(), score: z.number().int(), outcome: z.enum(['win', 'loss', 'draw', 'end']),
});
export async function POST(request: Request) {
  return apiRoute(async () => {
    const input = await readJson(request, schema, 2048);
    return jsonResponse(await withState(request, context => recordPlay(context, input)));
  });
}
