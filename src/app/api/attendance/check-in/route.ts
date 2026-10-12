import { z } from 'zod';
import { getOpenWorkday } from '@/lib/attendance';
import { requireIdentity, stampAuditMetadata, withState } from '@/server/auth';
import { verifyQr } from '@/server/auth-crypto';
import { bumpRevision, saveData } from '@/server/db/repository';
import { recordQrAttendance } from '@/server/domain';
import { ApiError, apiRoute, jsonResponse, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return apiRoute(async () => {
    const input = await readJson(request, z.strictObject({ token: z.string().min(1).max(2048) }), 4096);
    return jsonResponse(await withState(request, async context => {
      const identity = requireIdentity(context);
      if (identity.actor.role !== 'EMPLOYEE' || !identity.actor.employeeId) throw new ApiError(403, 'تسجيل الحضور متاح من حساب الموظف نفسه فقط.');
      const workday = getOpenWorkday(context.data.workdays);
      if (!workday || !verifyQr(input.token, workday, context.now.getTime())) throw new ApiError(400, 'رمز الحضور غير صالح أو انتهت صلاحيته. امسح الرمز الحالي.');
      const previous = context.data.attendance.find(row => row.workdayId === workday.id && row.employeeId === identity.actor.employeeId);
      let after;
      try { after = recordQrAttendance(context.data, identity.actor, workday.id, context.now); }
      catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'تعذر تسجيل الحضور.'); }
      const record = after.attendance.find(row => row.workdayId === workday.id && row.employeeId === identity.actor.employeeId);
      if (!record?.checkIn) throw new ApiError(400, previous?.status === 'PRESENT' ? 'حضورك مسجل مسبقاً لهذا اليوم.' : 'تعذر تسجيل الحضور.');
      const duplicate = previous?.status === 'PRESENT';
      if (!duplicate) { stampAuditMetadata(request, context.data, after); await saveData(context.tx, context.data, after); await bumpRevision(context.tx); }
      return { checkIn: record.checkIn, duplicate };
    }));
  });
}
