'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Button, Dialog, Field, Input } from '@/components/ui';
import type { Employee } from '@/lib/types';
import styles from './people.module.css';

export function ResetPasswordDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { session, updateData, backend } = useDemo();
  const toast = useToast();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const close = () => {
    if (savingRef.current) return;
    if (passwordRef.current) passwordRef.current.value = '';
    setError('');
    onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!employee || (session?.role !== 'SUPER_ADMIN' && (session?.role !== 'ADMIN' || employee.role !== 'EMPLOYEE'))) { setError('لا تمتلك صلاحية إدارة هذا الحساب.'); return; }
    const password = passwordRef.current?.value ?? '';
    if (!password.trim()) { setError('أدخل كلمة المرور الجديدة.'); return; }
    if (password.length < 6) { setError('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await updateData(() => {}, { action: 'تغيير كلمة مرور الموظف', entity: 'employee', entityId: employee.id, employeeId: employee.id, oldValues: {}, newValues: { sessionsInvalidated: true } }, { password: { employeeId: employee.id, value: password } });
      if (passwordRef.current) passwordRef.current.value = '';
      setError('');
      toast('تم تغيير كلمة المرور وإنهاء الجلسات السابقة للحساب.');
      onClose();
    } catch (failure) {
      setError(backend === 'neon' && failure instanceof Error ? failure.message : 'تعذر تغيير كلمة المرور. حاول مرة أخرى.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return <Dialog open={Boolean(employee)} onClose={close} title="تغيير كلمة المرور" description={employee ? `حساب ${employee.name} · ${employee.username}` : ''}><form onSubmit={submit}><Field label="كلمة المرور الجديدة" required hint="6 أحرف أو أرقام على الأقل."><Input ref={passwordRef} disabled={saving} type="password" autoComplete="new-password" autoFocus /></Field>{error && <p role="alert" className={styles.error}>{error}</p>}<div className="form-actions"><Button type="submit" loading={saving}>حفظ</Button><Button type="button" variant="secondary" disabled={saving} onClick={close}>إلغاء</Button></div></form></Dialog>;
}
