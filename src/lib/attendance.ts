import type { AttendanceStatus, Employee, Workday } from './types';

/** Guard every preview state transition, not just the open-day form. */
export function assertSingleOpenWorkday(workdays: readonly Workday[]): void {
  if (workdays.filter((workday) => workday.state === 'OPEN').length > 1) {
    throw new Error('لا يمكن وجود أكثر من يوم حضور مفتوح في الوقت نفسه. يجب إغلاق اليوم المفتوح أولاً.');
  }
  if (new Set(workdays.map((workday) => workday.date)).size !== workdays.length) {
    throw new Error('يوجد يوم حضور بهذا التاريخ. لا يمكن تكرار يوم الحضور للتاريخ نفسه.');
  }
  if (new Set(workdays.map((workday) => workday.id)).size !== workdays.length) {
    throw new Error('تعذر حفظ يوم الحضور بسبب تكرار معرف اليوم.');
  }
}

/** Date-independent lookup: there can be only one current open day in CenterPro. */
export function getOpenWorkday(workdays: readonly Workday[]): Workday | undefined {
  assertSingleOpenWorkday(workdays);
  return workdays.find((workday) => workday.state === 'OPEN');
}

/** The existing open day can be edited; another day cannot open or reopen. */
export function assertCanOpenWorkday(workdays: readonly Workday[], idToReopen?: string): void {
  const openDay = getOpenWorkday(workdays);
  if (!openDay || openDay.id === idToReopen) return;
  const instruction = idToReopen
    ? 'أغلق اليوم المفتوح قبل إعادة فتح يوم آخر.'
    : 'يجب إغلاقه قبل فتح يوم حضور جديد.';
  throw new Error(`يوجد يوم حضور مفتوح حالياً. ${instruction} تاريخ اليوم المفتوح: ${openDay.date}`);
}

export function assertUniqueWorkdayDate(workdays: readonly Workday[], date: string, excludeId?: string): void {
  if (workdays.some((workday) => workday.date === date && workday.id !== excludeId)) {
    throw new Error('يوجد يوم حضور بهذا التاريخ. لا يمكن تكرار يوم الحضور للتاريخ نفسه.');
  }
}

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
