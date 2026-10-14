import { Clock3, Save } from 'lucide-react';
import { Button, Card, Field, Input } from '@/components/ui';
import type { useCenterSettings } from './use-center-settings';

export function CenterSettingsCard({ settings }: { settings: ReturnType<typeof useCenterSettings> }) {
  const { centerName, setCenterName, qrInterval, setQrInterval, errors, saving, saveError, dirty, save, discard } = settings;
  return <Card title="إعدادات المركز">
        <form onSubmit={save} className="stack">{saveError && <p className="text-danger" role="alert">{saveError}</p>}
          <Field label="اسم المركز" required error={errors.name}><Input value={centerName} onChange={event => setCenterName(event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.name)} /></Field>
          <Field label="تجديد رمز الحضور" required hint="من 30 إلى 60 ثانية. القيمة الافتراضية 45 ثانية." error={errors.interval}><div className="inline"><Input type="number" min={30} max={60} step={1} value={qrInterval} onChange={event => setQrInterval(event.target.value)} dir="ltr" aria-invalid={Boolean(errors.interval)} /><span className="muted">ثانية</span></div></Field>
          <div className="notice"><Clock3 size={18} /><span>يُستخدم هذا الفاصل الزمني لتجديد رمز الحضور.</span></div>
          <div className="form-actions"><Button type="submit" loading={saving} disabled={!dirty}><Save size={17} />حفظ الإعدادات</Button>{(dirty || saveError) && <Button variant="secondary" onClick={event => { discard(event.currentTarget.closest('form')); }}>إلغاء التغييرات</Button>}</div>
        </form>
      </Card>;
}
