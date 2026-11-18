'use client';

import { apiRequest } from '@/lib/api-client';
import { mergeTodo, type Todo, type TodoInput } from '@/lib/todos';

export interface TodoStore {
  list: () => Promise<Todo[]>;
  save: (todo: TodoInput) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
}

export const remoteTodoStore: TodoStore = {
  list: () => apiRequest<Todo[]>('/api/todos'),
  save: async todo => { await apiRequest('/api/todos', { action: 'save', todo }); },
  remove: async ids => { await apiRequest('/api/todos', { action: 'delete', ids }); },
};

/** The browser-only preview keeps a separate list per account on this device. */
export function localTodoStore(accountKey: string): TodoStore {
  const key = `centerpro-todos-v1:${accountKey}`;
  const read = (): Todo[] => {
    try { const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value as Todo[] : []; }
    catch { return []; }
  };
  const write = (todos: Todo[]) => { window.localStorage.setItem(key, JSON.stringify(todos)); };
  return {
    list: async () => read(),
    save: async input => {
      const todos = read();
      const existing = todos.find(todo => todo.id === input.id);
      const next = mergeTodo(existing, input, new Date().toISOString());
      write(existing ? todos.map(todo => todo.id === input.id ? next : todo) : [next, ...todos]);
    },
    remove: async ids => { write(read().filter(todo => !ids.includes(todo.id))); },
  };
}
