import { useState } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Button, Dialog, Field, Textarea } from '@/components/ui';
import { assertCanOpenWorkday, getOpenWorkday } from '@/lib/attendance';
import type { Workday } from '@/lib/types';
import { canEditDay, getDaySummary } from './day-helpers';
import { OpenDayBlock } from './open-day-block';

export function DayStateDialog({ day, onClose, onReview }: { day: Workday; onClose: () => void; onReview: () => void }) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const currentOpen = getOpenWorkday(data.workdays);
  const blockedByOther = day.state === 'CLOSED' && currentOpen && currentOpen.id !== day.id;
  const summary = getDaySummary(data, day);
  async function changeState() {
    if (!canEditDay(data, session, day)) { setError('هذا اليوم محمي ضمن الشهر المؤرشف.'); return; }
    if (day.state === 'OPEN' && summary.unresolved) return;
    if (day.state === 'CLOSED' && !reason.trim()) { setError('اكتب سبب إعادة فتح اليوم.'); return; }
    try {
      if (day.state === 'CLOSED') assertCanOpenWorkday(data.workdays, day.id);
      const state = day.state === 'OPEN' ? 'CLOSED' : 'OPEN';
      if (!await mutate(() => updateData(draft => { if (state === 'OPEN') assertCanOpenWorkday(draft.workdays, day.id); const item = draft.workdays.find(item => item.id === day.id); if (item) item.state = state; }, { action: state === 'CLOSED' ? 'إغلاق يوم حضور' : 'إعادة فتح يوم حضور', entity: 'يوم حضور', entityId: day.id, oldValues: { state: day.state }, newValues: { state, reason } }), setError)) return;
      onClose(); toast(state === 'CLOSED' ? 'تم إغلاق يوم الحضور.' : 'تمت إعادة فتح يوم الحضور.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة اليوم.'); }
  }
  return <Dialog open onClose={() => { if (!pending) onClose(); }} title={day.state === 'OPEN' ? 'إغلاق يوم الحضور' : 'إعادة فتح يوم الحضور'}>
    {blockedByOther && currentOpen ? <OpenDayBlock day={currentOpen} reopening onClose={onClose} /> : day.state === 'OPEN' && summary.unresolved > 0 ? <div className="stack"><div className="notice notice-warning">لا يمكن إغلاق يوم الحضور. يوجد {summary.unresolved} موظفين لم يتم تحديد حالتهم بعد.</div><Button onClick={() => { onClose(); onReview(); }}>مراجعة الحالات غير المحسومة</Button></div> : <div className="stack"><p>{day.state === 'OPEN' ? 'اكتملت مراجعة الحالات. سيغلق استقبال الحضور لهذا اليوم، وتبقى التعديلات الإدارية متاحة مع حفظ أسبابها.' : 'سيعاد فتح هذا اليوم للمراجعة واستقبال الحضور.'}</p>{day.state === 'CLOSED' && <Field label="سبب إعادة الفتح" required><Textarea value={reason} onChange={event => setReason(event.target.value)} /></Field>}{error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button loading={pending} onClick={changeState}>{day.state === 'OPEN' ? 'تأكيد إغلاق اليوم' : 'إعادة فتح اليوم'}</Button><Button disabled={pending} variant="secondary" onClick={onClose}>إلغاء</Button></div></div>}
  </Dialog>;
}
