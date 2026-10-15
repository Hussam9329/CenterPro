import {
  LayoutDashboard, UsersRound, CalendarCheck2, Wallet, Receipt, Gift, Building2,
  ChartNoAxesCombined, History, Settings2, UserRound, ScanLine, ClipboardCheck,
  Trophy, Calculator, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { hasEmployeePermission } from '@/lib/permissions';
import type { DemoData, DemoSession } from '@/lib/types';

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superOnly?: boolean;
}

const adminNav: readonly NavigationItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard }, { href: '/employees', label: 'الموظفون', icon: UsersRound },
  { href: '/attendance', label: 'الحضور', icon: CalendarCheck2 },
  { href: '/evaluations', label: 'التدقيق', icon: ClipboardCheck },
  { href: '/payroll', label: 'الرواتب', icon: Wallet }, { href: '/deductions', label: 'الخصومات', icon: Receipt },
  { href: '/bonuses', label: 'المكافآت', icon: Gift }, { href: '/permissions', label: 'الصلاحيات', icon: ShieldCheck, superOnly: true }, { href: '/departments', label: 'الأقسام', icon: Building2, superOnly: true },
  { href: '/reports', label: 'التقارير', icon: ChartNoAxesCombined }, { href: '/calculator', label: 'الحاسبة', icon: Calculator }, { href: '/audit', label: 'سجل العمليات', icon: History, superOnly: true },
  { href: '/settings', label: 'الإعدادات', icon: Settings2, superOnly: true },
];
const baseEmployeeNav: readonly NavigationItem[] = [
  { href: '/employee', label: 'الرئيسية', icon: LayoutDashboard }, { href: '/employee/scan', label: 'تسجيل الحضور', icon: ScanLine },
  { href: '/employee/attendance', label: 'سجل الحضور', icon: CalendarCheck2 }, { href: '/employee/salary', label: 'راتبي', icon: Wallet },
  { href: '/calculator', label: 'الحاسبة', icon: Calculator }, { href: '/employee/profile', label: 'حسابي', icon: UserRound },
];

/** UI routing only; server authorization remains the data access boundary.
 * Redirect and loading decisions share this rule so protected content cannot
 * render for a frame while its redirect effect is waiting to run. */
export function getShellRedirect(session: DemoSession | null, employee: boolean, pathname: string): string | null {
  if (!session) return '/login';
  if (session.role === 'QR_DISPLAY') return '/attendance-display';
  if (employee !== (session.role === 'EMPLOYEE')) return session.role === 'EMPLOYEE' ? '/employee' : '/dashboard';
  if (session.role === 'ADMIN' && ['/permissions', '/departments', '/audit', '/settings'].some(path => pathname.startsWith(path))) return '/dashboard';
  return null;
}

export function getShellNavigation(data: DemoData, session: DemoSession, employee: boolean): readonly NavigationItem[] {
  if (!employee) return adminNav.filter(item => !item.superOnly || session.role === 'SUPER_ADMIN');
  const employeeRecord = session.employeeId ? data.employees.find(item => item.id === session.employeeId) : undefined;
  return [
    ...baseEmployeeNav.slice(0, 2),
    ...(employeeRecord && isAuditEmployee(data, employeeRecord) ? [{ href: '/employee/audit', label: 'التدقيق', icon: ClipboardCheck }] : []),
    ...(employeeRecord && hasEmployeePermission(employeeRecord, 'DEDUCTIONS', 'view') ? [{ href: '/employee/deductions', label: 'الخصومات', icon: Receipt }] : []),
    ...(employeeRecord && hasEmployeePermission(employeeRecord, 'BONUSES', 'view') ? [{ href: '/employee/bonuses', label: 'المكافآت', icon: Gift }] : []),
    ...(employeeRecord && isCorrectionEmployee(data, employeeRecord) ? [{ href: '/employee/evaluation', label: 'التقييمات', icon: Trophy }] : []),
    ...baseEmployeeNav.slice(2),
  ];
}

export function getActiveNavigation(nav: readonly NavigationItem[], pathname: string): NavigationItem | undefined {
  return nav.find(item => item.href === pathname || (item.href !== '/employee' && pathname.startsWith(item.href + '/')));
}

export function getMobileNavigation(nav: readonly NavigationItem[], employee: boolean): readonly NavigationItem[] {
  return employee
    ? nav.filter(item => item.href !== '/employee/attendance').slice(0, 4)
    : nav.filter(item => ['/dashboard', '/employees', '/attendance', '/payroll'].includes(item.href));
}
