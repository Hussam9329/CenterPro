import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { useTheme } from '@/components/theme-provider';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { hasSessionAccountPermission } from '@/lib/permissions';
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

function SuperAdminSettingsExtras({ resetCenterDraft }: { resetCenterDraft: () => void }) {
  const { data, backend, resetDemo } = useDemo();
  const qrAccount = useQrAccountSettings();
  const backup = useSystemBackup();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState('');
  const adminAccounts = data.employees.filter(employee => employee.role !== 'EMPLOYEE');

  function reset() {
    if (backend === 'neon' || resetWord.trim() !== 'إعادة ضبط') return;
    resetDemo();
    resetCenterDraft();
    setResetOpen(false);
    setResetWord('');
  }

  return <>
    <BackupCard backend={backend} backup={backup}/>
    <PermissionsCard/>
    <QrAccountCard account={qrAccount}/>
    <AdminAccountsCard adminAccounts={adminAccounts}/>
    {backend === 'local' && <ResetSettingsSection resetOpen={resetOpen} setResetOpen={setResetOpen} resetWord={resetWord} setResetWord={setResetWord} reset={reset}/>}
  </>;
}

export function SettingsPage() {
  const { data, session, backend, connectionError } = useDemo();
  const { theme } = useTheme();
  const centerSettings = useCenterSettings();
  const isSuper = session?.role === 'SUPER_ADMIN';
  const delegatedView = session?.role === 'EMPLOYEE' && hasSessionAccountPermission(data, session, 'SETTINGS', 'view');

  if (!isSuper && !delegatedView) return <EmptyState title="لا تملك صلاحية عرض الإعدادات" description="يجب أن يمنحك المشرف العام صلاحية الإعدادات أولاً." />;

  return <div className="page-stack">
    <PageHeader title="الإعدادات" actions={<Badge tone="brand"><ShieldCheck size={14} />{isSuper ? 'المدير العام' : 'صلاحية مفوضة'}</Badge>} />
    {isSuper && <SuperAdminSettingsExtras resetCenterDraft={centerSettings.resetDraft}/>}
    <div className="grid-2">
      <CenterSettingsCard settings={centerSettings}/>
      <SystemBasicsCard backend={backend} connectionError={connectionError} theme={theme}/>
    </div>
  </div>;
}
