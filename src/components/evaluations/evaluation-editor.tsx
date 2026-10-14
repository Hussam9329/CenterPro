'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { Avatar, Badge, Button, Input } from '@/components/ui';
import { date, time } from '@/lib/format';
import { EvaluationStepper } from './evaluation-stepper';
import { useEvaluationAutosave } from './use-evaluation-autosave';
import styles from './evaluations.module.css';

export function EvaluationEditor({ examId, employeeId, disabled }: { examId: string; employeeId: string; disabled: boolean }) {
  const { data } = useDemo();
  const employee = data.employees.find(item => item.id === employeeId)!;
  const inputId = useId();
  const { current, papers, correctionErrors, behaviorErrors, score, saveState, error, schedule, persist, retry, resetAfterDeletion, hasPendingChanges } = useEvaluationAutosave({ examId, employeeId, disabled });
  return <article className={styles.auditCard} aria-label={`تدقيق ${employee.name}`}>
    <div className={styles.auditCardHeader}><div className={styles.employeeIdentity}><Avatar name={employee.name}/><div><strong>{employee.name}</strong><small dir="ltr">{employee.code}</small></div></div>{current ? <Badge tone="brand">لديه تقييم</Badge> : <Badge>لم يُدخل بعد</Badge>}</div>
    <div className={styles.editorFields}>
      <div className={styles.numericField}><label className={styles.numericLabel} htmlFor={inputId}>عدد الأوراق المصححة</label><Input id={inputId} type="text" inputMode="numeric" pattern="[0-9]*" value={papers} placeholder="0" disabled={disabled} onChange={event => schedule('papers', event.target.value.replace(/\D/g, ''))} onBlur={() => persist()}/></div>
      <EvaluationStepper label="أخطاء التصحيح" value={correctionErrors} disabled={disabled} onImmediate={value => schedule('correctionErrors', String(value), true)} onType={value => schedule('correctionErrors', value)} onBlur={() => persist()}/>
      <EvaluationStepper label="أخطاء السلوك" value={behaviorErrors} disabled={disabled} onImmediate={value => schedule('behaviorErrors', String(value), true)} onType={value => schedule('behaviorErrors', value)} onBlur={() => persist()}/>
    </div>
    <div className={styles.scoreStrip}><div><span className="muted">التقييم الحالي</span><strong dir="ltr">{score} نقطة</strong></div><span className={styles.saveState} data-state={saveState} role="status" aria-live="polite">{saveState === 'saving' ? 'جارٍ الحفظ…' : saveState === 'saved' ? <><Check size={13}/>تم الحفظ</> : saveState === 'error' ? 'لم يُحفظ التعديل' : current ? 'حفظ تلقائي' : 'أدخل القيم للبدء'}</span></div>
    {error && <div className="stack"><p className="text-danger" role="alert">{error}</p><Button variant="secondary" disabled={disabled} onClick={retry}>إعادة محاولة الحفظ</Button></div>}
    {current && <div className={styles.metaLine}>آخر تحديث بواسطة {current.updatedBy} · <span dir="ltr">{date(current.updatedAt)} — {time(current.updatedAt)}</span></div>}
    {current && !disabled && <SafeDeleteButton collection="examEvaluations" id={current.id} label={`تقييم ${employee.name}`} compact disabled={hasPendingChanges} disabledReason="أكمل حفظ التعديلات المعلقة قبل حذف التقييم." onDeleted={resetAfterDeletion} />}
  </article>;
}
