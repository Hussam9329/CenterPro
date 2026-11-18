'use client';

import { useState, type FormEvent } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui';
import { TODO_LIMITS, toTodoInput, type Todo, type TodoClock, type TodoInput } from '@/lib/todos';
import { TodoMeta } from './todo-meta';
import styles from './todos.module.css';

interface TodoRowProps {
  todo: Todo;
  clock: TodoClock;
  onSave: (todo: TodoInput) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoRow({ todo, clock, onSave, onEdit, onDelete }: TodoRowProps) {
  const [open, setOpen] = useState(false);
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

  return <li className={`${styles.row} ${input.completed ? styles.rowDone : ''}`}>
    <div className={styles.rowMain}>
      <input type="checkbox" className={styles.check} checked={input.completed} onChange={event => onSave({ ...input, completed: event.target.checked })} aria-label={`إنجاز المهمة: ${todo.title}`}/>
      <button type="button" className={styles.rowText} aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <strong>{todo.title}</strong>
        <TodoMeta todo={todo} clock={clock}/>
      </button>
      <div className={styles.rowActions}>
        <button type="button" className="icon-button" onClick={() => setOpen(value => !value)} aria-label={`${open ? 'إخفاء' : 'عرض'} تفاصيل: ${todo.title}`}><ChevronDown size={18} className={open ? styles.chevronOpen : ''}/></button>
        <button type="button" className="icon-button" onClick={() => onEdit(todo)} aria-label={`تعديل: ${todo.title}`}><Pencil size={17}/></button>
        <button type="button" className="icon-button" onClick={() => onDelete(todo)} aria-label={`حذف: ${todo.title}`}><Trash2 size={17}/></button>
      </div>
    </div>
    {open && <div className={styles.details}>
      {todo.notes && <p className={styles.notes}>{todo.notes}</p>}
      {todo.subtasks.length > 0 && <div className={styles.progress} role="progressbar" aria-label="تقدم المهام الفرعية" aria-valuemin={0} aria-valuemax={todo.subtasks.length} aria-valuenow={finished}><span style={{ width: `${finished / todo.subtasks.length * 100}%` }}/></div>}
      {todo.subtasks.length > 0 && <ul className={styles.subtasks}>{todo.subtasks.map(item => <li key={item.id}>
        <label className={item.done ? styles.subtaskDone : ''}>
          <input type="checkbox" className={styles.check} checked={item.done} onChange={event => onSave({ ...input, subtasks: input.subtasks.map(row => row.id === item.id ? { ...row, done: event.target.checked } : row) })}/>
          <span>{item.title}</span>
        </label>
      </li>)}</ul>}
      {todo.subtasks.length < TODO_LIMITS.subtasks && <form className={styles.subtaskAdd} onSubmit={addSubtask}>
        <Input value={draft} onChange={event => setDraft(event.target.value)} maxLength={TODO_LIMITS.title} placeholder="أضف مهمة فرعية" aria-label={`إضافة مهمة فرعية إلى: ${todo.title}`}/>
        <button type="submit" className="icon-button" disabled={!draft.trim()} aria-label="إضافة المهمة الفرعية"><Plus size={18}/></button>
      </form>}
    </div>}
  </li>;
}
