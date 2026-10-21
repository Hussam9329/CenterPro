import { describe, expect, it } from 'vitest';
import { getQuickPresentTime, getQuickReviewAction, QUICK_PRESENT_NOTE } from '../../src/lib/attendance-quick-review';
import type { AttendanceRecord, Workday } from '../../src/lib/types';

const day: Workday = { id: 'day', date: '2026-10-12', startTime: '15:00:00', state: 'OPEN', departmentIds: [], overrides: {} };
const record: AttendanceRecord = { id: 'record', employeeId: 'staff', workdayId: 'day', status: 'UNRESOLVED', checkIn: null, latenessSeconds: 0, source: null, reason: '', updatedAt: '2026-10-12T08:00:00Z' };

describe('quick attendance review', () => {
  it('saves normal status selections directly, but avoids bypassing absence details and removal confirmation', () => {
    expect(getQuickReviewAction('UNRESOLVED', 'PRESENT')).toBe('SAVE');
    expect(getQuickReviewAction('EXCUSED', 'UNRESOLVED')).toBe('SAVE');
    expect(getQuickReviewAction('PRESENT', 'UNRESOLVED')).toBe('CONFIRM_REMOVAL');
    expect(getQuickReviewAction('UNRESOLVED', 'EXCUSED')).toBe('DETAILS');
    expect(getQuickReviewAction('PRESENT', 'UNEXCUSED')).toBe('DETAILS');
    expect(getQuickReviewAction('UNRESOLVED', 'EXEMPT')).toBe('SAVE');
    expect(getQuickReviewAction('PRESENT', 'PRESENT')).toBe('NO_CHANGE');
  });

  it('uses the actual workday start, not the current time, for a first manual check-in', () => {
    expect(getQuickPresentTime(record, day)).toBe('15:00:00');
    expect(QUICK_PRESENT_NOTE).toMatch(/وقت بدء الدوام/);
    expect(getQuickPresentTime({ ...record, status: 'PRESENT', checkIn: '2026-10-12T12:18:09Z' }, day)).toBe('15:18:09');
  });
});
