import { describe, expect, it } from 'vitest';
import { createInitialData, DEMO_MONTH } from '../../src/lib/mock-data';
import { getMonthPayroll } from '../../src/lib/payroll';
import { getOpenWorkday } from '../../src/lib/attendance';

describe('clean preview installation', () => {
  it('starts with no operational records, departments, accounts or payroll periods', () => {
    expect(createInitialData()).toEqual({
      employees: [], departments: [], workdays: [], attendance: [], deductions: [],
      bonuses: [], months: [], payments: [], audit: [], evaluationSeasons: [], evaluationCycles: [], evaluationExams: [], examEvaluations: [],
      settings: { centerName: 'CenterPro', qrInterval: 45 },
    });
  });

  it('empty payroll and open-day lookup produce empty results without fictional data', () => {
    const data = createInitialData();
    expect(getMonthPayroll(data, DEMO_MONTH)).toEqual([]);
    expect(getOpenWorkday(data.workdays)).toBeUndefined();
    expect(data.employees.length).toBe(0);
    expect(data.departments.length).toBe(0);
    expect(data.audit.length).toBe(0);
  });

  it('fresh initialization/reset gets new independent arrays and default settings', () => {
    const first = createInitialData();
    first.settings.centerName = 'اسم معدل';
    first.settings.qrInterval = 60;
    first.months.push({ id: 'created-month', month: DEMO_MONTH, state: 'OPEN', snapshots: {} });
    const reset = createInitialData();
    expect(reset.settings).toEqual({ centerName: 'CenterPro', qrInterval: 45 });
    expect(reset.months).toEqual([]);
    expect(reset.employees).not.toBe(first.employees);
    expect(reset.departments).not.toBe(first.departments);
    expect(reset.workdays).not.toBe(first.workdays);
    expect(reset.audit).not.toBe(first.audit);
  });
});
