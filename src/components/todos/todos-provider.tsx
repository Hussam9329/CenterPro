'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDemo } from '@/components/demo-provider';
import { baghdadTime, mergeTodo, todoCounts, type Todo, type TodoClock, type TodoFilter, type TodoInput } from '@/lib/todos';
import type { DemoSession } from '@/lib/types';
import { localTodoStore, remoteTodoStore } from './todo-store';

interface TodosValue {
  todos: Todo[];
  status: 'loading' | 'ready' | 'error';
  clock: TodoClock;
  counts: Record<TodoFilter, number>;
  /** Tasks due today or already late: the number shown in the menu. */
  attention: number;
  save: (todo: TodoInput) => void;
  remove: (ids: string[]) => void;
  retry: () => void;
}

const TodosContext = createContext<TodosValue | null>(null);

export function useTodos(): TodosValue {
  const value = useContext(TodosContext);
  if (!value) throw new Error('TodosProvider is required');
  return value;
}

export const todoAccountKey = (session: DemoSession) => session.employeeId ?? 'SYSTEM';

/** Lists are shared by the menu count, the home card and the page, and update instantly on screen. */
export function TodosProvider({ children }: { children: ReactNode }) {
  const { backend, session, today, notify } = useDemo();
  const accountKey = session ? todoAccountKey(session) : 'SYSTEM';
  const store = useMemo(() => backend === 'neon' ? remoteTodoStore : localTodoStore(accountKey), [backend, accountKey]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [status, setStatus] = useState<TodosValue['status']>('loading');
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  // Writes run strictly in order, so quick repeated taps can never land out of sequence.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    queue.current = queue.current.then(() => store.list())
      .then(rows => { if (alive) { setTodos(rows); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [store, attempt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const write = useCallback((operation: () => Promise<void>) => {
    queue.current = queue.current.then(operation).catch((failure: unknown) => {
      notify(failure instanceof Error ? failure.message : 'تعذر حفظ التغيير. حاول مرة أخرى.');
      setAttempt(value => value + 1); // Replace the on-screen change with what was really saved.
    });
  }, [notify]);

  const save = useCallback((input: TodoInput) => {
    const nowIso = new Date().toISOString();
    setTodos(current => {
      const existing = current.find(todo => todo.id === input.id);
      const next = mergeTodo(existing, input, nowIso);
      return existing ? current.map(todo => todo.id === input.id ? next : todo) : [next, ...current];
    });
    write(() => store.save(input));
  }, [store, write]);

  const remove = useCallback((ids: string[]) => {
    setTodos(current => current.filter(todo => !ids.includes(todo.id)));
    write(() => store.remove(ids));
  }, [store, write]);

  const retry = useCallback(() => { setStatus('loading'); setAttempt(value => value + 1); }, []);

  const value = useMemo<TodosValue>(() => {
    const clock = { date: today, time: baghdadTime(now) };
    const counts = todoCounts(todos, clock);
    return { todos, status, clock, counts, attention: counts.TODAY + counts.OVERDUE, save, remove, retry };
  }, [todos, status, today, now, save, remove, retry]);

  return <TodosContext.Provider value={value}>{children}</TodosContext.Provider>;
}
