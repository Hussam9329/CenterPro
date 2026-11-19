'use client';

import { useMemo, useRef, useState, type ComponentProps, type FocusEvent, type KeyboardEvent } from 'react';
import { ListChecks, Maximize2, Plus, Trash2 } from 'lucide-react';
import { TODO_LIMITS, TODO_PRIORITIES, TODO_PRIORITY_LABELS, toTodoInput, todoDueState, type Todo, type TodoClock, type TodoInput, type TodoPriority } from '@/lib/todos';
import { TodoSubtasks } from './todo-subtasks';
import styles from './todos.module.css';

const COLUMNS = 8;

interface CellInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur' | 'required'> {
  value: string;
  onCommit: (value: string) => void;
  required?: boolean;
}

/** Saves when the cell is left; Escape restores the saved value. */
function CellInput({ value, onCommit, required, className = '', ...props }: CellInputProps) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  if (saved !== value) { setSaved(value); setDraft(value); }

  function commit(event: FocusEvent<HTMLInputElement>) {
    const next = draft.trim();
    if (event.currentTarget.validity.badInput || (required && !next) || next === value) { setDraft(value); return; }
    onCommit(next);
  }
  return <input {...props} className={`${styles.cellInput} ${className}`} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Escape') setDraft(value); }}/>;
}

function PrioritySelect({ value, onChange, label }: { value: TodoPriority; onChange: (value: TodoPriority) => void; label: string }) {
  return <select className={`${styles.cellInput} ${styles[`priority${value}`]}`} value={value} onChange={event => onChange(event.target.value as TodoPriority)} aria-label={label}>
    {TODO_PRIORITIES.map(item => <option key={item} value={item}>{TODO_PRIORITY_LABELS[item]}</option>)}
  </select>;
}

function AddRow({ defaultDate, onAdd }: { defaultDate: string | null; onAdd: (todo: TodoInput) => void }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('NORMAL');
  const [dueDate, setDueDate] = useState(defaultDate ?? '');
  const [dueTime, setDueTime] = useState('');
  const [notes, setNotes] = useState('');

  function add() {
    const value = title.trim();
    if (!value) { titleRef.current?.focus(); return; }
    onAdd({ id: crypto.randomUUID(), title: value, notes: notes.trim(), priority, dueDate: dueDate || null, dueTime: dueDate && dueTime ? dueTime : null, subtasks: [], completed: false });
    setTitle(''); setPriority('NORMAL'); setDueDate(defaultDate ?? ''); setDueTime(''); setNotes('');
    titleRef.current?.focus();
  }
  function submitOnEnter(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' || (event.target as HTMLElement).tagName === 'BUTTON') return;
    event.preventDefault();
    event.stopPropagation();
    add();
  }

  return <tr data-row className={styles.addRow} onKeyDown={submitOnEnter}>
    <td className={styles.iconCell}><Plus size={18} aria-hidden="true"/></td>
    <td data-col="title"><input ref={titleRef} type="text" className={styles.cellInput} value={title} onChange={event => setTitle(event.target.value)} maxLength={TODO_LIMITS.title} placeholder="اكتب مهمة جديدة ثم اضغط Enter" aria-label="عنوان مهمة جديدة"/></td>
    <td data-col="priority"><PrioritySelect value={priority} onChange={setPriority} label="أولوية المهمة الجديدة"/></td>
    <td data-col="date"><input type="date" dir="ltr" className={styles.cellInput} value={dueDate} onChange={event => { setDueDate(event.target.value); if (!event.target.value) setDueTime(''); }} aria-label="تاريخ المهمة الجديدة"/></td>
    <td data-col="time"><input type="time" dir="ltr" className={styles.cellInput} value={dueTime} disabled={!dueDate} onChange={event => setDueTime(event.target.value)} aria-label="وقت المهمة الجديدة"/></td>
    <td data-col="notes"><input type="text" className={styles.cellInput} value={notes} onChange={event => setNotes(event.target.value)} maxLength={TODO_LIMITS.notes} placeholder="ملاحظة" aria-label="ملاحظات المهمة الجديدة"/></td>
    <td/>
    <td className={styles.actionsCell}><button type="button" className="btn btn-primary" onClick={add} disabled={!title.trim()}>إضافة</button></td>
  </tr>;
}

interface RowProps {
  todo: Todo;
  clock: TodoClock;
  onSave: (todo: TodoInput) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

function TodoTableRow({ todo, clock, onSave, onEdit, onDelete }: RowProps) {
  const [open, setOpen] = useState(false);
  const input = toTodoInput(todo);
  const patch = (changes: Partial<TodoInput>) => onSave({ ...input, ...changes });
  const finished = todo.subtasks.filter(item => item.done).length;
  const state = input.completed ? 'NONE' : todoDueState(todo, clock);
  const dueClass = state === 'OVERDUE' ? styles.late : state === 'TODAY' ? styles.dueToday : '';

  return <>
    <tr data-row className={input.completed ? styles.rowDone : ''}>
      <td className={styles.iconCell}><input type="checkbox" className={styles.check} checked={input.completed} onChange={event => patch({ completed: event.target.checked })} aria-label={`إنجاز المهمة: ${todo.title}`}/></td>
      <td data-col="title"><CellInput type="text" required className={styles.titleInput} value={todo.title} onCommit={title => patch({ title })} maxLength={TODO_LIMITS.title} title={todo.title} aria-label={`عنوان المهمة: ${todo.title}`}/></td>
      <td data-col="priority"><PrioritySelect value={todo.priority} onChange={priority => patch({ priority })} label={`أولوية: ${todo.title}`}/></td>
      <td data-col="date"><CellInput type="date" dir="ltr" className={dueClass} value={todo.dueDate ?? ''} onCommit={value => patch({ dueDate: value || null, dueTime: value ? todo.dueTime : null })} aria-label={`تاريخ: ${todo.title}`}/></td>
      <td data-col="time"><CellInput type="time" dir="ltr" className={dueClass} value={todo.dueTime ?? ''} disabled={!todo.dueDate} onCommit={value => patch({ dueTime: value || null })} aria-label={`وقت: ${todo.title}`}/></td>
      <td data-col="notes"><CellInput type="text" value={todo.notes} onCommit={notes => patch({ notes })} maxLength={TODO_LIMITS.notes} title={todo.notes} aria-label={`ملاحظات: ${todo.title}`}/></td>
      <td className={styles.iconCell}><button type="button" className={`${styles.subtaskToggle} ${open ? styles.subtaskOpen : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)} aria-label={`المهام الفرعية: ${todo.title}`}><ListChecks size={16} aria-hidden="true"/>{todo.subtasks.length > 0 && <bdi dir="ltr">{finished}/{todo.subtasks.length}</bdi>}</button></td>
      <td className={styles.actionsCell}>
        <button type="button" className="icon-button" onClick={() => onEdit(todo)} aria-label={`كل تفاصيل: ${todo.title}`}><Maximize2 size={16}/></button>
        <button type="button" className="icon-button" onClick={() => onDelete(todo)} aria-label={`حذف: ${todo.title}`}><Trash2 size={16}/></button>
      </td>
    </tr>
    {open && <tr className={styles.panelRow}><td colSpan={COLUMNS}><TodoSubtasks todo={todo} onSave={onSave}/></td></tr>}
  </>;
}

interface TodoTableProps extends Omit<RowProps, 'todo'> {
  todos: readonly Todo[];
  /** The current filter's rows in display order. */
  rows: readonly Todo[];
  /** Null hides the add row on views a new task could not belong to. */
  addDate: { date: string | null } | null;
  emptyTitle: string;
}

export function TodoTable({ todos, rows, addDate, emptyTitle, clock, onSave, onEdit, onDelete }: TodoTableProps) {
  // Rows hold still while someone is typing in the table, then re-sort when they leave it.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const shown = useMemo(() => {
    if (!frozen) return rows;
    const byId = new Map(todos.map(todo => [todo.id, todo]));
    return frozen.flatMap(id => byId.get(id) ?? []);
  }, [frozen, rows, todos]);

  function leave(event: FocusEvent<HTMLTableElement>) {
    if (!event.currentTarget.contains(event.relatedTarget) && document.hasFocus()) setFrozen(null);
  }
  function add(todo: TodoInput) {
    onSave(todo);
    setFrozen(current => current ? [todo.id, ...current] : current);
  }
  /** Enter and the arrow keys move along a column, like a spreadsheet. */
  function navigate(event: KeyboardEvent<HTMLTableElement>) {
    const element = event.target as HTMLInputElement;
    const column = element.closest<HTMLElement>('[data-col]')?.dataset.col;
    const row = element.closest('tr[data-row]');
    const moves = event.key === 'Enter' || ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && element.type === 'text');
    if (!column || !row || !moves || element.tagName === 'SELECT') return;
    event.preventDefault();
    const all = [...event.currentTarget.querySelectorAll('tr[data-row]')];
    const step = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1;
    for (let index = all.indexOf(row) + step; all[index]; index += step) {
      const target = all[index].querySelector<HTMLInputElement>(`[data-col="${column}"] input:not(:disabled), [data-col="${column}"] select`);
      if (!target) continue;
      target.focus();
      if (target.type === 'text') target.select();
      return;
    }
    element.blur();
  }

  return <div className={styles.tableWrap}>
    <table className={styles.table} onFocusCapture={() => setFrozen(current => current ?? rows.map(todo => todo.id))} onBlurCapture={leave} onKeyDown={navigate}>
      <colgroup><col className={styles.colIcon}/><col/><col className={styles.colPriority}/><col className={styles.colDate}/><col className={styles.colTime}/><col className={styles.colNotes}/><col className={styles.colSubtasks}/><col className={styles.colActions}/></colgroup>
      <thead><tr>
        <th scope="col"><span className="sr-only">الإنجاز</span></th>
        <th scope="col">المهمة</th>
        <th scope="col">الأولوية</th>
        <th scope="col">التاريخ</th>
        <th scope="col">الوقت</th>
        <th scope="col">ملاحظات</th>
        <th scope="col">فرعية</th>
        <th scope="col"><span className="sr-only">إجراءات</span></th>
      </tr></thead>
      <tbody>
        {addDate && <AddRow defaultDate={addDate.date} onAdd={add}/>}
        {shown.map(todo => <TodoTableRow key={todo.id} todo={todo} clock={clock} onSave={onSave} onEdit={onEdit} onDelete={onDelete}/>)}
        {!shown.length && <tr><td colSpan={COLUMNS} className={styles.emptyCell}>{emptyTitle}</td></tr>}
      </tbody>
    </table>
  </div>;
}
