import type { DemoData, PayrollMonth } from '@/lib/types';

export function monthSource(data: DemoData, month: string): DemoData {
  const snapshot = data.months.find(item => item.month === month && item.state !== 'OPEN')?.sourceSnapshot;
  return snapshot ? { ...data, ...snapshot, payments: data.payments } : data;
}

export function captureMonthSource(data: DemoData, month: string): NonNullable<PayrollMonth['sourceSnapshot']> {
  const workdays = data.workdays.filter(item => item.date.startsWith(month));
  const workdayIds = new Set(workdays.map(item => item.id));
  return structuredClone({ employees: data.employees, departments: data.departments, workdays, attendance: data.attendance.filter(item => workdayIds.has(item.workdayId)), deductions: data.deductions.filter(item => item.date.startsWith(month)), bonuses: data.bonuses.filter(item => item.date.startsWith(month)) });
}

export function monthIsLocked(data: DemoData, month: string, role: string | undefined): boolean {
  const state = data.months.find(item => item.month === month)?.state;
  return state === 'ARCHIVED' || (state === 'REOPENED' && role !== 'SUPER_ADMIN');
}
