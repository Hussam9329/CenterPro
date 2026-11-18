import { z } from 'zod';

export const TODO_LIMITS = { title: 200, notes: 2000, subtasks: 30, perAccount: 500 } as const;

export const TODO_PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];
export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = { NORMAL: 'عادية', HIGH: 'مهمة', URGENT: 'عاجلة' };

export interface TodoSubtask { id: string; title: string; done: boolean }
export interface TodoInput {
  id: string;
  title: string;
  notes: string;
  priority: TodoPriority;
  dueDate: string | null;
  dueTime: string | null;
  subtasks: TodoSubtask[];
  completed: boolean;
}
export interface Todo extends Omit<TodoInput, 'completed'> {
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const subtaskSchema = z.strictObject({ id: z.uuid(), title: z.string().trim().min(1).max(TODO_LIMITS.title), done: z.boolean() });

export const todoInputSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(TODO_LIMITS.title),
  notes: z.string().trim().max(TODO_LIMITS.notes),
  priority: z.enum(TODO_PRIORITIES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate).nullable(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  subtasks: z.array(subtaskSchema).max(TODO_LIMITS.subtasks),
  completed: z.boolean(),
}).refine(todo => todo.dueTime === null || todo.dueDate !== null)
  .refine(todo => new Set(todo.subtasks.map(item => item.id)).size === todo.subtasks.length);

export const todoMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('save'), todo: todoInputSchema }),
  z.strictObject({ action: z.literal('delete'), ids: z.array(z.uuid()).min(1).max(TODO_LIMITS.perAccount) }),
]);

export function toTodoInput(todo: Todo): TodoInput {
  return { id: todo.id, title: todo.title, notes: todo.notes, priority: todo.priority, dueDate: todo.dueDate, dueTime: todo.dueTime, subtasks: todo.subtasks, completed: todo.completedAt !== null };
}

/** One rule for the server, the on-screen update and the local preview. */
export function mergeTodo(existing: Todo | undefined, input: TodoInput, nowIso: string): Todo {
  const { completed, ...fields } = input;
  return { ...fields, completedAt: completed ? existing?.completedAt ?? nowIso : null, createdAt: existing?.createdAt ?? nowIso, updatedAt: nowIso };
}

export interface TodoClock { date: string; time: string }
export type TodoDueState = 'NONE' | 'OVERDUE' | 'TODAY' | 'UPCOMING';
export type TodoFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'OVERDUE' | 'DONE';
export type TodoSort = 'SMART' | 'PRIORITY' | 'NEWEST';

/** The center runs on Baghdad time (UTC+3, no daylight saving). */
export function baghdadTime(now: Date): string { return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16); }

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function todoDueState(todo: Pick<Todo, 'dueDate' | 'dueTime'>, clock: TodoClock): TodoDueState {
  if (!todo.dueDate) return 'NONE';
  if (todo.dueDate < clock.date) return 'OVERDUE';
  if (todo.dueDate > clock.date) return 'UPCOMING';
  return todo.dueTime && todo.dueTime < clock.time ? 'OVERDUE' : 'TODAY';
}

function matchesFilter(todo: Todo, filter: TodoFilter, clock: TodoClock): boolean {
  if (filter === 'DONE') return todo.completedAt !== null;
  if (todo.completedAt !== null) return false;
  return filter === 'ALL' || todoDueState(todo, clock) === filter;
}

export function todoCounts(todos: readonly Todo[], clock: TodoClock): Record<TodoFilter, number> {
  const count = (filter: TodoFilter) => todos.filter(todo => matchesFilter(todo, filter, clock)).length;
  return { ALL: count('ALL'), TODAY: count('TODAY'), UPCOMING: count('UPCOMING'), OVERDUE: count('OVERDUE'), DONE: count('DONE') };
}

const DUE_ORDER: Record<TodoDueState, number> = { OVERDUE: 0, TODAY: 1, UPCOMING: 2, NONE: 3 };
const PRIORITY_ORDER: Record<TodoPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };
const dueKey = (todo: Todo) => `${todo.dueDate ?? ''}T${todo.dueTime ?? '99:99'}`;
const newestFirst = (a: Todo, b: Todo) => b.createdAt.localeCompare(a.createdAt);

function smartOrder(a: Todo, b: Todo, clock: TodoClock): number {
  return DUE_ORDER[todoDueState(a, clock)] - DUE_ORDER[todoDueState(b, clock)]
    || dueKey(a).localeCompare(dueKey(b))
    || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || newestFirst(a, b);
}

export function visibleTodos(todos: readonly Todo[], options: { filter: TodoFilter; sort: TodoSort; query: string; clock: TodoClock }): Todo[] {
  const { filter, sort, clock } = options;
  const query = options.query.trim().toLocaleLowerCase('ar');
  const found = (text: string) => text.toLocaleLowerCase('ar').includes(query);
  const rows = todos.filter(todo => matchesFilter(todo, filter, clock) && (!query || found(todo.title) || found(todo.notes) || todo.subtasks.some(item => found(item.title))));
  if (filter === 'DONE') return rows.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  if (sort === 'NEWEST') return rows.sort(newestFirst);
  if (sort === 'PRIORITY') return rows.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || smartOrder(a, b, clock));
  return rows.sort((a, b) => smartOrder(a, b, clock));
}
