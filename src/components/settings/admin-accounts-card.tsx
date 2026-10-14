import Link from 'next/link';
import { ChevronLeft, ShieldCheck, UsersRound } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState } from '@/components/ui';
import type { Employee, Role } from '@/lib/types';
import styles from '@/app/(admin)/settings/settings.module.css';

const roleLabels: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف', QR_DISPLAY: 'QR Display' };

export function AdminAccountsCard({ adminAccounts }: { adminAccounts: Employee[] }) {
  return <Card title="حسابات الإدارة" action={<Link href="/employees" className="button-link"><UsersRound size={17} />إدارة الموظفين<ChevronLeft size={15} /></Link>}>
      <div className="stack">
        <div className="notice"><ShieldCheck size={20}/><div><strong>مدير النظام</strong><p>حساب الإدارة الرئيسي خارج قائمة الموظفين والحضور والرواتب.</p></div></div>
        {!adminAccounts.length && <EmptyState title="لم تُضف حسابات إدارة بعد" description="يمكنك تعيين دور إداري لحساب موظف تضيفه بنفسك."/>}
        {adminAccounts.map(account => <div className={`list-row ${styles.accountRow}`} key={account.id}>
          <div className={`inline ${styles.accountIdentity}`}><Avatar name={account.name} src={account.photo}/><div>
            <Link href={`/employees/${account.id}`} className="button-link">{account.name}</Link>
            <div className="muted" dir="ltr">{account.code} · {account.username}</div>
          </div></div>
          <div className={`inline ${styles.accountActions}`}><Badge tone={account.active ? 'brand' : 'neutral'}>{account.active ? roleLabels[account.role] : 'غير نشط'}</Badge><Link href={`/employees/${account.id}`} className="button-link" aria-label={`إدارة حساب ${account.name}`}><ChevronLeft size={18}/></Link></div>
        </div>)}
      </div>
    </Card>;
}
