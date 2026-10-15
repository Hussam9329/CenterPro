import { describe, expect, it } from 'vitest';
import { getActiveNavigation, getMobileNavigation, getShellNavigation, getShellRedirect } from '@/components/app-shell/navigation';
import type { DemoSession, Role } from '@/lib/types';
import { createPopulatedTestData } from '../fixtures/populated-data';

function session(role: Role, employeeId?: string): DemoSession { return { role, employeeId, name: 'Navigation fixture' }; }
const hrefs = (nav: ReturnType<typeof getShellNavigation>) => nav.map(item => item.href);

describe('shell access before rendering protected content', () => {
  it('sends anonymous visitors to login and display-only accounts to their dedicated screen', () => {
    for (const employee of [false, true]) {
      expect(getShellRedirect(null, employee, '/settings')).toBe('/login');
      expect(getShellRedirect(session('QR_DISPLAY'), employee, '/settings')).toBe('/attendance-display');
    }
  });

  it('redirects role/layout mismatches to the corresponding home', () => {
    expect(getShellRedirect(session('EMPLOYEE'), false, '/dashboard')).toBe('/employee');
    expect(getShellRedirect(session('ADMIN'), true, '/employee')).toBe('/dashboard');
    expect(getShellRedirect(session('SUPER_ADMIN'), true, '/employee')).toBe('/dashboard');
    expect(getShellRedirect(session('EMPLOYEE'), true, '/employee/attendance')).toBeNull();
    expect(getShellRedirect(session('ADMIN'), false, '/employees/person')).toBeNull();
  });

  it.each(['/permissions', '/departments', '/audit', '/settings'])('preserves the ADMIN prefix guard for %s while allowing the owner', path => {
    for (const pathname of [path, `${path}/details`, `${path}-legacy`]) {
      expect(getShellRedirect(session('ADMIN'), false, pathname)).toBe('/dashboard');
      expect(getShellRedirect(session('SUPER_ADMIN'), false, pathname)).toBeNull();
    }
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
    const nav = getShellNavigation(data, session('EMPLOYEE', correction.id), true);
    expect(hrefs(getMobileNavigation(nav, true))).toEqual(['/employee', '/employee/scan', '/employee/evaluation', '/employee/salary']);
    expect(hrefs(nav)).toContain('/employee/attendance');
    const ordinaryNav = getShellNavigation(data, session('EMPLOYEE'), true);
    expect(hrefs(getMobileNavigation(ordinaryNav, true))).toEqual(['/employee', '/employee/scan', '/employee/salary', '/calculator']);
  });
});
