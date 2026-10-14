import { getOpenWorkday } from '@/lib/attendance';
import { baghdadDate, requireIdentity, withState } from '@/server/auth';
import { issueQr } from '@/server/auth-crypto';
import { ApiError, apiRoute, jsonResponse } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return apiRoute(async () => jsonResponse(await withState(request, async context => {
    const role = requireIdentity(context).actor.role;
    if (!['SUPER_ADMIN', 'ADMIN', 'QR_DISPLAY'].includes(role)) throw new ApiError(403, 'لا تملك صلاحية عرض رمز الحضور.');
    const workday = getOpenWorkday(context.data.workdays);
    if (!workday || workday.date !== baghdadDate(context.now)) throw new ApiError(400, 'لا يوجد يوم حضور مفتوح بتاريخ اليوم.');
    if (context.data.months.some(month => month.month === workday.date.slice(0, 7) && month.state !== 'OPEN')) throw new ApiError(400, 'الشهر محمي ولا يقبل تسجيل الحضور الذاتي.');
    return issueQr(workday, context.data.settings.qrInterval, context.now.getTime());
  })));
}
