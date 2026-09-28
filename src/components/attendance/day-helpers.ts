import { isExpected } from '@/lib/attendance';
import type { AttendanceRecord, DemoData, DemoSession, Employee, Workday } from '@/lib/types';

export type AttendanceRow = { employee: Employee; day: Workday; record: AttendanceRecord };

export function getDayRows(data: DemoData, day: Workday): AttendanceRow[] {
  return data.employees.flatMap(employee => {
    const record = data.attendance.find(item => item.workdayId === day.id && item.employeeId === employee.id);
    if (!record && !isExpected(employee, day)) return [];
    return [{ employee, day, record: record || { id: '', workdayId: day.id, employeeId: employee.id, status: 'UNRESOLVED' as const, checkIn: null, latenessSeconds: 0, source: null, reason: '', updatedAt: '' } }];
  }).sort((a, b) => a.employee.code.localeCompare(b.employee.code));
}

export function getDaySummary(data: DemoData, day: Workday) {
  const rows = getDayRows(data, day);
  const count = (status: AttendanceRecord['status']) => rows.filter(row => row.record.status === status).length;
  return { expected: rows.filter(row => row.record.status !== 'EXEMPT').length, present: count('PRESENT'), unresolved: count('UNRESOLVED'), excused: count('EXCUSED'), unexcused: count('UNEXCUSED'), exempt: count('EXEMPT'), late: rows.filter(row => row.record.latenessSeconds > 0).length, latenessSeconds: rows.reduce((sum, row) => sum + row.record.latenessSeconds, 0) };
}

export function canEditDay(data: DemoData, session: DemoSession | null, day: Workday) {
  const state = data.months.find(item => item.month === day.date.slice(0, 7))?.state;
  return Boolean(session && session.role !== 'EMPLOYEE' && state !== 'ARCHIVED' && (state !== 'REOPENED' || session.role === 'SUPER_ADMIN'));
}
