import { describe, expect, it } from 'vitest';
import { ACCOUNT_PERMISSION_FEATURES, canManageEmployeeAccount, canViewEmployee, hasEmployeePermission, hasPreviewPermission } from '../../src/lib/permissions';
import type { PreviewPermission } from '../../src/lib/permissions';
import type { Employee } from '../../src/lib/types';

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

  it('lists every delegable admin menu while keeping permission management outside delegation', () => {
    expect(ACCOUNT_PERMISSION_FEATURES.map(item => item.feature)).toEqual([
      'DASHBOARD', 'EMPLOYEES', 'ATTENDANCE', 'AUDIT_REVIEW', 'PAYROLL', 'DEDUCTIONS',
      'BONUSES', 'DEPARTMENTS', 'REPORTS', 'AUDIT_LOG', 'SETTINGS',
    ]);
    expect(ACCOUNT_PERMISSION_FEATURES.find(item => item.feature === 'REPORTS')?.actions).toEqual(['view']);
    expect(ACCOUNT_PERMISSION_FEATURES.find(item => item.feature === 'SETTINGS')?.actions).toEqual(['view', 'edit']);
  });

  it('grants delegated menus per individual account and defaults missing permissions to denied', () => {
    const employee = { active: true, role: 'EMPLOYEE', permissions: { AUDIT_REVIEW: { view: true, create: false, edit: true, delete: false } } } as Employee;
    expect(hasEmployeePermission(employee, 'AUDIT_REVIEW', 'view')).toBe(true);
    expect(hasEmployeePermission(employee, 'AUDIT_REVIEW', 'edit')).toBe(true);
    expect(hasEmployeePermission(employee, 'AUDIT_REVIEW', 'create')).toBe(false);
    expect(hasEmployeePermission(employee, 'DEDUCTIONS', 'view')).toBe(false);
    expect(hasEmployeePermission({ ...employee, active: false }, 'AUDIT_REVIEW', 'view')).toBe(false);
  });
});
