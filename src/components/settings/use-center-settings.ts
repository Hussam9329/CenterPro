import { useRef, useState, type FormEvent } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { hasSessionAccountPermission } from '@/lib/permissions';

export function useCenterSettings() {
  const { data, session, updateData, discardDraft } = useDemo();
  const toast = useToast();
  const [centerName, setCenterName] = useState(data.settings.centerName);
  const [qrInterval, setQrInterval] = useState(String(data.settings.qrInterval));
  const [errors, setErrors] = useState<{ name?: string; interval?: string }>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const canEdit = session?.role === 'SUPER_ADMIN' || (session?.role === 'EMPLOYEE' && hasSessionAccountPermission(data, session, 'SETTINGS', 'edit'));
  const dirty = centerName.trim() !== data.settings.centerName || Number(qrInterval) !== data.settings.qrInterval;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftForm = event.currentTarget;
    if (savingRef.current || !canEdit) return;
    const nextErrors: typeof errors = {};
    const interval = Number(qrInterval);
    if (!centerName.trim()) nextErrors.name = 'أدخل اسم المركز.';
    if (!qrInterval.trim() || !Number.isInteger(interval) || interval < 30 || interval > 60) nextErrors.interval = 'اختر عدداً صحيحاً من 30 إلى 60 ثانية.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !dirty) return;
    const next = { centerName: centerName.trim(), qrInterval: interval };
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await updateData(draft => { draft.settings = next; }, { action: 'تعديل إعدادات النظام', entity: 'settings', entityId: 'center-settings', oldValues: { ...data.settings }, newValues: next }, undefined, draftForm);
      setCenterName(next.centerName);
      setQrInterval(String(next.qrInterval));
      toast('تم حفظ الإعدادات وتسجيل التغيير في سجل العمليات.');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات. حاول مرة أخرى.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function discard(form: HTMLFormElement | null) {
    setCenterName(data.settings.centerName);
    setQrInterval(String(data.settings.qrInterval));
    setErrors({});
    setSaveError('');
    discardDraft(form);
  }
  function resetDraft() {
    setCenterName('CenterPro');
    setQrInterval('45');
    setErrors({});
  }
  return { centerName, setCenterName, qrInterval, setQrInterval, errors, saving, saveError, dirty, canEdit, save, discard, resetDraft };
}
