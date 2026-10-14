import { Download, LockKeyhole } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { useSystemBackup } from './use-system-backup';

export function BackupCard({ backend, backup }: { backend: 'local' | 'neon'; backup: ReturnType<typeof useSystemBackup> }) {
  const { exporting, backupError, downloadBackup } = backup;
  return <Card title="نسخة احتياطية كاملة">
      <div className="stack">
        <p>{backend === 'neon' ? 'تنزيل نسخة كاملة من البيانات المحفوظة في قاعدة البيانات بملف واحد.' : 'تنزيل كل البيانات المحفوظة في هذا المتصفح بملف واحد، لنقلها لاحقاً إلى قاعدة البيانات.'}</p>
        <p className="muted">يشمل الحسابات وصور الموظفين والأقسام والحضور والرواتب والأرشيف والتقييمات والإعدادات وسجل العمليات.</p>
        <div className="notice"><LockKeyhole size={18} /><span>ملف JSON خاص بالمركز، يتضمن بيانات تحقق الدخول. احتفظ به في مكان آمن.</span></div>
        <div className="form-actions"><Button onClick={downloadBackup} loading={exporting} disabled={exporting}><Download size={17} />تحميل نسخة احتياطية كاملة</Button></div>
        {backupError && <p role="alert" className="text-danger">{backupError}</p>}
      </div>
    </Card>;
}
