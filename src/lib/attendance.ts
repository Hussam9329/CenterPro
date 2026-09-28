import type { AttendanceStatus, Employee, Workday } from './types';

/** Workday inclusion for the preview. Production must revalidate on the server. */
export function isExpected(employee: Employee, workday: Workday): boolean {
  if (!employee.active || workday.date < employee.startDate) return false;
  if (employee.endDate && workday.date > employee.endDate) return false;
  const override = workday.overrides[employee.id];
  if (override === 'EXCLUDE') return false;
  if (override === 'INCLUDE') return true;
  return workday.departmentIds.includes(employee.departmentId);
}

/** Baghdad uses UTC+03:00 year round; compare instants, never browser timezone. */
export function getLatenessSeconds(checkInISO: string, date: string, startTime: string): number {
  const start = Date.parse(`${date}T${startTime.length === 5 ? `${startTime}:00` : startTime}+03:00`);
  const checkIn = Date.parse(checkInISO);
  if (!Number.isFinite(start) || !Number.isFinite(checkIn)) throw new Error('وقت الحضور أو وقت بدء الدوام غير صالح.');
  return Math.max(0, Math.floor((checkIn - start) / 1000));
}

export function statusLabel(status: AttendanceStatus): string {
  return {
    PRESENT: 'حاضر',
    UNRESOLVED: 'غير محسوم',
    EXCUSED: 'غياب بعذر',
    UNEXCUSED: 'غياب بدون عذر',
    EXEMPT: 'مستثنى / لا يوجد دوام',
  }[status];
}
