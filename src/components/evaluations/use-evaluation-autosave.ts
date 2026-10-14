'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDemo } from '@/components/demo-provider';
import { calculateEvaluationScore, getExamEvaluation, isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { actorKey, numericFields, safeNumber, valueText, type NumericField, type PendingValues, type SaveState } from './editor-values';

/** Owns the identity-bound queue; rendering never handles timers or retries. */
export function useEvaluationAutosave({ examId, employeeId, disabled }: { examId: string; employeeId: string; disabled: boolean }) {
  const { data, session, updateData, notify, backend } = useDemo();
  const current = getExamEvaluation(data, examId, employeeId);
  // Unsaved fields override the live record independently, so another save
  // cannot reset text in a field the auditor is still editing.
  const [draftValues, setDraftValues] = useState<PendingValues>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const pending = useRef<PendingValues>({});
  const saving = useRef(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<(showStatus?: boolean) => void>(() => {});
  const owner = actorKey(session);

  const persist = useCallback(async (showStatus = true) => {
    clearTimeout(debounce.current);
    debounce.current = undefined;
    if (saving.current) return;
    saving.current = true;
    try {
      // A second keystroke may arrive while the first request is in flight.
      // Drain those fields in order using the confirmed server revision.
      while (Object.keys(pending.current).length) {
        const values = pending.current;
        const fields = numericFields.filter(field => values[field] !== undefined);
        pending.current = {};
        try {
          await updateData((draft, currentSession) => {
            // Timers and unmount cleanup check the live store instead of the
            // account or exam state captured when typing began.
            if (!currentSession || actorKey(currentSession) !== owner) throw new Error('لم تُحفظ التغييرات لأن حساب الدخول تغيّر.');
            const auditor = draft.employees.find(item => item.id === currentSession.employeeId);
            if (!auditor || !isAuditEmployee(draft, auditor)) throw new Error('لم تُحفظ التغييرات لأن الحساب لا يملك صلاحية التدقيق.');
            const exam = draft.evaluationExams.find(item => item.id === examId);
            const cycle = draft.evaluationCycles.find(item => item.id === exam?.cycleId);
            if (!exam || exam.state !== 'OPEN' || cycle?.state !== 'OPEN') throw new Error('لم تُحفظ التغييرات لأن الامتحان مغلق أو الدورة مؤرشفة.');
            if (cycle.seasonId && draft.evaluationSeasons.find(item => item.id === cycle.seasonId)?.state !== 'OPEN') throw new Error('لم تُحفظ التغييرات لأن الموسم مؤرشف.');
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
            // Clearing values edits this row; removing it requires the separate
            // reasoned deletion flow so autosave cannot bypass confirmation.
            if (!existing) {
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
          if (showStatus && mounted.current) {
            setDraftValues(previous => Object.fromEntries(Object.entries(previous).filter(([field, value]) => values[field as NumericField] !== value)));
            setError('');
            if (!Object.keys(pending.current).length) {
              setSaveState('saved');
              clearTimeout(statusTimer.current);
              statusTimer.current = setTimeout(() => setSaveState('idle'), 1200);
            }
          }
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : 'تعذر حفظ التغييرات. راجع حالة الامتحان ثم حاول مجدداً.';
          // Keep the user's text available for retry; newer typed fields win.
          pending.current = { ...values, ...pending.current };
          if (showStatus && mounted.current) { setError(message); setSaveState('error'); }
          notify(message);
          break;
        }
      }
    } finally {
      saving.current = false;
    }
  }, [employeeId, examId, notify, owner, updateData]);

  useEffect(() => { flushRef.current = persist; }, [persist]);
  useEffect(() => {
    mounted.current = true;
    const flush = () => flushRef.current(false);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (backend === 'neon' && (saving.current || Object.keys(pending.current).length)) {
        // A browser cannot guarantee delivery of an async write on shutdown.
        event.preventDefault();
        event.returnValue = '';
      }
      flush();
    };
    const flushHidden = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', flushHidden);
    return () => {
      // Exam/filter/route changes flush to this editor's immutable identity.
      mounted.current = false;
      flush();
      clearTimeout(debounce.current);
      clearTimeout(statusTimer.current);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', flushHidden);
    };
  }, [backend]);

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
  function retry() { setError(''); setSaveState('saving'); void persist(); }
  function resetAfterDeletion() { clearTimeout(debounce.current); clearTimeout(statusTimer.current); pending.current = {}; setDraftValues({}); setSaveState('idle'); setError(''); }

  return {
    current, papers, correctionErrors, behaviorErrors, score, saveState, error,
    schedule, persist, retry, resetAfterDeletion,
    hasPendingChanges: saveState === 'saving' || saveState === 'error' || Object.keys(draftValues).length > 0,
  };
}
