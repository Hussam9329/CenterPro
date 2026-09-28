import { describe, expect, it } from 'vitest';
import { canManageEmployeeAccount, canViewEmployee, hasPreviewPermission } from '../../src/lib/permissions';
import type { PreviewPermission } from '../../src/lib/permissions';

describe('preview role boundaries (server enforcement belongs to phase 2)', () => {
  const permissions: PreviewPermission[] = ['MANAGE_EMPLOYEES', 'EDIT_ATTENDANCE', 'EDIT_PAYROLL', 'MANAGE_ADJUSTMENTS', 'REPORTS', 'MANAGE_DEPARTMENTS', 'MANAGE_ROLES', 'MANAGE_ADMINS', 'SALARY_CONFIG', 'REOPEN_PAYROLL', 'AUDIT', 'SETTINGS'];
  it.each(permissions)('employee cannot %s', (permission) => {
    expect(hasPreviewPermission('EMPLOYEE', permission)).toBe(false);
  });
  it.each<PreviewPermission>(['MANAGE_DEPARTMENTS', 'MANAGE_ROLES', 'MANAGE_ADMINS', 'SALARY_CONFIG', 'REOPEN_PAYROLL', 'AUDIT', 'SETTINGS'])('admin cannot protected %s', (permission) => {
    expect(hasPreviewPermission('ADMIN', permission)).toBe(false);
    expect(hasPreviewPermission('SUPER_ADMIN', permission)).toBe(true);
  });
  it('admin has daily operations but cannot modify an admin account', () => {
    expect(hasPreviewPermission('ADMIN', 'EDIT_ATTENDANCE')).toBe(true);
    expect(hasPreviewPermission('ADMIN', 'EDIT_PAYROLL')).toBe(true);
    expect(canManageEmployeeAccount('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageEmployeeAccount('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canManageEmployeeAccount('ADMIN', 'EMPLOYEE')).toBe(true);
    expect(canManageEmployeeAccount('EMPLOYEE', 'EMPLOYEE')).toBe(false);
  });
  it('employee can see only their own data', () => {
    const session = { role: 'EMPLOYEE' as const, employeeId: 'CP-0001', name: 'علي' };
    expect(canViewEmployee(session, 'CP-0001')).toBe(true);
    expect(canViewEmployee(session, 'CP-0002')).toBe(false);
  });
});
