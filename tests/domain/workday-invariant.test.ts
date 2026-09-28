import { describe, expect, it } from 'vitest';
import { assertCanOpenWorkday, assertSingleOpenWorkday, assertUniqueWorkdayDate, getOpenWorkday } from '../../src/lib/attendance';
import type { Workday } from '../../src/lib/types';

const workday = (id: string, date: string, state: Workday['state']): Workday => ({ id, date, state, startTime: '14:00:00', departmentIds: [], overrides: {} });

describe('one open attendance day across the entire system', () => {
  it('allows the first day and returns it independently of the calendar date', () => {
    const workdays: Workday[] = [];
    expect(getOpenWorkday(workdays)).toBeUndefined();
    expect(() => assertCanOpenWorkday(workdays)).not.toThrow();
    workdays.push(workday('first', '2026-08-12', 'OPEN'));
    expect(() => assertSingleOpenWorkday(workdays)).not.toThrow();
    expect(getOpenWorkday(workdays)?.id).toBe('first');
    expect(getOpenWorkday(workdays)?.date).toBe('2026-08-12');
  });

  it('blocks a second open day even when its date and month differ', () => {
    const workdays = [workday('first', '2026-09-28', 'OPEN')];
    expect(() => assertCanOpenWorkday(workdays)).toThrow('يجب إغلاقه قبل فتح يوم حضور جديد');
    expect(() => assertCanOpenWorkday(workdays)).toThrow('2026-09-28');
    expect(() => assertSingleOpenWorkday([...workdays, workday('second', '2026-10-01', 'OPEN')])).toThrow('أكثر من يوم حضور مفتوح');
  });

  it('allows the next day only after the previous open day is closed', () => {
    const workdays = [workday('first', '2026-09-28', 'OPEN')];
    workdays[0].state = 'CLOSED';
    expect(() => assertCanOpenWorkday(workdays)).not.toThrow();
    workdays.push(workday('second', '2026-09-29', 'OPEN'));
    expect(() => assertSingleOpenWorkday(workdays)).not.toThrow();
    expect(getOpenWorkday(workdays)?.id).toBe('second');
  });

  it('blocks reopening a closed historical day while another is open', () => {
    const workdays = [workday('historic', '2026-08-12', 'CLOSED'), workday('current', '2026-09-28', 'OPEN')];
    expect(() => assertCanOpenWorkday(workdays, 'historic')).toThrow('أغلق اليوم المفتوح قبل إعادة فتح يوم آخر');
    const bypassAttempt = structuredClone(workdays);
    bypassAttempt[0].state = 'OPEN';
    expect(() => assertSingleOpenWorkday(bypassAttempt)).toThrow();
    expect(() => getOpenWorkday(bypassAttempt)).toThrow();
    expect(workdays[0].state).toBe('CLOSED');
  });

  it('allows historical reopening once no other open day exists', () => {
    const workdays = [workday('historic', '2026-08-12', 'CLOSED'), workday('recent', '2026-09-28', 'CLOSED')];
    expect(() => assertCanOpenWorkday(workdays, 'historic')).not.toThrow();
    workdays[0].state = 'OPEN';
    expect(() => assertSingleOpenWorkday(workdays)).not.toThrow();
    expect(getOpenWorkday(workdays)?.id).toBe('historic');
  });

  it('editing the existing open day does not conflict with itself', () => {
    const workdays = [workday('current', '2026-09-28', 'OPEN')];
    const before = structuredClone(workdays);
    expect(() => assertCanOpenWorkday(workdays, 'current')).not.toThrow();
    expect(() => assertUniqueWorkdayDate(workdays, '2026-09-28', 'current')).not.toThrow();
    expect(workdays).toEqual(before);
  });

  it('retains unique dates even for closed days', () => {
    const workdays = [workday('first', '2026-09-28', 'CLOSED')];
    expect(() => assertUniqueWorkdayDate(workdays, '2026-09-28')).toThrow('لا يمكن تكرار');
    expect(() => assertUniqueWorkdayDate(workdays, '2026-09-29')).not.toThrow();
    expect(() => assertSingleOpenWorkday([...workdays, workday('other', '2026-09-28', 'CLOSED')])).toThrow('لا يمكن تكرار');
  });

  it('rejects duplicate day identifiers in any state mutation', () => {
    expect(() => assertSingleOpenWorkday([workday('duplicate', '2026-09-28', 'CLOSED'), workday('duplicate', '2026-09-29', 'CLOSED')])).toThrow('تكرار معرف اليوم');
  });
});
