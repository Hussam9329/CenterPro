import Link from 'next/link';
import { ChevronLeft, QrCode, Save } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import type { useQrAccountSettings } from './use-qr-account-settings';

export function QrAccountCard({ account }: { account: ReturnType<typeof useQrAccountSettings> }) {
  const { qrDisplayConfigured, qrDisplayActive, qrUsername, setQrUsername, qrPassword, setQrPassword, qrActive, setQrActive, qrDirty, qrSaving, qrError, saveQrAccount, discard } = account;
  return <Card title="حساب شاشة الحضور" action={<Badge tone={qrDisplayConfigured && qrDisplayActive ? 'success' : 'neutral'}>{qrDisplayConfigured ? qrDisplayActive ? 'نشط' : 'معطل' : 'غير مُنشأ'}</Badge>}>
      <form className="stack" onSubmit={saveQrAccount} noValidate>
        <div className="notice"><QrCode size={20}/><span>حساب مستقل للـ iPad. بعد تسجيل الدخول يفتح شاشة QR فقط ولا يملك صلاحية الموظفين أو الرواتب أو الإعدادات.</span></div>
        <div className="grid-2">
          <Field label="اسم المستخدم" required><Input dir="ltr" value={qrUsername} onChange={event => setQrUsername(event.target.value)} autoComplete="username" placeholder="CENTER_QR" /></Field>
          <Field label={qrDisplayConfigured ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'} required={!qrDisplayConfigured}><Input type="password" dir="ltr" value={qrPassword} onChange={event => setQrPassword(event.target.value)} autoComplete="new-password" placeholder={qrDisplayConfigured ? 'اتركها فارغة للإبقاء على الحالية' : ''} /></Field>
        </div>
        <label className="remember-login"><input type="checkbox" checked={qrActive} onChange={event => setQrActive(event.target.checked)} /><span>الحساب نشط</span></label>
        {qrError && <p className="text-danger" role="alert">{qrError}</p>}
        <div className="form-actions"><Button type="submit" loading={qrSaving}><Save size={17}/>{qrDisplayConfigured ? 'حفظ حساب شاشة الحضور' : 'إنشاء حساب شاشة الحضور'}</Button>{(qrDirty || qrError) && <Button variant="secondary" disabled={qrSaving} onClick={event => { discard(event.currentTarget.closest('form')); }}>إلغاء تعديلات حساب الشاشة</Button>}<Link className="button-link" href="/attendance-display"><QrCode size={16}/>فتح شاشة الحضور<ChevronLeft size={14}/></Link></div>
      </form>
    </Card>;
}
