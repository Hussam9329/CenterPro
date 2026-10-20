import {
  LayoutDashboard, UsersRound, CalendarCheck2, Wallet, Receipt, Gift, Building2,
  ChartNoAxesCombined, History, Settings2, UserRound, ScanLine, ClipboardCheck,
  Trophy, Calculator, ShieldCheck, Gamepad2, type LucideIcon,
} from 'lucide-react';
import { isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { hasEmployeePermission } from '@/lib/permissions';
import type { AccountPermissionFeature, DemoData, DemoSession } from '@/lib/types';

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  superOnly?: boolean;
  feature?: AccountPermissionFeature;
}

const adminNav: readonly NavigationItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard, feature: 'DASHBOARD' },
  { href: '/employees', label: 'الموظفون', icon: UsersRound, feature: 'EMPLOYEES' },
  { href: '/attendance', label: 'الحضور', icon: CalendarCheck2, feature: 'ATTENDANCE' },
  { href: '/evaluations', label: 'التدقيق', icon: ClipboardCheck, feature: 'AUDIT_REVIEW' },
  { href: '/payroll', label: 'الرواتب', icon: Wallet, feature: 'PAYROLL' },
  { href: '/deductions', label: 'الخصومات', icon: Receipt, feature: 'DEDUCTIONS' },
  { href: '/bonuses', label: 'المكافآت', icon: Gift, feature: 'BONUSES' },
  { href: '/permissions', label: 'الصلاحيات', icon: ShieldCheck, superOnly: true },
  { href: '/departments', label: 'الأقسام', icon: Building2, superOnly: true, feature: 'DEPARTMENTS' },
  { href: '/reports', label: 'التقارير', icon: ChartNoAxesCombined, feature: 'REPORTS' },
  { href: '/calculator', label: 'الحاسبة', icon: Calculator },
  { href: '/audit', label: 'سجل العمليات', icon: History, superOnly: true, feature: 'AUDIT_LOG' },
  { href: '/settings', label: 'الإعدادات', icon: Settings2, superOnly: true, feature: 'SETTINGS' },
  { href: '/rest-stats', label: 'إحصائيات الاستراحة', icon: Gamepad2, superOnly: true },
];
const baseEmployeeNav: readonly NavigationItem[] = [
  { href: '/employee', label: 'الرئيسية', icon: LayoutDashboard }, { href: '/employee/scan', label: 'تسجيل الحضور', icon: ScanLine },
  { href: '/employee/attendance', label: 'سجل الحضور', icon: CalendarCheck2 }, { href: '/employee/salary', label: 'راتبي', icon: Wallet },
  { href: '/calculator', label: 'الحاسبة', icon: Calculator }, { href: '/employee/profile', label: 'حسابي', icon: UserRound },
  { href: '/employee/rest', label: 'استراحة', icon: Gamepad2 },
];

function delegatedAdminNav(data: DemoData, session: DemoSession): NavigationItem[] {
  const employee = session.employeeId ? data.employees.find(item => item.id === session.employeeId) : undefined;
  if (!employee?.active || employee.role !== 'EMPLOYEE') return [];
  return adminNav
    .filter(item => item.feature && item.feature !== 'AUDIT_REVIEW' && hasEmployeePermission(employee, item.feature, 'view'))
    .map(item => item.feature === 'DASHBOARD' ? { ...item, label: 'لوحة التحكم' } : item);
}

export function featureForAdminPath(pathname: string): AccountPermissionFeature | null {
  const item = adminNav.find(entry => entry.feature && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)));
  return item?.feature ?? null;
}

/** UI routing only; server projection and mutation authorization remain the data boundary. */
export function getShellRedirect(data: DemoData, session: DemoSession | null, employeeLayout: boolean, pathname: string): string | null {
  if (!session) return '/login';
  if (session.role === 'QR_DISPLAY') return '/attendance-display';
  if (session.role === 'EMPLOYEE') {
    if (employeeLayout) return null;
    if (pathname === '/permissions' || pathname.startsWith('/permissions/')) return '/employee';
    const employee = session.employeeId ? data.employees.find(item => item.id === session.employeeId) : undefined;
    const feature = featureForAdminPath(pathname);
    if (feature === 'AUDIT_REVIEW' && hasEmployeePermission(employee, feature, 'view')) return '/employee/audit';
    return feature && hasEmployeePermission(employee, feature, 'view') ? null : '/employee';
  }
  if (employeeLayout) return '/dashboard';
  if (session.role === 'ADMIN' && ['/permissions', '/departments', '/audit', '/settings', '/rest-stats'].some(path => pathname === path || pathname.startsWith(`${path}/`))) return '/dashboard';
  return null;
}

export function getShellNavigation(data: DemoData, session: DemoSession, employeeLayout: boolean): readonly NavigationItem[] {
  if (session.role !== 'EMPLOYEE') return adminNav.filter(item => !item.superOnly || session.role === 'SUPER_ADMIN');
  const employee = session.employeeId ? data.employees.find(item => item.id === session.employeeId) : undefined;
  const delegated = delegatedAdminNav(data, session);
  return [
    ...baseEmployeeNav.slice(0, 2),
    ...delegated,
    ...(employee && isAuditEmployee(data, employee) ? [{ href: '/employee/audit', label: 'التدقيق', icon: ClipboardCheck }] : []),
    ...(employee && hasEmployeePermission(employee, 'DEDUCTIONS', 'view') && !delegated.some(item => item.href === '/deductions') ? [{ href: '/employee/deductions', label: 'الخصومات', icon: Receipt }] : []),
    ...(employee && hasEmployeePermission(employee, 'BONUSES', 'view') && !delegated.some(item => item.href === '/bonuses') ? [{ href: '/employee/bonuses', label: 'المكافآت', icon: Gift }] : []),
    ...(employee && isCorrectionEmployee(data, employee) ? [{ href: '/employee/evaluation', label: 'التقييمات', icon: Trophy }] : []),
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
