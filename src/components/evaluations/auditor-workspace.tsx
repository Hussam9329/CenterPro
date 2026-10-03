'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Minus, Plus, Search, UsersRound } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Badge, EmptyState, Input } from '@/components/ui';
import { calculateEvaluationScore, getCorrectionEmployees, getExamEvaluation, isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { date, time } from '@/lib/format';
import type { DemoSession } from '@/lib/types';
import styles from './evaluations.module.css';

type NumericField = 'papers' | 'correctionErrors' | 'behaviorErrors';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type PendingValues = Partial<Record<NumericField, string>>;
const numericFields: NumericField[] = ['papers', 'correctionErrors', 'behaviorErrors'];

function safeNumber(value: string): number | null {
  if (value === '') return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function valueText(value: number | null | undefined): string { return value === null || value === undefined ? '' : String(value); }
function actorKey(session: DemoSession | null): string { return session ? `${session.kind}:${session.role}:${session.employeeId ?? 'SYSTEM'}` : ''; }

function Stepper({ label, value, disabled, onImmediate, onType, onBlur }: { label: string; value: string; disabled?: boolean; onImmediate: (value: number) => void; onType: (value: string) => void; onBlur: () => void }) {
  const id = useId();
  const numeric = safeNumber(value);
  return <div className={styles.numericField}><label className={styles.numericLabel} htmlFor={id}>{label}</label><div className={styles.stepper}><button type="button" disabled={disabled || (numeric ?? 0) <= 0} onClick={() => onImmediate(Math.max(0, (numeric ?? 0) - 1))} aria-label={`إنقاص ${label}`}><Minus size={18}/></button><input id={id} inputMode="numeric" pattern="[0-9]*" value={value} placeholder="0" disabled={disabled} onChange={event => onType(event.target.value.replace(/\D/g, ''))} onBlur={onBlur}/><button type="button" disabled={disabled || numeric === Number.MAX_SAFE_INTEGER} onClick={() => onImmediate((numeric ?? 0) + 1)} aria-label={`زيادة ${label}`}><Plus size={18}/></button></div></div>;
}

function EvaluationEditor({ examId, employeeId, disabled }: { examId: string; employeeId: string; disabled: boolean }) {
  const { data, session, updateData, notify } = useDemo();
  const employee = data.employees.find(item => item.id === employeeId)!;
  const current = getExamEvaluation(data, examId, employeeId);
  const inputId = useId();
  // Unsaved fields override the live record independently, so another save
  // cannot reset text in a field the auditor is still editing.
  const [draftValues, setDraftValues] = useState<PendingValues>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const pending = useRef<PendingValues>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<(showStatus?: boolean) => void>(() => {});
  const owner = actorKey(session);

  const persist = useCallback((showStatus = true) => {
    clearTimeout(debounce.current);
    debounce.current = undefined;
    const values = pending.current;
    const fields = numericFields.filter(field => values[field] !== undefined);
    if (!fields.length) return;
    pending.current = {};
    try {
      updateData((draft, currentSession) => {
        // Timers and unmount cleanup check the live store instead of the
        // account or exam state captured when typing began.
        if (!currentSession || actorKey(currentSession) !== owner) throw new Error('لم تُحفظ التغييرات لأن حساب الدخول تغيّر.');
        const auditor = draft.employees.find(item => item.id === currentSession.employeeId);
        if (!auditor || !isAuditEmployee(draft, auditor)) throw new Error('لم تُحفظ التغييرات لأن الحساب لا يملك صلاحية التدقيق.');
        const exam = draft.evaluationExams.find(item => item.id === examId);
        const cycle = draft.evaluationCycles.find(item => item.id === exam?.cycleId);
        if (!exam || exam.state !== 'OPEN' || cycle?.state !== 'OPEN') throw new Error('لم تُحفظ التغييرات لأن الامتحان مغلق أو الدورة مؤرشفة.');
        const targetEmployee = draft.employees.find(item => item.id === employeeId);
        if (!targetEmployee || !isCorrectionEmployee(draft, targetEmployee)) throw new Error('لم تُحفظ التغييرات لأن الموظف لم يعد ضمن المصححين الفعالين.');

        const existing = getExamEvaluation(draft, examId, employeeId);
        const changed = fields.filter(field => (existing?.[field] ?? null) !== safeNumber(values[field]!));
        if (!changed.length) return;
        const now = new Date().toISOString();
        const target = existing ?? { id: crypto.randomUUID(), examId, employeeId, papers: null, correctionErrors: null, behaviorErrors: null, note: '', createdBy: currentSession.name, createdAt: now, updatedBy: currentSession.name, updatedAt: now };
        changed.forEach(field => { target[field] = safeNumber(values[field]!); });
        target.updatedBy = currentSession.name;
        target.updatedAt = now;
        if (numericFields.every(field => target[field] === null) && !target.note.trim()) {
          draft.examEvaluations = draft.examEvaluations.filter(item => item.id !== target.id);
        } else if (!existing) {
          draft.examEvaluations.push(target);
        }
      }, (beforeData, afterData) => {
        const before = getExamEvaluation(beforeData, examId, employeeId);
        const after = getExamEvaluation(afterData, examId, employeeId);
        const changed = fields.filter(field => (before?.[field] ?? null) !== (after?.[field] ?? null));
        if (!changed.length) return undefined;
        return {
          action: before ? 'تعديل بيانات تدقيق مصحح' : 'إضافة بيانات تدقيق مصحح',
          entity: 'exam-evaluation', entityId: after?.id ?? before!.id, employeeId,
          oldValues: Object.fromEntries(changed.map(field => [field, before?.[field] ?? null])),
          newValues: { ...Object.fromEntries(changed.map(field => [field, after?.[field] ?? null])), examId },
        };
      });
      if (showStatus) {
        setDraftValues(previous => Object.fromEntries(Object.entries(previous).filter(([field, value]) => values[field as NumericField] !== value)));
        setError('');
        setSaveState('saved');
        clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setSaveState('idle'), 1200);
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'تعذر حفظ التغييرات. راجع حالة الامتحان ثم حاول مجدداً.';
      if (showStatus) { setDraftValues({}); setError(message); setSaveState('error'); }
      notify(message);
    }
  }, [employeeId, examId, notify, owner, updateData]);

  useEffect(() => { flushRef.current = persist; }, [persist]);
  useEffect(() => {
    const flush = () => flushRef.current(false);
    const flushHidden = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flushHidden);
    return () => {
      // Exam/filter/route changes flush to this editor's immutable identity.
      flush();
      clearTimeout(debounce.current);
      clearTimeout(statusTimer.current);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flushHidden);
    };
  }, []);

  function schedule(field: NumericField, raw: string, immediately = false) {
    if (disabled) return;
    setDraftValues(previous => ({ ...previous, [field]: raw }));
    clearTimeout(statusTimer.current);
    if (raw !== '' && safeNumber(raw) === null) {
      delete pending.current[field];
      setError('أدخل عدداً صحيحاً موجباً أو صفراً ضمن الحد المسموح.');
      setSaveState('error');
      return;
    }
    setError('');
    pending.current[field] = raw;
    clearTimeout(debounce.current);
    setSaveState('saving');
    if (immediately) persist();
    else debounce.current = setTimeout(() => flushRef.current(), 450);
  }

  const papers = draftValues.papers ?? valueText(current?.papers);
  const correctionErrors = draftValues.correctionErrors ?? valueText(current?.correctionErrors);
  const behaviorErrors = draftValues.behaviorErrors ?? valueText(current?.behaviorErrors);
  const score = calculateEvaluationScore(safeNumber(papers), safeNumber(correctionErrors), safeNumber(behaviorErrors));
  return <article className={styles.auditCard} aria-label={`تدقيق ${employee.name}`}>
    <div className={styles.auditCardHeader}><div className={styles.employeeIdentity}><Avatar name={employee.name}/><div><strong>{employee.name}</strong><small dir="ltr">{employee.code}</small></div></div>{current ? <Badge tone="brand">لديه تقييم</Badge> : <Badge>لم يُدخل بعد</Badge>}</div>
    <div className={styles.editorFields}>
      <div className={styles.numericField}><label className={styles.numericLabel} htmlFor={inputId}>عدد الأوراق المصححة</label><Input id={inputId} type="text" inputMode="numeric" pattern="[0-9]*" value={papers} placeholder="0" disabled={disabled} onChange={event => schedule('papers', event.target.value.replace(/\D/g, ''))} onBlur={() => persist()}/></div>
      <Stepper label="أخطاء التصحيح" value={correctionErrors} disabled={disabled} onImmediate={value => schedule('correctionErrors', String(value), true)} onType={value => schedule('correctionErrors', value)} onBlur={() => persist()}/>
      <Stepper label="أخطاء السلوك" value={behaviorErrors} disabled={disabled} onImmediate={value => schedule('behaviorErrors', String(value), true)} onType={value => schedule('behaviorErrors', value)} onBlur={() => persist()}/>
    </div>
    <div className={styles.scoreStrip}><div><span className="muted">التقييم الحالي</span><strong dir="ltr">{score} نقطة</strong></div><span className={styles.saveState} data-state={saveState} role="status" aria-live="polite">{saveState === 'saving' ? 'جارٍ الحفظ…' : saveState === 'saved' ? <><Check size={13}/>تم الحفظ</> : saveState === 'error' ? 'لم يُحفظ التعديل' : current ? 'حفظ تلقائي' : 'أدخل القيم للبدء'}</span></div>
    {error && <p className="text-danger" role="alert">{error}</p>}
    {current && <div className={styles.metaLine}>آخر تحديث بواسطة {current.updatedBy} · <span dir="ltr">{date(current.updatedAt)} — {time(current.updatedAt)}</span></div>}
  </article>;
}

function MultiEmployeeFilter({ selected, onChange, employeeIds }: { selected: string[]; onChange: (ids: string[]) => void; employeeIds: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const selectedSet = new Set(selected);
  return <div className={styles.multiSelect} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); } }}><button className={styles.multiButton} type="button" onClick={() => setOpen(value => !value)} aria-label="اختيار المصححين" aria-expanded={open} aria-controls={panelId}><span className="inline"><UsersRound size={17}/>{selected.length === employeeIds.length ? 'كل المصححين' : `${selected.length} مصححين محددين`}</span><ChevronDown size={16}/></button>{open && <div id={panelId} role="group" aria-label="المصححون المختارون" className={styles.multiPanel}><div className={styles.multiActions}><button className="button-link" type="button" onClick={() => onChange(employeeIds.map(item => item.id))}>تحديد الكل</button><button className="button-link" type="button" onClick={() => onChange([])}>إلغاء التحديد</button></div>{employeeIds.map(item => <label className={styles.multiOption} key={item.id}><input type="checkbox" checked={selectedSet.has(item.id)} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/><span>{item.name}</span></label>)}</div>}</div>;
}

export function AuditorWorkspace({ examId, examControl }: { examId: string; examControl?: ReactNode }) {
  const { data, session } = useDemo();
  const exam = data.evaluationExams.find(item => item.id === examId);
  const cycle = data.evaluationCycles.find(item => item.id === exam?.cycleId);
  const employees = useMemo(() => getCorrectionEmployees(data), [data]);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const selected = selection === null ? employees.map(employee => employee.id) : selection.filter(id => employees.some(employee => employee.id === id));
  const filtered = employees.filter(employee => selected.includes(employee.id) && employee.name.includes(query.trim()));
  if (!exam) return <EmptyState title="الامتحان غير موجود" />;
  if (!employees.length) return <EmptyState title="لا يوجد مصححون فعالون" description="أضف موظفين فعالين إلى قسم التصحيح أولاً." />;

  const disabled = exam.state !== 'OPEN' || cycle?.state !== 'OPEN';
  return <div className="stack">
    <div className={styles.toolbarGrid}>
      {examControl ?? <div />}
      <div className="field"><span className="field-label">اختيار المصححين</span><MultiEmployeeFilter selected={selected} onChange={setSelection} employeeIds={employees.map(item => ({ id:item.id, name:item.name }))}/></div>
    </div>
    <div className="filter-row" style={{ marginBottom: 0 }}><div className="search-input" style={{ maxWidth: 420 }}><Search size={18}/><Input value={query} onChange={event => setQuery(event.target.value)} aria-label="البحث في المصححين المختارين" placeholder="ابحث داخل المصححين المختارين"/></div></div>
    {disabled && <div className="notice notice-warning">{cycle?.state === 'ARCHIVED' ? 'دورة التقييم مؤرشفة. يمكنك مشاهدة البيانات المحفوظة فقط.' : 'هذا الامتحان مغلق للتدقيق. يمكنك مشاهدة البيانات فقط حتى يعيد الأدمن فتحه.'}</div>}
    {!selected.length ? <EmptyState title="لم تختر أي مصحح" description="اختر مصححاً واحداً أو أكثر لعرض حقول الإدخال." /> : !filtered.length ? <EmptyState title="لا توجد نتائج مطابقة" description="غيّر البحث أو اختيار المصححين." /> : <div className={styles.auditGrid}>{filtered.map(employee => <EvaluationEditor key={`${exam.id}:${employee.id}:${actorKey(session)}`} examId={exam.id} employeeId={employee.id} disabled={disabled}/>)}</div>}
  </div>;
}
