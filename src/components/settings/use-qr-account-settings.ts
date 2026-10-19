import { useState, type FormEvent } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { passwordProblem } from '@/lib/password-policy';

export function useQrAccountSettings() {
  const { session, saveQrDisplayAccount, qrDisplayConfigured, qrDisplayUsername, qrDisplayActive, discardDraft } = useDemo();
  const toast = useToast();
  const [qrUsernameDraft, setQrUsername] = useState<string | null>(null);
  const [qrPassword, setQrPassword] = useState('');
  const [qrActiveDraft, setQrActive] = useState<boolean | null>(null);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrError, setQrError] = useState('');
  const qrUsername = qrUsernameDraft ?? (qrDisplayUsername || 'CENTER_QR');
  const qrActive = qrActiveDraft ?? (qrDisplayConfigured ? qrDisplayActive : true);
  const qrDirty = qrUsernameDraft !== null || qrActiveDraft !== null || qrPassword !== '';

  async function saveQrAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftForm = event.currentTarget;
    if (qrSaving || session?.role !== 'SUPER_ADMIN') return;
    const username = qrUsername.trim();
    if (!username) { setQrError('أدخل اسم مستخدم شاشة الحضور.'); return; }
    if (/\s/.test(username)) { setQrError('اسم المستخدم لا يقبل المسافات.'); return; }
    if (!qrDisplayConfigured && !qrPassword) { setQrError('أدخل كلمة مرور من 8 أحرف على الأقل تجمع بين حروف وأرقام أو رموز.'); return; }
    const passwordIssue = qrPassword ? passwordProblem(qrPassword, username) : null;
    if (passwordIssue) { setQrError(passwordIssue); return; }
    setQrSaving(true); setQrError('');
    try {
      await saveQrDisplayAccount({ username, active: qrActive, ...(qrPassword ? { password: qrPassword } : {}) }, draftForm);
      setQrUsername(null); setQrActive(null);
      setQrPassword('');
      toast(qrDisplayConfigured ? 'تم تحديث حساب شاشة الحضور.' : 'تم إنشاء حساب شاشة الحضور.');
    } catch (error) { setQrError(error instanceof Error ? error.message : 'تعذر حفظ حساب شاشة الحضور.'); }
    finally { setQrSaving(false); }
  }

  function discard(form: HTMLFormElement | null) {
    setQrUsername(null);
    setQrActive(null);
    setQrPassword('');
    setQrError('');
    discardDraft(form);
  }
  return { qrDisplayConfigured, qrDisplayActive, qrUsername, setQrUsername, qrPassword, setQrPassword, qrActive, setQrActive, qrDirty, qrSaving, qrError, saveQrAccount, discard };
}
