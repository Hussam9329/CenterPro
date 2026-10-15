import { describe, expect, it } from 'vitest';
import { createTestData } from '../../src/lib/mock-data';
import { attendanceDateLabel, englishMonthName } from '../../src/lib/format';
import { getCorrectionEmployees, isAuditEmployee, isCorrectionDepartmentName } from '../../src/lib/evaluations';
import { projectData } from '../../src/server/projection';

describe('attendance date presentation', () => {
  it('shows the Arabic weekday and English month in Baghdad time', () => {
    expect(attendanceDateLabel('2026-10-15')).toBe('الخميس — 15 October 2026');
    expect(attendanceDateLabel('2026-10-14T22:30:00.000Z')).toBe('الخميس — 15 October 2026');
    expect(englishMonthName('2026-01')).toBe('January');
    expect(englishMonthName('2026-09')).toBe('September');
  });
  it('keeps missing and invalid dates out of the displayed calendar', () => {
    expect(attendanceDateLabel('')).toBe('—');
    expect(attendanceDateLabel('not-a-date')).toBe('—');
    expect(englishMonthName('not-a-month')).toBe('—');
  });
});

describe('correction roster compatibility without department-based audit grants', () => {
  it('recognizes only the existing correction label and its explicit department prefix', () => {
    for (const name of ['التصحيح', 'قسم التصحيح', ' قسم  التصحيح ']) expect(isCorrectionDepartmentName(name)).toBe(true);
    for (const name of ['قسم التدقيق', 'التصحيح والمتابعة', 'قسم التصحيح والمتابعة', 'شعبة التصحيح', 'قسم قسم التصحيح']) expect(isCorrectionDepartmentName(name)).toBe(false);
  });
  it('projects the real-shaped correction roster to a delegated account in any department', () => {
    const data = createTestData();
    data.departments.find(item => item.id === 'department-correction-test')!.name = 'قسم التصحيح';
    const auditor = data.employees.find(item => item.id === 'employee-jaafar-ali')!;
    auditor.departmentId = 'department-correction-test';
    auditor.permissions = { AUDIT_REVIEW: { view: true, create: false, edit: false, delete: false } };
    const expected = getCorrectionEmployees(data).map(item => item.id);
    expect(expected).toHaveLength(5);
    const projected = projectData(data, { kind: 'EMPLOYEE', role: 'EMPLOYEE', employeeId: auditor.id, name: auditor.name });
    expect(getCorrectionEmployees(projected).map(item => item.id).sort()).toEqual(expected.sort());
    expect(isAuditEmployee(projected, projected.employees.find(item => item.id === auditor.id)!)).toBe(true);
    delete auditor.permissions;
    expect(isAuditEmployee(data, auditor)).toBe(false);
    auditor.departmentId = 'department-audit-test';
    for (const name of ['التدقيق', 'قسم التدقيق']) {
      data.departments.find(item => item.id === auditor.departmentId)!.name = name;
      expect(isAuditEmployee(data, auditor)).toBe(false);
    }
  });
});
