import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { useTheme } from '@/components/theme-provider';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { AdminAccountsCard } from './admin-accounts-card';
import { BackupCard } from './backup-card';
import { CenterSettingsCard } from './center-settings-card';
import { PermissionsCard } from './permissions-card';
import { QrAccountCard } from './qr-account-card';
import { ResetSettingsSection } from './reset-settings-section';
import { SystemBasicsCard } from './system-basics-card';
import { useCenterSettings } from './use-center-settings';
import { useQrAccountSettings } from './use-qr-account-settings';
import { useSystemBackup } from './use-system-backup';

export function SettingsPage() {
  const { data, session, backend, connectionError, resetDemo } = useDemo();
  const { theme } = useTheme();
  const centerSettings = useCenterSettings();
  const qrAccount = useQrAccountSettings();
  const backup = useSystemBackup();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState('');
  const adminAccounts = data.employees.filter(employee => employee.role !== 'EMPLOYEE');

  function reset() {
    if (backend === 'neon' || resetWord.trim() !== 'إعادة ضبط' || session?.role !== 'SUPER_ADMIN') return;
    resetDemo();
    centerSettings.resetDraft();
    setResetOpen(false);
    setResetWord('');
  }

  if (session?.role !== 'SUPER_ADMIN') return <EmptyState title="هذه الصفحة متاحة لـ Super Admin فقط" description="يمكن للإدارة العليا تعديل إعدادات المركز والاطلاع على صلاحيات الأدوار." />;

  return <div className="page-stack">
    <PageHeader title="الإعدادات" actions={<Badge tone="brand"><ShieldCheck size={14} />Super Admin</Badge>} />
    <BackupCard backend={backend} backup={backup}/>
    <div className="grid-2">
      <CenterSettingsCard settings={centerSettings}/>
      <SystemBasicsCard backend={backend} connectionError={connectionError} theme={theme}/>
    </div>
    <PermissionsCard/>
    <QrAccountCard account={qrAccount}/>
    <AdminAccountsCard adminAccounts={adminAccounts}/>
    {backend === 'local' && <ResetSettingsSection resetOpen={resetOpen} setResetOpen={setResetOpen} resetWord={resetWord} setResetWord={setResetWord} reset={reset}/>}
  </div>;
}
