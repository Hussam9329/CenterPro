import { createSystemBackup, systemBackupFilename } from '@/lib/system-backup';
import { requireIdentity, withState } from '@/server/auth';
import { ApiError, apiRoute, jsonResponse } from '@/server/http';
import { inlinePhotos } from '@/server/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => {
    const theme = new URL(request.url).searchParams.get('theme');
    if (theme !== null && theme !== 'light' && theme !== 'dark') throw new ApiError(400, 'إعداد المظهر غير صالح.');
    const backup = await withState(request, async context => {
      if (requireIdentity(context).actor.role !== 'SUPER_ADMIN') throw new ApiError(403, 'تحميل النسخة الكاملة متاح لمدير النظام فقط.');
      return createSystemBackup({ data: await inlinePhotos(context.data), auth: context.auth, theme, revision: context.revision, origin: new URL(request.url).origin, exportedAt: context.now.toISOString() });
    });
    const response = jsonResponse(backup);
    response.headers.set('Content-Disposition', `attachment; filename="${systemBackupFilename(backup.payload.exportedAt)}"`);
    return response;
  });
}
