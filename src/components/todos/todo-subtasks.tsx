'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui';
import { TODO_LIMITS, toTodoInput, type Todo, type TodoInput } from '@/lib/todos';
import styles from './todos.module.css';

export function TodoSubtasks({ todo, onSave }: { todo: Todo; onSave: (todo: TodoInput) => void }) {
  const [draft, setDraft] = useState('');
  const input = toTodoInput(todo);
  const finished = todo.subtasks.filter(item => item.done).length;

  function addSubtask(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onSave({ ...input, subtasks: [...input.subtasks, { id: crypto.randomUUID(), title, done: false }] });
    setDraft('');
  }

  return <div className={styles.details}>
    {todo.subtasks.length > 0 && <div className={styles.progress} role="progressbar" aria-label="تقدم المهام الفرعية" aria-valuemin={0} aria-valuemax={todo.subtasks.length} aria-valuenow={finished}><span style={{ width: `${finished / todo.subtasks.length * 100}%` }}/></div>}
    {todo.subtasks.length > 0 && <ul className={styles.subtasks}>{todo.subtasks.map(item => <li key={item.id}>
      <label className={item.done ? styles.subtaskDone : ''}>
        <input type="checkbox" className={styles.check} checked={item.done} onChange={event => onSave({ ...input, subtasks: input.subtasks.map(row => row.id === item.id ? { ...row, done: event.target.checked } : row) })}/>
        <span>{item.title}</span>
      </label>
    </li>)}</ul>}
    {todo.subtasks.length < TODO_LIMITS.subtasks && <form className={styles.subtaskAdd} onSubmit={addSubtask}>
      <Input value={draft} onChange={event => setDraft(event.target.value)} maxLength={TODO_LIMITS.title} placeholder="أضف مهمة فرعية ثم اضغط Enter" aria-label={`إضافة مهمة فرعية إلى: ${todo.title}`} autoFocus/>
      <button type="submit" className="icon-button" disabled={!draft.trim()} aria-label="إضافة المهمة الفرعية"><Plus size={18}/></button>
    </form>}
  </div>;
}
