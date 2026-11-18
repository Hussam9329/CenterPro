import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { TODO_LIMITS, mergeTodo, type Todo, type TodoInput, type TodoPriority } from '@/lib/todos';
import { requireIdentity, type StateContext } from './auth/state';
import { todos } from './db/schema';
import { ApiError } from './http';

/** The owner of every query comes from the session only; no role can name another account. */
function todoAccount(context: Pick<StateContext, 'identity'>): string {
  const identity = requireIdentity(context);
  if (identity.actor.role === 'QR_DISPLAY') throw new ApiError(403, 'قائمة المهام غير متاحة لحساب شاشة الحضور.');
  return identity.accountKey;
}

const toTodo = (row: typeof todos.$inferSelect): Todo => ({
  id: row.id, title: row.title, notes: row.notes, priority: row.priority as TodoPriority, dueDate: row.dueDate, dueTime: row.dueTime, subtasks: row.subtasks,
  completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listTodos(context: Pick<StateContext, 'tx' | 'identity'>): Promise<Todo[]> {
  const rows = await context.tx.select().from(todos).where(eq(todos.accountKey, todoAccount(context))).orderBy(desc(todos.createdAt));
  return rows.map(toTodo);
}

export async function saveTodo(context: StateContext, input: TodoInput): Promise<Todo> {
  const accountKey = todoAccount(context);
  const [row] = await context.tx.select().from(todos).where(and(eq(todos.accountKey, accountKey), eq(todos.id, input.id))).limit(1);
  if (!row) {
    const [total] = await context.tx.select({ value: count() }).from(todos).where(eq(todos.accountKey, accountKey));
    if ((total?.value ?? 0) >= TODO_LIMITS.perAccount) throw new ApiError(409, 'وصلت إلى الحد الأعلى للمهام. احذف المهام المنجزة ثم أعد المحاولة.');
  }
  const todo = mergeTodo(row ? toTodo(row) : undefined, input, context.now.toISOString());
  const fields = {
    title: todo.title, notes: todo.notes, priority: todo.priority, dueDate: todo.dueDate, dueTime: todo.dueTime, subtasks: todo.subtasks,
    completedAt: todo.completedAt ? new Date(todo.completedAt) : null, updatedAt: context.now,
  };
  await context.tx.insert(todos).values({ accountKey, id: todo.id, createdAt: new Date(todo.createdAt), ...fields }).onConflictDoUpdate({ target: [todos.accountKey, todos.id], set: fields });
  return todo;
}

export async function deleteTodos(context: StateContext, ids: string[]): Promise<{ deleted: number }> {
  const rows = await context.tx.delete(todos).where(and(eq(todos.accountKey, todoAccount(context)), inArray(todos.id, ids))).returning({ id: todos.id });
  return { deleted: rows.length };
}
