'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, Card, Skeleton } from '@/components/ui';
import { toTodoInput, visibleTodos } from '@/lib/todos';
import { TodoMeta } from './todo-meta';
import { useTodos } from './todos-provider';
import styles from './todos.module.css';

/** Private summary on each account's own home page. */
export function TodoHomeCard() {
  const { session } = useDemo();
  const { todos, status, clock, counts, save, retry } = useTodos();
  const href = session?.role === 'EMPLOYEE' ? '/employee/todos' : '/todos';
  const rows = visibleTodos(todos, { filter: 'ALL', sort: 'SMART', query: '', clock }).slice(0, 4);
  return <Card title="مهامي" action={<Link className="button-link" href={href}>كل المهام<ArrowLeft size={15}/></Link>}>
    {status === 'loading' ? <Skeleton className="skeleton-card"/>
      : status === 'error' ? <div className="notice" role="alert"><span>تعذر تحميل مهامك.</span><Button variant="secondary" onClick={retry}>إعادة المحاولة</Button></div>
      : !rows.length ? <p className="muted">لا توجد مهام مفتوحة. <Link className="button-link" href={href}>أضف مهمة</Link></p>
      : <>
        <div className={styles.summary}>
          <span className={counts.OVERDUE ? styles.late : ''}><strong dir="ltr">{counts.OVERDUE}</strong> متأخرة</span>
          <span className={counts.TODAY ? styles.dueToday : ''}><strong dir="ltr">{counts.TODAY}</strong> لليوم</span>
          <span><strong dir="ltr">{counts.UPCOMING}</strong> قادمة</span>
        </div>
        <ul className={styles.homeList}>{rows.map(todo => <li key={todo.id}>
          <input type="checkbox" className={styles.check} checked={false} onChange={() => save({ ...toTodoInput(todo), completed: true })} aria-label={`إنجاز المهمة: ${todo.title}`}/>
          <div className={styles.homeText}><strong>{todo.title}</strong><TodoMeta todo={todo} clock={clock}/></div>
        </li>)}</ul>
      </>}
  </Card>;
}
