'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Dialog, Field, Input, Textarea } from '@/components/ui';
import { TODO_LIMITS, TODO_PRIORITIES, TODO_PRIORITY_LABELS, shiftDate, toTodoInput, todoInputSchema, type Todo, type TodoClock, type TodoInput, type TodoPriority, type TodoSubtask } from '@/lib/todos';
import styles from './todos.module.css';

interface TodoEditorProps {
  todo?: Todo;
  defaultDate: string | null;
  clock: TodoClock;
  onClose: () => void;
  onSave: (todo: TodoInput) => void;
}

export function TodoEditor({ todo, defaultDate, clock, onClose, onSave }: TodoEditorProps) {
  const [title, setTitle] = useState(todo?.title ?? '');
  const [notes, setNotes] = useState(todo?.notes ?? '');
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? 'NORMAL');
  const [dueDate, setDueDate] = useState(todo ? todo.dueDate ?? '' : defaultDate ?? '');
  const [dueTime, setDueTime] = useState(todo?.dueTime ?? '');
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>(todo?.subtasks ?? []);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const tomorrow = shiftDate(clock.date, 1);

  function pickDate(value: string) {
    setDueDate(value);
    if (!value) setDueTime('');
  }
  function addSubtask() {
    const value = draft.trim();
    if (!value || subtasks.length >= TODO_LIMITS.subtasks) return;
    setSubtasks(current => [...current, { id: crypto.randomUUID(), title: value, done: false }]);
    setDraft('');
  }
  function subtaskKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addSubtask();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const pending = draft.trim() && subtasks.length < TODO_LIMITS.subtasks ? [{ id: crypto.randomUUID(), title: draft.trim(), done: false }] : [];
    const parsed = todoInputSchema.safeParse({
      id: todo?.id ?? crypto.randomUUID(), title, notes, priority, dueDate: dueDate || null, dueTime: dueDate && dueTime ? dueTime : null,
      subtasks: [...subtasks, ...pending].filter(item => item.title.trim()), completed: todo ? toTodoInput(todo).completed : false,
    });
    if (!parsed.success) { setError(title.trim() ? 'تحقق من التاريخ والوقت ثم أعد المحاولة.' : 'اكتب عنوان المهمة.'); return; }
    onSave(parsed.data);
    onClose();
  }

  return <Dialog open onClose={onClose} title={todo ? 'تعديل المهمة' : 'مهمة جديدة'} wide>
    <form onSubmit={submit} className={styles.editor} noValidate>
      <Field label="عنوان المهمة" required error={error}><Input value={title} onChange={event => { setTitle(event.target.value); setError(''); }} maxLength={TODO_LIMITS.title} autoFocus/></Field>
      <fieldset className={styles.priorityGroup}>
        <legend className="field-label">الأولوية</legend>
        <div>{TODO_PRIORITIES.map(value => <label key={value} className={priority === value ? styles.priorityActive : ''}>
          <input type="radio" name="todo-priority" className="sr-only" checked={priority === value} onChange={() => setPriority(value)}/>
          {TODO_PRIORITY_LABELS[value]}
        </label>)}</div>
      </fieldset>
      <div className={styles.dueFields}>
        <Field label="تاريخ الإنجاز"><Input type="date" dir="ltr" value={dueDate} onChange={event => pickDate(event.target.value)}/></Field>
        <Field label="الوقت"><Input type="time" dir="ltr" value={dueTime} disabled={!dueDate} onChange={event => setDueTime(event.target.value)}/></Field>
      </div>
      <div className={styles.quickDates}>
        <Button variant="secondary" onClick={() => pickDate(clock.date)} aria-pressed={dueDate === clock.date}>اليوم</Button>
        <Button variant="secondary" onClick={() => pickDate(tomorrow)} aria-pressed={dueDate === tomorrow}>غداً</Button>
        <Button variant="ghost" onClick={() => pickDate('')} disabled={!dueDate}>بدون موعد</Button>
      </div>
      <Field label="ملاحظات"><Textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={TODO_LIMITS.notes} rows={3}/></Field>
      <fieldset className={styles.subtaskEditor}>
        <legend className="field-label">المهام الفرعية</legend>
        {subtasks.map((item, index) => <div key={item.id} className={styles.subtaskAdd}>
          <Input value={item.title} onChange={event => setSubtasks(current => current.map(row => row.id === item.id ? { ...row, title: event.target.value } : row))} maxLength={TODO_LIMITS.title} aria-label={`المهمة الفرعية ${index + 1}`}/>
          <button type="button" className="icon-button" onClick={() => setSubtasks(current => current.filter(row => row.id !== item.id))} aria-label={`إزالة المهمة الفرعية ${index + 1}`}><X size={18}/></button>
        </div>)}
        {subtasks.length < TODO_LIMITS.subtasks && <div className={styles.subtaskAdd}>
          <Input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={subtaskKey} maxLength={TODO_LIMITS.title} placeholder="أضف خطوة ثم اضغط Enter" aria-label="مهمة فرعية جديدة"/>
          <button type="button" className="icon-button" onClick={addSubtask} disabled={!draft.trim()} aria-label="إضافة المهمة الفرعية"><Plus size={18}/></button>
        </div>}
      </fieldset>
      <div className="form-actions">
        <Button type="submit">حفظ</Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </form>
  </Dialog>;
}
