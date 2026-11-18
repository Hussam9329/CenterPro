'use client';

import { useTodos } from './todos-provider';
import styles from './todos.module.css';

export function TodoNavCount() {
  const { attention } = useTodos();
  if (!attention) return null;
  return <span className={styles.navCount} aria-label={`${attention} مهام لليوم أو متأخرة`} dir="ltr">{attention > 99 ? '99+' : attention}</span>;
}
