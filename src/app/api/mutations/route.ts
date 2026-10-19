import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { canManageEmployeeWithSession } from '@/lib/permissions';
import { MUTABLE_COLLECTIONS, type MutationRequest } from '@/lib/server-contract';
import type { DemoData } from '@/lib/types';
import { createServerCredential } from '@/server/auth-crypto';
import { makeSnapshot, requireIdentity, resolveSession, stampAuditMetadata, withState } from '@/server/auth';
import { bumpRevision, saveAuthStore, saveData, validateAuthReferences } from '@/server/db/repository';
import { sessions } from '@/server/db/schema';
import { applyMutation } from '@/server/domain';
import { ApiError, apiRoute, jsonResponse, readJson } from '@/server/http';
import { externalizePhotos, PhotoValidationError } from '@/server/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const string = z.string().max(500);
const schema = z.strictObject({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  changes: z.array(z.strictObject({ collection: z.enum(MUTABLE_COLLECTIONS), upsert: z.array(z.record(z.string(), z.unknown())).max(5000).optional(), remove: z.array(string).max(5000).optional() })).max(MUTABLE_COLLECTIONS.length),
  settings: z.strictObject({ centerName: z.string().min(1).max(500), qrInterval: z.number().int().min(1).max(3600) }).optional(),
  audit: z.strictObject({ action: string, entity: string, entityId: string, employeeId: string.optional(), oldValues: z.record(z.string(), z.unknown()).optional(), newValues: z.record(z.string(), z.unknown()).optional() }).optional(),
  password: z.strictObject({ employeeId: string.min(1), value: z.string().min(6).max(512) }).optional(),
  deletion: z.strictObject({ collection: z.enum(MUTABLE_COLLECTIONS), id: string.min(1), reason: z.string().trim().min(3).max(1000), confirmation: z.literal('حذف') }).optional(),
}).refine(value => new Set(value.changes.map(change => change.collection)).size === value.changes.length)
  .refine(value => value.changes.length > 0 || !!value.settings || !!value.password || !!value.deletion);

export async function POST(request: Request) {
  return apiRoute(async () => {
    const input: MutationRequest = await readJson(request, schema);
    const snapshot = await withState(request, async context => {
      const identity = requireIdentity(context);
      if (identity.actor.role === 'QR_DISPLAY') throw new ApiError(403, 'حساب شاشة الحضور مخصص لعرض رمز QR فقط.');
      if (input.revision !== context.revision) throw new ApiError(409, 'تغيّرت البيانات من جهاز آخر. حدّث الصفحة ثم أعد المحاولة.');
      let after: DemoData;
      try { after = applyMutation(context.data, identity.actor, input, context.now); }
      catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'تعذر تطبيق التعديل.'); }
      const auth = structuredClone(context.auth);
      const revoked = new Set<string>();
      for (const employee of context.data.employees) {
        const next = after.employees.find(row => row.id === employee.id);
        if (!next || next.active !== employee.active || next.role !== employee.role || next.username !== employee.username || JSON.stringify(next.permissions ?? {}) !== JSON.stringify(employee.permissions ?? {})) revoked.add(employee.id);
      }
      const deletedEmployeeIds = new Set(context.data.employees.filter(employee => !after.employees.some(row => row.id === employee.id)).map(employee => employee.id));
      for (const employeeId of deletedEmployeeIds) delete auth.employees[employeeId];
      if (input.password) {
        const target = after.employees.find(row => row.id === input.password!.employeeId);
        const previous = context.data.employees.find(row => row.id === input.password!.employeeId);
        const action = previous ? 'edit' : 'create';
        if (!target || !canManageEmployeeWithSession(context.data, identity.actor, target.role, action) || (previous && !canManageEmployeeWithSession(context.data, identity.actor, previous.role, 'edit'))) {
          throw new ApiError(403, 'لا تملك صلاحية تغيير كلمة مرور هذا الحساب.');
        }
        auth.employees[target.id] = await createServerCredential(input.password.value, auth.employees[target.id]?.version ?? 0, context.now);
        revoked.add(target.id);
      }
      try { validateAuthReferences(after, auth, false); }
      catch { throw new ApiError(400, 'بيانات الحسابات أو أسماء المستخدمين غير صالحة أو مكررة.'); }
      stampAuditMetadata(request, context.data, after);
      try { after = await externalizePhotos(after); }
      catch (error) { if (error instanceof PhotoValidationError) throw new ApiError(400, error.message); throw error; }
      await saveData(context.tx, context.data, after);
      if (input.password || deletedEmployeeIds.size) await saveAuthStore(context.tx, auth);
      if (revoked.size) await context.tx.delete(sessions).where(inArray(sessions.accountKey, [...revoked]));
      const revision = await bumpRevision(context.tx);
      const currentIdentity = await resolveSession(context.tx, request, after, auth, context.now);
      return makeSnapshot({ ...context, data: after, auth, revision, identity: currentIdentity });
    });
    return jsonResponse(snapshot);
  });
}
