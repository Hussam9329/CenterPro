import type { DemoSession, Role } from './types';

/** Preview affordances only. Real authorization is deferred to the server phase. */
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
