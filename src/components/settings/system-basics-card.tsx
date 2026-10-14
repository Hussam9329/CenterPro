import { Clock3, Globe2, LockKeyhole, Moon, Sun } from 'lucide-react';
import { Badge, Card } from '@/components/ui';

export function SystemBasicsCard({ backend, connectionError, theme }: { backend: 'local' | 'neon'; connectionError?: string; theme: 'light' | 'dark' }) {
  return <Card title="أساسيات النظام">
        <div className="stack">
          {backend === 'neon' && <div className="list-row"><strong>قاعدة البيانات</strong><Badge tone={connectionError ? 'warning' : 'success'}>{connectionError ? 'تعذر الاتصال' : 'Neon · متصل'}</Badge></div>}
          <div className="list-row"><div className="inline"><Globe2 size={19} /><div><strong>لغة الواجهة</strong><div className="muted">العربية · من اليمين إلى اليسار</div></div></div><Badge>ثابت</Badge></div>
          <div className="list-row"><div className="inline">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}<div><strong>مظهر الواجهة</strong><div className="muted">{theme === 'dark' ? 'داكن' : 'فاتح'} · هوية CenterPro</div></div></div><Badge>حسب اختيارك</Badge></div>
          <div className="list-row"><div className="inline"><Clock3 size={19} /><div><strong>المنطقة الزمنية</strong><div className="muted">بغداد <span dir="ltr">(Asia/Baghdad)</span></div></div></div><Badge>ثابت</Badge></div>
          <div className="notice"><LockKeyhole size={18} /><span>تسجيل الحضور لا يشترط GPS أو الاتصال بشبكة Wi-Fi محددة.</span></div>
        </div>
      </Card>;
}
