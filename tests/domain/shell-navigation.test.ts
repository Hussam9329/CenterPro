import { describe, expect, it } from 'vitest';
import { getActiveNavigation, getMobileNavigation, getShellNavigation, getShellRedirect } from '@/components/app-shell/navigation';
import type { AccountPermission, AccountPermissionFeature, DemoSession, Role } from '@/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';

function session(role: Role, employeeId?: string): DemoSession { return { role, employeeId, name: 'Navigation fixture' }; }
const hrefs = (nav: ReturnType<typeof getShellNavigation>) => nav.map(item => item.href);
const viewOnly: AccountPermission = { view: true, create: false, edit: false, delete: false };

describe('shell access before rendering protected content', () => {
  it('sends anonymous visitors to login and display-only accounts to their dedicated screen', () => {
    const data = createPopulatedTestData();
    for (const employeeLayout of [false, true]) {
      expect(getShellRedirect(data, null, employeeLayout, '/settings')).toBe('/login');
      expect(getShellRedirect(data, session('QR_DISPLAY'), employeeLayout, '/settings')).toBe('/attendance-display');
    }
  });

  it('redirects role/layout mismatches to the corresponding home', () => {
    const data = createPopulatedTestData();
    const employee = data.employees.find(item => item.role === 'EMPLOYEE' && item.active)!;
    employee.permissions = undefined;
    expect(getShellRedirect(data, session('EMPLOYEE', employee.id), false, '/dashboard')).toBe('/employee');
    expect(getShellRedirect(data, session('ADMIN'), true, '/employee')).toBe('/dashboard');
    expect(getShellRedirect(data, session('SUPER_ADMIN'), true, '/employee')).toBe('/dashboard');
    expect(getShellRedirect(data, session('EMPLOYEE', employee.id), true, '/employee/attendance')).toBeNull();
    expect(getShellRedirect(data, session('ADMIN'), false, '/employees/person')).toBeNull();
  });

  it.each(['/permissions', '/departments', '/audit', '/settings'])('preserves the ADMIN guard for %s while allowing the owner', path => {
    const data = createPopulatedTestData();
    for (const pathname of [path, `${path}/details`]) {
      expect(getShellRedirect(data, session('ADMIN'), false, pathname)).toBe('/dashboard');
      expect(getShellRedirect(data, session('SUPER_ADMIN'), false, pathname)).toBeNull();
    }
  });

  it('permits only explicitly delegated admin menus and keeps permissions owner-only', () => {
    const data = createPopulatedTestData();
    const employee = data.employees.find(item => item.role === 'EMPLOYEE' && item.active)!;
    const granted: AccountPermissionFeature[] = ['DASHBOARD', 'EMPLOYEES', 'ATTENDANCE', 'PAYROLL', 'DEDUCTIONS', 'BONUSES', 'DEPARTMENTS', 'REPORTS', 'AUDIT_LOG', 'SETTINGS'];
    employee.permissions = Object.fromEntries(granted.map(feature => [feature, viewOnly]));
    const actor = session('EMPLOYEE', employee.id);
    for (const path of ['/dashboard', '/employees', '/attendance', '/payroll', '/deductions', '/bonuses', '/departments', '/reports', '/audit', '/settings']) {
      expect(getShellRedirect(data, actor, false, path)).toBeNull();
    }
    expect(getShellRedirect(data, actor, false, '/permissions')).toBe('/employee');
    expect(getShellRedirect(data, actor, false, '/evaluations')).toBe('/employee');
    employee.permissions.AUDIT_REVIEW = viewOnly;
    expect(getShellRedirect(data, actor, false, '/evaluations')).toBe('/employee/audit');
  });
});

describe('navigation for the current account', () => {
  it('exposes owner-only destinations exclusively to SUPER_ADMIN in the manager navigation', () => {
    const data = createPopulatedTestData();
    const owner = hrefs(getShellNavigation(data, session('SUPER_ADMIN'), false));
    const admin = hrefs(getShellNavigation(data, session('ADMIN'), false));
    for (const path of ['/permissions', '/departments', '/audit', '/settings']) {
      expect(owner).toContain(path);
      expect(admin).not.toContain(path);
    }
    expect(admin).toContain('/evaluations');
    expect(admin).toContain('/calculator');
  });

  it('shows every delegated menu per account while audit keeps the existing employee workspace', () => {
    const data = createPopulatedTestData();
    const employee = data.employees.find(item => item.role === 'EMPLOYEE' && item.active)!;
    employee.permissions = {
      DASHBOARD: viewOnly, EMPLOYEES: viewOnly, ATTENDANCE: viewOnly, AUDIT_REVIEW: viewOnly,
      PAYROLL: viewOnly, DEDUCTIONS: viewOnly, BONUSES: viewOnly, DEPARTMENTS: viewOnly,
      REPORTS: viewOnly, AUDIT_LOG: viewOnly, SETTINGS: viewOnly,
    };
    const paths = hrefs(getShellNavigation(data, session('EMPLOYEE', employee.id), true));
    for (const path of ['/dashboard', '/employees', '/attendance', '/employee/audit', '/payroll', '/deductions', '/bonuses', '/departments', '/reports', '/audit', '/settings']) expect(paths).toContain(path);
    expect(paths).not.toContain('/evaluations');
    expect(paths).not.toContain('/permissions');
  });

  it('uses explicit account permission for auditing while correction evaluation remains department-based', () => {
    const data = createPopulatedTestData();
    const correction = data.employees.find(employee => employee.departmentId === 'dept-correction' && employee.active)!;
    const audit = data.employees.find(employee => employee.departmentId === 'dept-review' && employee.active)!;
    const correctionPaths = hrefs(getShellNavigation(data, session('EMPLOYEE', correction.id), true));
    const auditPaths = hrefs(getShellNavigation(data, session('EMPLOYEE', audit.id), true));
    expect(correctionPaths).toContain('/employee/evaluation');
    expect(correctionPaths).not.toContain('/employee/audit');
    expect(auditPaths).toContain('/employee/audit');
    expect(auditPaths).not.toContain('/employee/evaluation');
    audit.departmentId = 'dept-followup';
    expect(hrefs(getShellNavigation(data, session('EMPLOYEE', audit.id), true))).toContain('/employee/audit');
    audit.permissions = { ...(audit.permissions ?? {}), AUDIT_REVIEW: { view: false, create: false, edit: false, delete: false } };
    expect(hrefs(getShellNavigation(data, session('EMPLOYEE', audit.id), true))).not.toContain('/employee/audit');
    correction.active = false;
    for (const id of [correction.id, 'missing-employee', undefined]) {
      const paths = hrefs(getShellNavigation(data, session('EMPLOYEE', id), true));
      expect(paths).not.toContain('/employee/evaluation');
      expect(paths).not.toContain('/employee/audit');
      expect(paths).toContain('/employee/profile');
    }
  });

  it('selects nested destinations without treating the employee home as their active parent', () => {
    const data = createPopulatedTestData();
    const employeeNav = getShellNavigation(data, session('EMPLOYEE'), true);
    expect(getActiveNavigation(employeeNav, '/employee')?.href).toBe('/employee');
    expect(getActiveNavigation(employeeNav, '/employee/profile/details')?.href).toBe('/employee/profile');
    expect(getActiveNavigation(employeeNav, '/employee/unknown')).toBeUndefined();
    const adminNav = getShellNavigation(data, session('ADMIN'), false);
    expect(getActiveNavigation(adminNav, '/employees/person')?.href).toBe('/employees');
    expect(getActiveNavigation(adminNav, '/employees-other')).toBeUndefined();
    expect(getActiveNavigation(adminNav, '/calculator')?.href).toBe('/calculator');
  });

  it('preserves mobile priority and keeps attendance history in the full employee menu', () => {
    const data = createPopulatedTestData();
    for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
      const nav = getShellNavigation(data, session(role), false);
      expect(hrefs(getMobileNavigation(nav, false))).toEqual(['/dashboard', '/employees', '/attendance', '/payroll']);
    }
    const correction = data.employees.find(employee => employee.departmentId === 'dept-correction' && employee.active)!;
    correction.permissions = undefined;
    const nav = getShellNavigation(data, session('EMPLOYEE', correction.id), true);
    expect(hrefs(getMobileNavigation(nav, true))).toEqual(['/employee', '/employee/scan', '/employee/evaluation', '/employee/salary']);
    expect(hrefs(nav)).toContain('/employee/attendance');
    const ordinary = data.employees.find(employee => employee.role === 'EMPLOYEE' && employee.departmentId !== correction.departmentId && employee.active)!;
    ordinary.permissions = undefined;
    const ordinaryNav = getShellNavigation(data, session('EMPLOYEE', ordinary.id), true);
    expect(hrefs(getMobileNavigation(ordinaryNav, true))).toEqual(['/employee', '/employee/scan', '/employee/salary', '/calculator']);
  });
});
