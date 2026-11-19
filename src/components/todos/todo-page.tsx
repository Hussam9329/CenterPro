'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Lock, Plus, Trash2 } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Card, ConfirmDialog, PageHeader, SearchInput, Select, Skeleton, Tabs } from '@/components/ui';
import { shiftDate, toTodoInput, visibleTodos, type Todo, type TodoFilter, type TodoInput, type TodoSort } from '@/lib/todos';
import { TodoEditor } from './todo-editor';
import { TodoPrintSheet, buildTodoReport } from './todo-export';
import { TodoTable } from './todo-table';
import { useTodos } from './todos-provider';
import styles from './todos.module.css';

const FILTER_LABELS: Record<TodoFilter, string> = { ALL: 'الكل', TODAY: 'اليوم', UPCOMING: 'القادمة', OVERDUE: 'المتأخرة', DONE: 'المنجزة' };
const EMPTY_TITLES: Record<TodoFilter, string> = { ALL: 'لا توجد مهام مفتوحة', TODAY: 'لا توجد مهام لليوم', UPCOMING: 'لا توجد مهام قادمة', OVERDUE: 'لا توجد مهام متأخرة', DONE: 'لم تُنجز أي مهمة بعد' };

export function TodoPage() {
  const { session, backend, notify } = useDemo();
  const { todos, status, clock, counts, save, remove, retry } = useTodos();
  const [filter, setFilter] = useState<TodoFilter>('ALL');
  const [sort, setSort] = useState<TodoSort>('SMART');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ todo?: Todo } | null>(null);
  const [deleted, setDeleted] = useState<Todo | null>(null);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rows = useMemo(() => visibleTodos(todos, { filter, sort, query, clock }), [todos, filter, sort, query, clock]);
  const report = useMemo(() => buildTodoReport(rows, { owner: session?.name ?? '', view: FILTER_LABELS[filter], clock }), [rows, session?.name, filter, clock]);
  const defaultDate = filter === 'TODAY' ? clock.date : filter === 'UPCOMING' ? shiftDate(clock.date, 1) : null;
  const canAdd = filter === 'ALL' || filter === 'TODAY' || filter === 'UPCOMING';

  useEffect(() => {
    if (!deleted) return;
    const timer = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deleted]);

  function saveFromEditor(todo: TodoInput) {
    save(todo);
    if (editor?.todo) return;
    setQuery('');
    if (filter !== 'ALL' && !(filter === 'TODAY' && todo.dueDate === clock.date)) setFilter('ALL');
  }
  function deleteOne(todo: Todo) {
    remove([todo.id]);
    setDeleted(todo);
  }
  function clearDone() {
    remove(todos.filter(todo => todo.completedAt !== null).map(todo => todo.id));
    setClearing(false);
  }
  async function exportExcel() {
    setExporting(true);
    try {
      const { exportReportExcel } = await import('@/lib/report-export');
      await exportReportExcel(report, { preview: backend !== 'neon' });
    } catch { notify('تعذر إنشاء ملف Excel. حاول مرة أخرى.'); }
    finally { setExporting(false); }
  }
  /** The browser offers the document title as the name of the saved PDF. */
  function exportPdf() {
    const title = document.title;
    const restore = () => { document.title = title; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    document.title = `CenterPro-${clock.date}-To Do List`;
    window.print();
  }

  return <div className={`page-stack ${styles.todoPage}`}>
    <PageHeader title="To Do List" actions={<>
      <Button variant="secondary" onClick={exportExcel} loading={exporting} disabled={!rows.length}><Download size={17}/>تصدير Excel</Button>
      <Button variant="secondary" onClick={exportPdf} disabled={!rows.length}><FileText size={17}/>تصدير PDF</Button>
      <Button variant="secondary" onClick={() => setEditor({})}><Plus size={17}/>مهمة بالتفاصيل</Button>
    </>}/>
    <p className={styles.privacy}><Lock size={15} aria-hidden="true"/>قائمتك خاصة بحسابك، ولا يراها أي حساب آخر.</p>
    <Card>
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
        : status === 'error' ? <div className={`notice ${styles.loading}`} role="alert"><span>تعذر تحميل مهامك.</span><Button variant="secondary" onClick={retry}>إعادة المحاولة</Button></div>
        : <TodoTable key={filter} todos={todos} rows={rows} addDate={canAdd ? { date: defaultDate } : null} emptyTitle={query.trim() ? 'لا توجد نتائج مطابقة' : EMPTY_TITLES[filter]} clock={clock} onSave={save} onEdit={todo => setEditor({ todo })} onDelete={deleteOne}/>}
      <p className={styles.hint}>التعديل يُحفظ تلقائياً. <kbd>Enter</kbd> للسطر التالي، <kbd>Tab</kbd> للخانة التالية، <kbd>Esc</kbd> للتراجع.</p>
    </Card>
    <TodoPrintSheet report={report}/>
    {editor && <TodoEditor key={editor.todo?.id ?? 'new'} todo={editor.todo} defaultDate={defaultDate} clock={clock} onClose={() => setEditor(null)} onSave={saveFromEditor}/>}
    <ConfirmDialog open={clearing} onClose={() => setClearing(false)} onConfirm={clearDone} danger title="مسح المهام المنجزة" description={`سيتم حذف ${counts.DONE} من المهام المنجزة نهائياً.`} confirmLabel="مسح"/>
  </div>;
}
