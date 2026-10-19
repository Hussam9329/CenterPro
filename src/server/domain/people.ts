import { canManageEmployeeAccount, hasEmployeePermission } from '@/lib/permissions';
import { validateSalaryConfig } from '@/lib/payroll';
import type { DemoData, Employee } from '@/lib/types';
import { settingsSchema } from './schemas';
import { fail, put, requireSuper, same, unchanged, type MutationContext } from './shared';

/** Canonical settings, department policy and employee/account profile changes. */
export function applyPeopleChanges(context: MutationContext) {
  const { before, after, actor, request, upserts, stamp, today } = context;
  if (request.settings) {
    if (actor.role === 'EMPLOYEE') {
      const employee = before.employees.find(item => item.id === actor.employeeId);
      if (!hasEmployeePermission(employee, 'SETTINGS', 'edit')) fail('ليس لديك صلاحية تعديل الإعدادات.');
    } else requireSuper(actor);
    const parsed = settingsSchema.safeParse(request.settings);
    if (!parsed.success) fail('تحقق من اسم المركز ومدة صلاحية رمز الحضور (30–60 ثانية).');
    after.settings = parsed.data;
  }
  for (const value of upserts.get('departments') ?? []) {
    const item = value as unknown as DemoData['departments'][number];
    const previous = before.departments.find(department => department.id === item.id);
    if (actor.role === 'EMPLOYEE') {
      const employee = before.employees.find(row => row.id === actor.employeeId);
      if (!hasEmployeePermission(employee, 'DEPARTMENTS', previous ? 'edit' : 'create')) fail('ليس لديك صلاحية إدارة الأقسام.');
    } else requireSuper(actor);
    validateSalaryConfig(item.salary); put(after, 'departments', value);
  }
  for (const value of upserts.get('employees') ?? []) {
    const item = value as unknown as Employee; const previous = before.employees.find(employee => employee.id === item.id);
    // Employee upserts are complete editable profiles. JSON omits undefined
    // photo fields, so absence means the form explicitly removed the image;
    // do not inherit the previous reference while preserving extension fields.
    const submittedProfile = request.changes.find(change => change.collection === 'employees')?.upsert?.find(record => record.id === item.id);
    if (submittedProfile?.photo === undefined) delete item.photo;
    const delegatedEmployee = before.employees.find(row => row.id === actor.employeeId);
    const action = previous ? 'edit' : 'create';
    const canManage = canManageEmployeeAccount(actor.role, previous?.role ?? item.role) || (actor.role === 'EMPLOYEE' && (previous?.role ?? item.role) === 'EMPLOYEE' && hasEmployeePermission(delegatedEmployee, 'EMPLOYEES', action));
    if (!canManage) fail('ليس لديك صلاحية إدارة هذا الحساب.');
    if (actor.role !== 'SUPER_ADMIN') {
      if (item.role !== 'EMPLOYEE') fail();
      const submittedPermissions = Boolean(submittedProfile && Object.prototype.hasOwnProperty.call(submittedProfile, 'permissions'));
      if (submittedPermissions && !same(previous?.permissions, item.permissions)) fail('إدارة صلاحيات الحساب متاحة للمشرف العام فقط.');
      // Delegated employee managers do not receive other employees' permission
      // maps in their projected data. Preserve the hidden canonical value when
      // the field is omitted instead of interpreting omission as a revoke.
      item.permissions = previous?.permissions;
      unchanged(previous ?? { role: 'EMPLOYEE', permissions: undefined, fixedOverride: false, fixedSalary: 0, dailyRateOverride: null }, item, ['role', 'permissions', 'fixedOverride', 'fixedSalary', 'dailyRateOverride']);
    }
    if (previous) {
      unchanged(previous, item, ['code', 'createdAt']);
      item.createdAt = previous.createdAt;
    } else {
      if (request.password?.employeeId !== item.id) fail('أدخل كلمة مرور أولية لحساب الموظف.');
      const next = Math.max(0, ...after.employees.map(employee => Number(employee.code.replace(/^CP-/, '')) || 0)) + 1;
      item.code = `CP-${String(next).padStart(4, '0')}`; item.createdAt = stamp;
    }
    const department = after.departments.find(department => department.id === item.departmentId);
    if (!department || (!department.active && previous?.departmentId !== department.id)) fail('اختر قسماً نشطاً للموظف.');
    if (item.birthDate && item.birthDate > today) fail('تاريخ الميلاد يجب أن يكون في الماضي.');
    if (item.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.photo)
      && !(item.photo === previous?.photo && /^\/api\/photos\/[a-f0-9]{64}$/.test(item.photo))) fail('اختر صورة PNG أو JPG أو WebP صالحة.');
    if (!previous || item.active !== previous.active) item.endDate = item.active ? undefined : today;
    else item.endDate = previous.endDate;
    if (item.endDate && item.endDate < item.startDate) fail('تاريخ انتهاء العمل لا يسبق تاريخ المباشرة.');
    item.updatedAt = stamp; put(after, 'employees', value);
  }
  if (request.password) {
    const employee = after.employees.find(item => item.id === request.password!.employeeId);
    const previous = before.employees.find(item => item.id === request.password!.employeeId);
    const delegatedEmployee = before.employees.find(item => item.id === actor.employeeId);
    const action = previous ? 'edit' : 'create';
    const canManage = employee && (canManageEmployeeAccount(actor.role, employee.role) || (actor.role === 'EMPLOYEE' && employee.role === 'EMPLOYEE' && hasEmployeePermission(delegatedEmployee, 'EMPLOYEES', action)));
    if (!employee || !canManage) fail('ليس لديك صلاحية تغيير كلمة مرور هذا الحساب.');
    if (typeof request.password.value !== 'string' || request.password.value.length < 6 || request.password.value.length > 1024) fail('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.');
  }

}
