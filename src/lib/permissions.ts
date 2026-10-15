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

export const ACCOUNT_PERMISSION_FEATURES: ReadonlyArray<{ feature: AccountPermissionFeature; label: string; description: string }> = [
  { feature: 'DEDUCTIONS', label: 'الخصومات', description: 'عرض سجل الخصومات وإضافة أو تعديل أو حذف الخصومات حسب الصلاحيات المحددة.' },
  { feature: 'BONUSES', label: 'المكافآت', description: 'عرض سجل المكافآت وإضافة أو تعديل أو حذف المكافآت حسب الصلاحيات المحددة.' },
  { feature: 'AUDIT_REVIEW', label: 'التدقيق', description: 'إظهار قائمة التدقيق وإدارة إدخالات تدقيق المصححين حسب الصلاحيات المحددة.' },
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

export function hasSessionAccountPermission(data: DemoData, session: DemoSession | null | undefined, feature: AccountPermissionFeature, action: AccountPermissionAction = 'view'): boolean {
  if (!session) return false;
  if (session.role === 'SUPER_ADMIN' || session.role === 'ADMIN') return true;
  if (session.role !== 'EMPLOYEE' || !session.employeeId) return false;
  return hasEmployeePermission(data.employees.find(employee => employee.id === session.employeeId), feature, action);
}

export function permissionFeatureForCollection(collection: MutableCollection): AccountPermissionFeature | null {
  if (collection === 'deductions') return 'DEDUCTIONS';
  if (collection === 'bonuses') return 'BONUSES';
  if (collection === 'examEvaluations') return 'AUDIT_REVIEW';
  return null;
}
