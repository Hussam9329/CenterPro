'use client';

import { CalendarClock, ListChecks, StickyNote } from 'lucide-react';
import { Badge } from '@/components/ui';
import { date } from '@/lib/format';
import { TODO_PRIORITY_LABELS, shiftDate, todoDueState, type Todo, type TodoClock } from '@/lib/todos';
import styles from './todos.module.css';

function clockLabel(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function dayLabel(value: string, clock: TodoClock): string {
  if (value === clock.date) return 'اليوم';
  if (value === shiftDate(clock.date, 1)) return 'غداً';
  if (value === shiftDate(clock.date, -1)) return 'أمس';
  return date(value);
}

/** Spans only: this sits inside the row's expand button. */
export function TodoMeta({ todo, clock }: { todo: Todo; clock: TodoClock }) {
  const open = todo.completedAt === null;
  const state = todoDueState(todo, clock);
  const finished = todo.subtasks.filter(item => item.done).length;
  const dueClass = open && state === 'OVERDUE' ? styles.late : open && state === 'TODAY' ? styles.dueToday : '';
  return <span className={styles.meta}>
    {todo.priority !== 'NORMAL' && <Badge tone={todo.priority === 'URGENT' ? 'danger' : 'warning'}>{TODO_PRIORITY_LABELS[todo.priority]}</Badge>}
    {todo.dueDate && <span className={`${styles.metaItem} ${dueClass}`}><CalendarClock size={14} aria-hidden="true"/>{open && state === 'OVERDUE' && 'متأخرة · '}<bdi>{dayLabel(todo.dueDate, clock)}</bdi>{todo.dueTime && <bdi dir="ltr">{clockLabel(todo.dueTime)}</bdi>}</span>}
    {todo.subtasks.length > 0 && <span className={styles.metaItem}><ListChecks size={14} aria-hidden="true"/><span className="sr-only">المهام الفرعية المنجزة</span><bdi dir="ltr">{finished}/{todo.subtasks.length}</bdi></span>}
    {todo.notes && <span className={styles.metaItem}><StickyNote size={14} aria-hidden="true"/><span className="sr-only">تحتوي على ملاحظات</span></span>}
  </span>;
}
