'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Button, Dialog, Field, Input, Textarea } from '@/components/ui';
import { applyDeletionPlan, authorizeDeletion, deletionLabels, getDeletionPlan, type DeletionCollection } from '@/lib/safe-deletion';

/** A single consistent, reasoned deletion confirmation for desktop and mobile. */
export function SafeDeleteButton({ collection, id, label, compact = false, disabled = false, disabledReason, onDeleted }: {
  collection: DeletionCollection; id: string; label: string; compact?: boolean; disabled?: boolean; disabledReason?: string; onDeleted?: () => void;
}) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const plan = getDeletionPlan(data, collection, id);
  let permitted = true;
  try { authorizeDeletion(data, session, collection, id); }
  catch { permitted = false; }
  if (!permitted) return null;
  const clear = (force = false) => { if (!pending || force) { setOpen(false); setConfirmation(''); setReason(''); setError(''); } };
  async function confirm() {
    setError('');
    if (disabled) return;
    if (plan.blockers.length) { setError(plan.blockers[0]); return; }
    if (reason.trim().length < 3) { setError('اكتب سبب الحذف، 3 أحرف على الأقل.'); return; }
    if (plan.requiresTyping && confirmation.trim() !== 'حذف') { setError('اكتب كلمة «حذف» للتأكيد.'); return; }
    const intent = { collection, id, reason: reason.trim(), confirmation: 'حذف' as const };
    if (!await mutate(() => updateData(draft => {
      const latest = getDeletionPlan(draft, collection, id);
      applyDeletionPlan(draft, latest);
    }, { action: 'حذف آمن مؤكد', entity: collection, entityId: id, newValues: { reason: intent.reason } }, { deletion: intent }), setError)) return;
    toast(`تم حذف ${deletionLabels[collection]} وتوثيق العملية.`);
    clear(true);
    onDeleted?.();
  }
  return <>
    <Button variant="ghost" className="delete-action" disabled={disabled || pending} title={disabled && disabledReason ? disabledReason : `حذف ${label}`} aria-label={`حذف ${label}`} onClick={() => { setError(''); setOpen(true); }}>
      <Trash2 size={16} />{!compact && `حذف ${deletionLabels[collection]}`}
    </Button>
    <Dialog open={open} onClose={() => clear()} title={`حذف ${label}؟`}>
      <div className="stack">
        <p>راجع تأثير الحذف قبل التأكيد. السجل لا يعود للقوائم بعد الحذف، لكن تبقى تفاصيل العملية محفوظة في سجل العمليات.</p>
        <div className="notice notice-warning">
          <span>السجلات التي ستُحذف: <strong>{plan.total}</strong>
            {Object.entries(plan.removals).map(([key, ids]) => <span key={key} style={{ display: 'block' }}>{deletionLabels[key as DeletionCollection]}: {ids.length}</span>)}
            {plan.affectedOverrides > 0 && <span style={{ display: 'block' }}>أيام ستُزال منها استثناءات الموظف: {plan.affectedOverrides}</span>}
          </span>
        </div>
        {plan.warnings.map(message => <p key={message} className="muted">{message}</p>)}
        {plan.blockers.map(message => <p role="alert" className="text-danger" key={message}>{message}</p>)}
        {!plan.blockers.length && <>
          <Field label="سبب الحذف" required hint="3 أحرف على الأقل، ويُحفظ السبب في سجل العمليات."><Textarea disabled={pending} value={reason} onChange={event => setReason(event.target.value)} rows={2} maxLength={1000} placeholder="مثال: أُضيف بالخطأ" /></Field>
          {plan.requiresTyping && <Field label="اكتب كلمة حذف للتأكيد" required><Input disabled={pending} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" placeholder="حذف" /></Field>}
        </>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="form-actions">
          <Button variant="secondary" disabled={pending} onClick={() => clear()}>إلغاء</Button>
          <Button variant="danger" loading={pending} disabled={disabled || Boolean(plan.blockers.length) || reason.trim().length < 3 || (plan.requiresTyping && confirmation.trim() !== 'حذف')} onClick={confirm}>تأكيد الحذف</Button>
        </div>
      </div>
    </Dialog>
  </>;
}
