import { NextResponse } from 'next/server';
import { requireIdentity, withState } from '@/server/auth';
import { ApiError, apiRoute } from '@/server/http';
import { projectData } from '@/server/projection';
import { photoHashes, readPhoto } from '@/server/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ hash: string }> }) {
  return apiRoute(async () => {
    const { hash } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new ApiError(404, 'الصورة غير موجودة.');
    await withState(request, async state => {
      const identity = requireIdentity(state);
      // A guessed content hash is not access. Apply exactly the same record
      // projection as /api/state before allowing this binary resource.
      if (!photoHashes(projectData(state.data, identity.actor)).has(hash)) throw new ApiError(404, 'الصورة غير موجودة.');
    });
    const photo = await readPhoto(hash);
    if (!photo) throw new ApiError(404, 'الصورة غير موجودة.');
    return new NextResponse(new Uint8Array(photo.bytes), { headers: {
      'Content-Type': photo.contentType,
      'Content-Length': String(photo.bytes.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      Vary: 'Cookie',
    } });
  });
}
