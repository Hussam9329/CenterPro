'use client';

import { useState } from 'react';
import { UsersRound } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Dialog } from '@/components/ui';
import { errorBreakdown } from '@/lib/evaluations/error-attribution';
import type { ExamEvaluation } from '@/lib/types';
import styles from './evaluations.module.css';

/** Shows how many errors each auditor added to one corrector in this exam. */
export function ErrorsByAuditor({ evaluation, correctorName }: { evaluation: ExamEvaluation | undefined; correctorName: string }) {
  const { data } = useDemo();
  const [open, setOpen] = useState(false);
  const { rows, unattributed } = errorBreakdown(evaluation, key => data.employees.find(employee => employee.id === key)?.name);
  const total = { correctionErrors: evaluation?.correctionErrors ?? 0, behaviorErrors: evaluation?.behaviorErrors ?? 0 };
  const hasUnattributed = unattributed.correctionErrors + unattributed.behaviorErrors > 0;
  const empty = !rows.length && !hasUnattributed;
  return <>
    <button type="button" className={styles.errorsByButton} onClick={() => setOpen(true)} aria-label={`الأخطاء حسب المدقق لـ ${correctorName}`}>
      <UsersRound size={15}/><span>الأخطاء حسب المدقق</span>{rows.length > 0 && <span className={styles.errorsByCount}>{rows.length}</span>}
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`أخطاء ${correctorName}`} description="عدد الأخطاء التي أضافها كل مدقق في هذا الامتحان.">
      {empty ? <p className="muted">لم تُسجّل أخطاء لهذا المصحح في هذا الامتحان.</p> : <div className={styles.errorsByWrap}><table className={styles.errorsByTable}>
        <thead><tr><th scope="col">المدقق</th><th scope="col">أخطاء التصحيح</th><th scope="col">أخطاء السلوك</th></tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.key}><th scope="row">{row.name}</th><td>{row.correctionErrors}</td><td>{row.behaviorErrors}</td></tr>)}
          {hasUnattributed && <tr className={styles.errorsByMuted}><th scope="row">غير محدد (قبل تفعيل التتبع)</th><td>{unattributed.correctionErrors}</td><td>{unattributed.behaviorErrors}</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row">المجموع</th><td>{total.correctionErrors}</td><td>{total.behaviorErrors}</td></tr></tfoot>
      </table></div>}
    </Dialog>
  </>;
}
