import { describe, expect, it } from 'vitest';
import { baghdadTime, mergeTodo, shiftDate, todoCounts, todoDueState, todoInputSchema, todoMutationSchema, visibleTodos, type Todo, type TodoInput } from '@/lib/todos';

const clock = { date: '2026-11-19', time: '12:00' };
let sequence = 0;
function todo(overrides: Partial<Todo> = {}): Todo {
  sequence += 1;
  return { id: `todo-${sequence}`, title: `مهمة ${sequence}`, notes: '', priority: 'NORMAL', dueDate: null, dueTime: null, subtasks: [], completedAt: null, createdAt: `2026-11-01T00:00:${String(sequence % 60).padStart(2, '0')}.000Z`, updatedAt: '2026-11-01T00:00:00.000Z', ...overrides };
}
const input = (overrides: Partial<TodoInput> = {}): TodoInput => ({ id: '3f0e7f3a-4c55-4a57-9f0e-0c7b4d7a8a11', title: 'مهمة', notes: '', priority: 'NORMAL', dueDate: null, dueTime: null, subtasks: [], completed: false, ...overrides });

describe('due state on Baghdad time', () => {
  it('separates late, today, upcoming and undated tasks', () => {
    expect(todoDueState({ dueDate: null, dueTime: null }, clock)).toBe('NONE');
    expect(todoDueState({ dueDate: '2026-11-18', dueTime: null }, clock)).toBe('OVERDUE');
    expect(todoDueState({ dueDate: '2026-11-19', dueTime: null }, clock)).toBe('TODAY');
    expect(todoDueState({ dueDate: '2026-11-19', dueTime: '12:00' }, clock)).toBe('TODAY');
    expect(todoDueState({ dueDate: '2026-11-19', dueTime: '11:59' }, clock)).toBe('OVERDUE');
    expect(todoDueState({ dueDate: '2026-11-20', dueTime: '01:00' }, clock)).toBe('UPCOMING');
  });

  it('reads the clock in Baghdad and moves across month ends', () => {
    expect(baghdadTime(new Date('2026-11-19T21:30:00.000Z'))).toBe('00:30');
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('filters, search and order', () => {
  const late = todo({ dueDate: '2026-11-10', title: 'متأخرة' });
  const today = todo({ dueDate: '2026-11-19', priority: 'URGENT', notes: 'اتصل بالمورد' });
  const next = todo({ dueDate: '2026-11-25', subtasks: [{ id: 'a', title: 'طباعة الكشف', done: false }] });
  const plain = todo({ priority: 'HIGH' });
  const done = todo({ dueDate: '2026-11-01', completedAt: '2026-11-02T00:00:00.000Z' });
  const all = [plain, done, next, today, late];

  it('counts completed tasks only under done, never as late', () => {
    expect(todoCounts(all, clock)).toEqual({ ALL: 4, TODAY: 1, UPCOMING: 1, OVERDUE: 1, DONE: 1 });
  });

  it('orders by urgency of the date, by priority or by newest', () => {
    const ids = (sort: 'SMART' | 'PRIORITY' | 'NEWEST') => visibleTodos(all, { filter: 'ALL', sort, query: '', clock }).map(item => item.id);
    expect(ids('SMART')).toEqual([late.id, today.id, next.id, plain.id]);
    expect(ids('PRIORITY')).toEqual([today.id, plain.id, late.id, next.id]);
    expect(ids('NEWEST')).toEqual([plain.id, next.id, today.id, late.id]);
  });

  it('searches titles, notes and subtasks', () => {
    const find = (query: string) => visibleTodos(all, { filter: 'ALL', sort: 'SMART', query, clock }).map(item => item.id);
    expect(find('  المورد ')).toEqual([today.id]);
    expect(find('الكشف')).toEqual([next.id]);
    expect(find('غير موجود')).toEqual([]);
  });
});

describe('saving rules', () => {
  it('keeps the first completion time and clears it when reopened', () => {
    const created = mergeTodo(undefined, input({ completed: true }), '2026-11-19T10:00:00.000Z');
    expect(created.completedAt).toBe('2026-11-19T10:00:00.000Z');
    const edited = mergeTodo(created, input({ completed: true, title: 'جديد' }), '2026-11-19T11:00:00.000Z');
    expect(edited).toMatchObject({ completedAt: '2026-11-19T10:00:00.000Z', createdAt: '2026-11-19T10:00:00.000Z', updatedAt: '2026-11-19T11:00:00.000Z', title: 'جديد' });
    expect(mergeTodo(edited, input(), '2026-11-19T12:00:00.000Z').completedAt).toBeNull();
  });

  it('rejects malformed tasks and extra fields such as another account', () => {
    expect(todoInputSchema.safeParse(input({ title: '  مهمة  ' })).data?.title).toBe('مهمة');
    for (const bad of [input({ title: '   ' }), input({ title: 'x'.repeat(201) }), input({ notes: 'x'.repeat(2001) }), input({ dueDate: '2026-02-30' }), input({ dueTime: '10:00' }), input({ dueDate: '2026-11-19', dueTime: '25:00' }), { ...input(), accountKey: 'SYSTEM' }]) {
      expect(todoInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    const sub = { id: '6c1d3a54-7a7f-4f35-8f43-1f7b2f0f5b10', title: 'خطوة', done: false };
    expect(todoInputSchema.safeParse(input({ subtasks: [sub, sub] })).success).toBe(false);
    expect(todoMutationSchema.safeParse({ action: 'delete', ids: [] }).success).toBe(false);
  });
});
