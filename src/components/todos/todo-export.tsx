'use client';

import { date } from '@/lib/format';
import type { CenterReport, ReportCell } from '@/lib/report-export';
import { TODO_PRIORITY_LABELS, todoDueState, type Todo, type TodoClock, type TodoDueState } from '@/lib/todos';
import { clockLabel } from './todo-meta';
import styles from './todos.module.css';

const STATUS_LABELS: Record<TodoDueState, string> = { OVERDUE: 'متأخرة', TODAY: 'اليوم', UPCOMING: 'قادمة', NONE: 'بدون موعد' };

/** One description of the visible rows, so Excel and PDF always contain the same thing. */
export function buildTodoReport(todos: readonly Todo[], options: { owner: string; view: string; clock: TodoClock }): CenterReport {
  return {
    title: 'To Do List', period: options.clock.date, subtitle: `${options.owner} · ${options.view} · ${todos.length} مهمة`,
    sections: [{
      title: 'To Do List',
      columns: [
        { key: 'index', label: '#', type: 'number', width: 7 },
        { key: 'title', label: 'المهمة', width: 44 },
        { key: 'status', label: 'الحالة', width: 14 },
        { key: 'priority', label: 'الأولوية', width: 12 },
        { key: 'dueDate', label: 'التاريخ', type: 'date', width: 15 },
        { key: 'dueTime', label: 'الوقت', width: 13 },
        { key: 'notes', label: 'ملاحظات', width: 44 },
        { key: 'subtasks', label: 'المهام الفرعية', width: 36 },
      ],
      rows: todos.map((todo, index) => ({
        index: index + 1, title: todo.title,
        status: todo.completedAt ? 'منجزة' : STATUS_LABELS[todoDueState(todo, options.clock)],
        priority: TODO_PRIORITY_LABELS[todo.priority],
        dueDate: todo.dueDate ? new Date(`${todo.dueDate}T12:00:00.000Z`) : '',
        // The invisible left-to-right mark keeps "11:30 PM" in order inside right-to-left cells.
        dueTime: todo.dueTime ? clockLabel(todo.dueTime).replace(' ', '‎ ') : '',
        notes: todo.notes,
        subtasks: todo.subtasks.map(item => `${item.done ? '✓' : '○'} ${item.title}`).join('\n'),
      })),
    }],
  };
}

const printable = (value: ReportCell | undefined) => value instanceof Date ? date(value.toISOString().slice(0, 10)) : value ?? '';

/** Hidden on screen; it is the only part of the page that prints. */
export function TodoPrintSheet({ report }: { report: CenterReport }) {
  const [{ columns, rows }] = report.sections;
  return <section className={styles.printSheet} data-testid="todo-print-sheet">
    <header><div><strong>CenterPro</strong><h2>{report.title}</h2></div><p>{report.subtitle}<br/><bdi dir="ltr">{date(report.period)}</bdi></p></header>
    <table>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={String(row.index)}>{columns.map(column => <td key={column.key}>{printable(row[column.key])}</td>)}</tr>)}</tbody>
    </table>
  </section>;
}
