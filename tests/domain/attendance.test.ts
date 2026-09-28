import { describe, expect, it } from 'vitest';
import { getLatenessSeconds, isExpected, statusLabel } from '../../src/lib/attendance';
import { createInitialData, DEMO_TODAY } from '../../src/lib/mock-data';

describe('Baghdad attendance rules', () => {
  it.each([['14:00:00', 0], ['14:00:01', 1], ['14:01:00', 60], ['14:17:43', 1063], ['13:59:59', 0]])('arrival %s -> %i late seconds, without grace', (time, seconds) => {
    expect(getLatenessSeconds(`2026-09-28T${time}+03:00`, DEMO_TODAY, '14:00:00')).toBe(seconds);
  });
  it('accepts UTC server instants independently of browser timezone', () => {
    expect(getLatenessSeconds('2026-09-28T11:17:43.000Z', DEMO_TODAY, '14:00')).toBe(1063);
  });
  it('invalid timestamps do not silently become on-time attendance', () => {
    expect(() => getLatenessSeconds('invalid', DEMO_TODAY, '14:00:00')).toThrow();
  });
  it('expected employees respect selected departments and explicit individual overrides', () => {
    const data = createInitialData();
    const employee = data.employees[0];
    const workday = data.workdays.find((item) => item.date === DEMO_TODAY)!;
    expect(isExpected(employee, workday)).toBe(true);
    workday.overrides[employee.id] = 'EXCLUDE';
    expect(isExpected(employee, workday)).toBe(false);
    workday.departmentIds = [];
    workday.overrides[employee.id] = 'INCLUDE';
    expect(isExpected(employee, workday)).toBe(true);
    delete workday.overrides[employee.id];
    expect(isExpected(employee, workday)).toBe(false);
  });
  it('overrides cannot include inactive, not-yet-started or ended employees', () => {
    const data = createInitialData();
    const employee = data.employees[0];
    const workday = data.workdays.find((item) => item.date === DEMO_TODAY)!;
    workday.overrides[employee.id] = 'INCLUDE';
    expect(isExpected({ ...employee, active: false }, workday)).toBe(false);
    expect(isExpected({ ...employee, startDate: '2026-09-29' }, workday)).toBe(false);
    expect(isExpected({ ...employee, endDate: '2026-09-27' }, workday)).toBe(false);
    expect(isExpected({ ...employee, startDate: DEMO_TODAY }, workday)).toBe(true);
  });
  it('all attendance states have readable Arabic labels', () => {
    expect(statusLabel('UNRESOLVED')).toBe('غير محسوم');
    expect(statusLabel('EXEMPT')).toBe('مستثنى / لا يوجد دوام');
  });
});

describe('coherent fictional fixture', () => {
  it('all records have valid employees/workdays and only one attendance record per employee per day', () => {
    const data = createInitialData();
    const employeeIds = new Set(data.employees.map((item) => item.id));
    const workdayIds = new Set(data.workdays.map((item) => item.id));
    expect(new Set(data.attendance.map((item) => `${item.employeeId}:${item.workdayId}`)).size).toBe(data.attendance.length);
    expect(new Set(data.workdays.map((item) => item.date)).size).toBe(data.workdays.length);
    for (const record of data.attendance) {
      expect(employeeIds.has(record.employeeId)).toBe(true);
      expect(workdayIds.has(record.workdayId)).toBe(true);
      expect(record.status === 'PRESENT' ? Boolean(record.checkIn) : record.checkIn === null).toBe(true);
    }
  });
  it('new fixtures are independent and password audit contains no credentials', () => {
    const first = createInitialData();
    first.employees[0].name = 'تم التغيير';
    expect(createInitialData().employees[0].name).not.toBe('تم التغيير');
    const resetAudit = first.audit.find((item) => item.action.includes('كلمة مرور'))!;
    expect(Object.keys(resetAudit.newValues)).toEqual(['sessionsInvalidated']);
    expect(JSON.stringify(first)).not.toMatch(/passwordHash|github_pat|postgresql:\/\//);
  });
});
