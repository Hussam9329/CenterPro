'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, SearchInput, Select, Skeleton, Tabs } from '@/components/ui';
import { TODO_LIMITS, toTodoInput, visibleTodos, type Todo, type TodoFilter, type TodoInput, type TodoSort } from '@/lib/todos';
import { TodoEditor } from './todo-editor';
import { TodoRow } from './todo-row';
import { useTodos } from './todos-provider';
import styles from './todos.module.css';

const FILTER_LABELS: Record<TodoFilter, string> = { ALL: 'الكل', TODAY: 'اليوم', UPCOMING: 'القادمة', OVERDUE: 'المتأخرة', DONE: 'المنجزة' };
const EMPTY_TITLES: Record<TodoFilter, string> = { ALL: 'لا توجد مهام مفتوحة', TODAY: 'لا توجد مهام لليوم', UPCOMING: 'لا توجد مهام قادمة', OVERDUE: 'لا توجد مهام متأخرة', DONE: 'لم تُنجز أي مهمة بعد' };

export function TodoPage() {
  const { todos, status, clock, counts, save, remove, retry } = useTodos();
  const [filter, setFilter] = useState<TodoFilter>('ALL');
  const [sort, setSort] = useState<TodoSort>('SMART');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState('');
  const [editor, setEditor] = useState<{ todo?: Todo } | null>(null);
  const [deleted, setDeleted] = useState<Todo | null>(null);
  const [clearing, setClearing] = useState(false);
  const rows = useMemo(() => visibleTodos(todos, { filter, sort, query, clock }), [todos, filter, sort, query, clock]);
  const defaultDate = filter === 'TODAY' ? clock.date : null;

  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deleted]);

  /** A new task must be visible right away, whichever view the person was on. */
  function showNewTask(todo: TodoInput) {
    setQuery('');
    if (filter !== 'ALL' && !(filter === 'TODAY' && todo.dueDate === clock.date)) setFilter('ALL');
  }
  function quickAdd(event: FormEvent) {
    event.preventDefault();
    const title = quick.trim();
    if (!title) return;
    const todo: TodoInput = { id: crypto.randomUUID(), title, notes: '', priority: 'NORMAL', dueDate: defaultDate, dueTime: null, subtasks: [], completed: false };
    save(todo);
    showNewTask(todo);
    setQuick('');
  }
  function saveFromEditor(todo: TodoInput) {
    save(todo);
    if (!editor?.todo) showNewTask(todo);
  }
  function deleteOne(todo: Todo) {
    remove([todo.id]);
    setDeleted(todo);
  }
  function clearDone() {
    remove(todos.filter(todo => todo.completedAt !== null).map(todo => todo.id));
    setClearing(false);
  }

  return <div className="page-stack">
    <PageHeader title="To Do List" actions={<Button onClick={() => setEditor({})}><Plus size={17}/>مهمة جديدة</Button>}/>
    <p className={styles.privacy}><Lock size={15} aria-hidden="true"/>قائمتك خاصة بحسابك، ولا يراها أي حساب آخر.</p>
    <Card>
      <form className={styles.quickAdd} onSubmit={quickAdd}>
        <Input value={quick} onChange={event => setQuick(event.target.value)} maxLength={TODO_LIMITS.title} placeholder={filter === 'TODAY' ? 'أضف مهمة لليوم ثم اضغط Enter' : 'أضف مهمة ثم اضغط Enter'} aria-label="إضافة مهمة سريعة"/>
        <Button type="submit" disabled={!quick.trim()}>إضافة</Button>
      </form>
      <Tabs items={(Object.keys(FILTER_LABELS) as TodoFilter[]).map(value => ({ value, label: `${FILTER_LABELS[value]} (${counts[value]})` }))} value={filter} onChange={value => setFilter(value as TodoFilter)}/>
      <div className={styles.toolbar}>
        <SearchInput value={query} onChange={setQuery} placeholder="ابحث في مهامك"/>
        {filter === 'DONE'
          ? <Button variant="secondary" onClick={() => setClearing(true)} disabled={!counts.DONE}><Trash2 size={16}/>مسح المنجزة</Button>
          : <Select value={sort} onChange={event => setSort(event.target.value as TodoSort)} aria-label="ترتيب المهام">
            <option value="SMART">حسب الموعد</option>
            <option value="PRIORITY">حسب الأولوية</option>
            <option value="NEWEST">الأحدث أولاً</option>
          </Select>}
      </div>
      {deleted && <div className={styles.undo} role="status"><span>تم حذف «<bdi>{deleted.title}</bdi>»</span><Button variant="ghost" onClick={() => { save(toTodoInput(deleted)); setDeleted(null); }}>تراجع</Button></div>}
      {status === 'loading' ? <div className={styles.loading}><Skeleton className="skeleton-card"/></div>
        : status === 'error' ? <div className="notice" role="alert"><span>تعذر تحميل مهامك.</span><Button variant="secondary" onClick={retry}>إعادة المحاولة</Button></div>
        : rows.length ? <ul className={styles.list}>{rows.map(todo => <TodoRow key={todo.id} todo={todo} clock={clock} onSave={save} onEdit={value => setEditor({ todo: value })} onDelete={deleteOne}/>)}</ul>
        : <EmptyState title={query.trim() ? 'لا توجد نتائج مطابقة' : EMPTY_TITLES[filter]}/>}
    </Card>
    {editor && <TodoEditor key={editor.todo?.id ?? 'new'} todo={editor.todo} defaultDate={defaultDate} clock={clock} onClose={() => setEditor(null)} onSave={saveFromEditor}/>}
    <ConfirmDialog open={clearing} onClose={() => setClearing(false)} onConfirm={clearDone} danger title="مسح المهام المنجزة" description={`سيتم حذف ${counts.DONE} من المهام المنجزة نهائياً.`} confirmLabel="مسح"/>
  </div>;
}
