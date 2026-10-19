import type { AccountPermission, AccountPermissionAction, AccountPermissionFeature, DemoData, DemoSession, Employee, Role } from './types';
import type { MutableCollection } from './server-contract';

/** Preview affordances only. Real authorization is also enforced by the server domain. */
export type PreviewPermission = 'MANAGE_EMPLOYEES' | 'EDIT_ATTENDANCE' | 'EDIT_PAYROLL' | 'MANAGE_ADJUSTMENTS' | 'REPORTS' | 'MANAGE_DEPARTMENTS' | 'MANAGE_ROLES' | 'MANAGE_ADMINS' | 'SALARY_CONFIG' | 'REOPEN_PAYROLL' | 'AUDIT' | 'SETTINGS';

const superAdminOnly = new Set<PreviewPermission>(['MANAGE_DEPARTMENTS', 'MANAGE_ROLES', 'MANAGE_ADMINS', 'SALARY_CONFIG', 'REOPEN_PAYROLL', 'AUDIT', 'SETTINGS']);

export function hasPreviewPermission(role: Role, permission: PreviewPermission): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'QR_DISPLAY') return false;
  return role === 'ADMIN' && !superAdminOnly.has(permission);
}

export function canViewEmployee(session: DemoSession, employeeId: string): boolean {
  if (session.role === 'SUPER_ADMIN' || session.role === 'ADMIN') return true;
  return session.role === 'EMPLOYEE' && session.employeeId === employeeId;
}

export function canManageEmployeeAccount(role: Role, targetRole: Role): boolean {
  return role === 'SUPER_ADMIN' || (role === 'ADMIN' && targetRole === 'EMPLOYEE');
}

export const ACCOUNT_PERMISSION_FEATURES: ReadonlyArray<{
  feature: AccountPermissionFeature;
  label: string;
  description: string;
  actions: readonly AccountPermissionAction[];
  actionLabels?: Partial<Record<AccountPermissionAction, string>>;
}> = [
  { feature: 'DASHBOARD', label: 'لوحة التحكم', description: 'عرض لوحة التحكم الإدارية وإحصاءاتها العامة.', actions: ['view'] },
  { feature: 'EMPLOYEES', label: 'الموظفون', description: 'عرض ملفات الموظفين وإضافة أو تعديل أو حذف حسابات الموظفين حسب الصلاحيات.', actions: ['view', 'create', 'edit', 'delete'] },
  { feature: 'ATTENDANCE', label: 'الحضور', description: 'عرض أيام الحضور وفتح الأيام وتعديل الحالات أو حذف السجلات حسب الصلاحيات.', actions: ['view', 'create', 'edit', 'delete'], actionLabels: { create: 'فتح يوم', edit: 'تعديل/إغلاق', delete: 'حذف' } },
  { feature: 'AUDIT_REVIEW', label: 'التدقيق', description: 'إظهار قائمة التدقيق وإدارة إدخالات تدقيق المصححين حسب الصلاحيات المحددة.', actions: ['view', 'create', 'edit', 'delete'], actionLabels: { create: 'إضافة تدقيق', edit: 'تعديل تدقيق', delete: 'حذف تدقيق' } },
  { feature: 'PAYROLL', label: 'الرواتب', description: 'عرض كشوف الرواتب وتسجيل الصرف وأرشفة الشهر أو حذف السجلات المسموحة.', actions: ['view', 'create', 'edit', 'delete'], actionLabels: { create: 'تسجيل صرف', edit: 'أرشفة الشهر', delete: 'حذف سجل' } },
  { feature: 'DEDUCTIONS', label: 'الخصومات', description: 'عرض سجل الخصومات وإضافة أو تعديل أو حذف الخصومات حسب الصلاحيات المحددة.', actions: ['view', 'create', 'edit', 'delete'] },
  { feature: 'BONUSES', label: 'المكافآت', description: 'عرض سجل المكافآت وإضافة أو تعديل أو حذف المكافآت حسب الصلاحيات المحددة.', actions: ['view', 'create', 'edit', 'delete'] },
  { feature: 'DEPARTMENTS', label: 'الأقسام', description: 'عرض الأقسام وإنشاؤها وتعديل إعداداتها أو حذفها حسب الصلاحيات.', actions: ['view', 'create', 'edit', 'delete'] },
  { feature: 'REPORTS', label: 'التقارير', description: 'عرض التقارير التشغيلية والمالية وتصديرها.', actions: ['view'] },
  { feature: 'AUDIT_LOG', label: 'سجل العمليات', description: 'عرض سجل العمليات والتغييرات المسجلة في النظام.', actions: ['view'] },
  { feature: 'SETTINGS', label: 'الإعدادات', description: 'عرض إعدادات المركز وتعديل الإعدادات القابلة للتفويض. حسابات الإدارة والنسخ الاحتياطية تبقى للمشرف العام.', actions: ['view', 'edit'] },
];

export const EMPTY_ACCOUNT_PERMISSION: AccountPermission = { view: false, create: false, edit: false, delete: false };

export function getEmployeePermission(employee: Employee | undefined, feature: AccountPermissionFeature): AccountPermission {
  const permission = employee?.permissions?.[feature];
  if (!permission) return EMPTY_ACCOUNT_PERMISSION;
  return {
    view: permission.view === true,
    create: permission.view === true && permission.create === true,
    edit: permission.view === true && permission.edit === true,
    delete: permission.view === true && permission.delete === true,
  };
}

export function hasEmployeePermission(employee: Employee | undefined, feature: AccountPermissionFeature, action: AccountPermissionAction = 'view'): boolean {
  if (!employee?.active || employee.role !== 'EMPLOYEE') return false;
  return getEmployeePermission(employee, feature)[action];
}

export function sessionEmployee(data: DemoData, session: DemoSession | null | undefined): Employee | undefined {
  if (!session || session.role !== 'EMPLOYEE' || !session.employeeId) return undefined;
  return data.employees.find(employee => employee.id === session.employeeId && employee.active && employee.role === 'EMPLOYEE');
}

export function hasSessionAccountPermission(data: DemoData, session: DemoSession | null | undefined, feature: AccountPermissionFeature, action: AccountPermissionAction = 'view'): boolean {
  if (!session) return false;
  if (session.role === 'SUPER_ADMIN' || session.role === 'ADMIN') return true;
  return hasEmployeePermission(sessionEmployee(data, session), feature, action);
}

export function canManageEmployeeWithSession(data: DemoData, session: DemoSession | null | undefined, targetRole: Role, action: 'create' | 'edit' | 'delete'): boolean {
  if (!session) return false;
  if (canManageEmployeeAccount(session.role, targetRole)) return true;
  return session.role === 'EMPLOYEE' && targetRole === 'EMPLOYEE' && hasSessionAccountPermission(data, session, 'EMPLOYEES', action);
}

export function permissionFeatureForCollection(collection: MutableCollection): AccountPermissionFeature | null {
  if (collection === 'employees') return 'EMPLOYEES';
  if (collection === 'departments') return 'DEPARTMENTS';
  if (collection === 'workdays' || collection === 'attendance') return 'ATTENDANCE';
  if (collection === 'deductions') return 'DEDUCTIONS';
  if (collection === 'bonuses') return 'BONUSES';
  if (collection === 'months' || collection === 'payments') return 'PAYROLL';
  if (collection === 'examEvaluations') return 'AUDIT_REVIEW';
  return null;
}
