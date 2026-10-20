import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeUsername } from '@/lib/local-auth';
import { createServerCredential } from '@/server/auth-crypto';
import { makeSnapshot, requireIdentity, resolveSession, stampAuditMetadata, withState } from '@/server/auth';
import { bumpRevision, saveAuthStore, saveData } from '@/server/db/repository';
import { sessions } from '@/server/db/schema';
import { ApiError, apiRoute, jsonResponse, readJson } from '@/server/http';
import { passwordProblem } from '@/lib/password-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.strictObject({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  username: z.string().trim().min(1).max(100).refine(value => !/\s/.test(value), 'اسم المستخدم لا يقبل المسافات.'),
  password: z.string().max(512).optional(),
  active: z.boolean(),
});

export async function POST(request: Request) {
  return apiRoute(async () => {
    const input = await readJson(request, schema, 4096);
    const snapshot = await withState(request, async context => {
      const identity = requireIdentity(context);
      if (identity.actor.role !== 'SUPER_ADMIN') throw new ApiError(403, 'إدارة حساب شاشة الحضور متاحة للمشرف العام فقط.');
      if (input.revision !== context.revision) throw new ApiError(409, 'تغيّرت البيانات من جهاز آخر. حدّث الصفحة ثم أعد المحاولة.');
      const clean = input.username.trim();
      const normalized = normalizeUsername(clean);
      if (context.auth.system && normalizeUsername(context.auth.system.username) === normalized) throw new ApiError(400, 'اسم المستخدم مستخدم لحساب مدير النظام.');
      if (context.data.employees.some(employee => normalizeUsername(employee.username) === normalized)) throw new ApiError(400, 'اسم المستخدم مستخدم لحساب آخر.');
      const previous = context.auth.qrDisplay;
      if (!previous && !input.password) throw new ApiError(400, 'أدخل كلمة مرور حساب شاشة الحضور.');
      const passwordIssue = input.password ? passwordProblem(input.password, normalized) : null;
      if (passwordIssue) throw new ApiError(400, passwordIssue);

      const auth = structuredClone(context.auth);
      const base = input.password
        ? await createServerCredential(input.password, previous?.version ?? 0, context.now)
        : previous!;
      auth.qrDisplay = { ...base, username: clean, active: input.active };

      const after = structuredClone(context.data);
      after.audit.unshift({
        id: randomUUID(), actor: identity.actor.name, role: identity.actor.role,
        action: previous ? 'تعديل حساب شاشة الحضور' : 'إنشاء حساب شاشة الحضور',
        entity: 'qr-display-account', entityId: 'QR_DISPLAY',
        oldValues: previous ? { username: previous.username, active: previous.active } : {},
        newValues: { username: clean, active: input.active, passwordChanged: Boolean(input.password) },
        timestamp: context.now.toISOString(),
      });
      stampAuditMetadata(request, context.data, after);
      await saveData(context.tx, context.data, after);
      await saveAuthStore(context.tx, auth);
      await context.tx.delete(sessions).where(eq(sessions.accountKey, 'QR_DISPLAY'));
      const revision = await bumpRevision(context.tx);
      const currentIdentity = await resolveSession(context.tx, request, after, auth, context.now);
      return makeSnapshot({ ...context, data: after, auth, revision, identity: currentIdentity });
    });
    return jsonResponse(snapshot);
  });
}
