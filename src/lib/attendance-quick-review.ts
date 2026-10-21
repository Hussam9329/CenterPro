import type { AttendanceRecord, AttendanceStatus, Workday } from './types';

export type QuickReviewAction = 'NO_CHANGE' | 'SAVE' | 'DETAILS' | 'CONFIRM_REMOVAL';

/** Avoid replacing a real check-in with a guessed time or skipping the removal confirmation. */
export function getQuickReviewAction(current: AttendanceStatus, target: AttendanceStatus): QuickReviewAction {
  if (current === target) return 'NO_CHANGE';
  if (target === 'EXCUSED' || target === 'UNEXCUSED') return 'DETAILS';
  if (current === 'PRESENT' && target === 'UNRESOLVED') return 'CONFIRM_REMOVAL';
  return 'SAVE';
}

/** Without a recorded time, quick manual presence uses the displayed workday start time,
 * not the user's current clock (which could be on an entirely different date).
 * The source and explanatory note make the assumption visible to administrators. */
export function getQuickPresentTime(record: AttendanceRecord, day: Workday): string {
  if (!record.checkIn) return day.startTime;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(record.checkIn));
}

export const QUICK_PRESENT_NOTE = 'تسجيل سريع بوقت بدء الدوام';
