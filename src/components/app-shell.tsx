'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, UsersRound, CalendarCheck2, CalendarDays, Wallet, Receipt, Gift, Building2, ChartNoAxesCombined, History, Settings2, Menu, LogOut, QrCode, UserRound, ScanLine, ChevronLeft, Monitor, ChevronDown, ShieldCheck, ClipboardCheck, Trophy, Moon, Sun } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Dialog, Skeleton } from '@/components/ui';
import { Brand } from '@/components/brand';
import { date } from '@/lib/format';
import { isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { DEMO_TODAY } from '@/lib/mock-data';
import { useTheme } from '@/components/theme-provider';

const adminNav = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard }, { href: '/employees', label: 'الموظفون', icon: UsersRound },
  { href: '/attendance', label: 'الحضور', icon: CalendarCheck2 },
  { href: '/evaluations', label: 'التدقيق', icon: ClipboardCheck },
  { href: '/payroll', label: 'الرواتب', icon: Wallet }, { href: '/deductions', label: 'الخصومات', icon: Receipt },
  { href: '/bonuses', label: 'المكافآت', icon: Gift }, { href: '/departments', label: 'الأقسام', icon: Building2, superOnly: true },
  { href: '/reports', label: 'التقارير', icon: ChartNoAxesCombined }, { href: '/audit', label: 'سجل العمليات', icon: History, superOnly: true },
  { href: '/settings', label: 'الإعدادات', icon: Settings2, superOnly: true },
];
const baseEmployeeNav = [
  { href: '/employee', label: 'الرئيسية', icon: LayoutDashboard }, { href: '/employee/scan', label: 'تسجيل الحضور', icon: ScanLine },
  { href: '/employee/attendance', label: 'سجل الحضور', icon: CalendarCheck2 }, { href: '/employee/salary', label: 'راتبي', icon: Wallet },
  { href: '/employee/profile', label: 'حسابي', icon: UserRound },
];
function stateEmployee(data: ReturnType<typeof useDemo>['data'], employeeId: string) { return data.employees.find(item => item.id === employeeId); }

export function AppSkeleton() { return <div className="app-loading" role="status" aria-label="جارٍ تحميل الصفحة"><Brand/><Skeleton className="loading-title"/><div className="stats-grid">{[0,1,2,3].map(i => <Skeleton key={i} className="loading-stat"/>)}</div><Skeleton className="loading-main"/></div>; }
export function AppShell({ children, employee = false }: { children: ReactNode; employee?: boolean }) {
  const { session, ready, logout, data } = useDemo();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();
  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/login');
    else if (employee !== (session.role === 'EMPLOYEE')) router.replace(session.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
    else if (session.role === 'ADMIN' && ['/departments','/audit','/settings'].some(path => pathname.startsWith(path))) router.replace('/dashboard');
  }, [ready, session, employee, router, pathname]);
  if (!ready || !session || employee !== (session.role === 'EMPLOYEE')) return <AppSkeleton/>;
  if (session.role === 'ADMIN' && ['/departments','/audit','/settings'].some(path => pathname.startsWith(path))) return <AppSkeleton/>;
  const employeeRecord = session.employeeId ? stateEmployee(data, session.employeeId) : undefined;
  const employeeNav = employee ? [
    ...baseEmployeeNav.slice(0, 2),
    ...(employeeRecord && isAuditEmployee(data, employeeRecord) ? [{ href: '/employee/audit', label: 'التدقيق', icon: ClipboardCheck }] : []),
    ...(employeeRecord && isCorrectionEmployee(data, employeeRecord) ? [{ href: '/employee/evaluation', label: 'التقييمات', icon: Trophy }] : []),
    ...baseEmployeeNav.slice(2),
  ] : baseEmployeeNav;
  const nav = employee ? employeeNav : adminNav.filter(item => !item.superOnly || session.role === 'SUPER_ADMIN');
  const current = nav.find(item => item.href === pathname || (item.href !== '/employee' && pathname.startsWith(item.href + '/')));
  function exit() { logout(); router.replace('/login'); }
  const links = <>{nav.map(item => <Link key={item.href} href={item.href} onClick={() => setMenu(false)} className={`nav-link ${current?.href === item.href ? 'active' : ''}`} aria-current={current?.href === item.href ? 'page' : undefined}><item.icon size={19}/><span>{item.label}</span>{current?.href === item.href && <span className="nav-active-mark"/>}</Link>)}</>;
  return <>
    <div className={`app-shell ${employee ? 'employee-shell' : ''}`}>
      <aside className="sidebar"><Link href={employee ? '/employee' : '/dashboard'} className="sidebar-brand"><Brand/></Link><div className="workspace-label"><span className="workspace-dot"/>إدارة المركز<span className="workspace-version">01</span></div><div className="nav-caption">{employee ? 'مساحتك الشخصية' : 'مساحة العمل'}</div><nav aria-label="القائمة الرئيسية">{links}</nav>{!employee && <Link className="sidebar-qr" href="/attendance-display"><QrCode size={22}/><div>شاشة الحضور<span>عرض الرمز على شاشة المركز</span></div><ChevronLeft size={16}/></Link>}<div className="sidebar-footer"><ShieldCheck size={16}/><span>نظام واحد. مركز أكثر وضوحاً.</span></div></aside>
      <div className="app-main"><div className="preview-strip"><span className="preview-dot"/>معاينة الواجهات<span className="preview-strip-detail">حفظ محلي في المتصفح · معاينة الواجهات</span><Link href="/login?switch=1">تبديل الدور <ChevronLeft size={13}/></Link></div><header className="topbar"><div className="inline"><button className="icon-button mobile-menu" onClick={() => setMenu(true)} aria-label="فتح القائمة"><Menu size={22}/></button><div className="breadcrumb"><span>CenterPro</span><ChevronLeft size={13}/><strong>{current?.label || 'مساحة العمل'}</strong></div></div><div className="topbar-end"><div className="topbar-date"><CalendarDays size={16}/><span dir="ltr">{date(DEMO_TODAY)}</span></div><button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button><span className="topbar-divider"/><Link href={employee ? '/employee/profile' : session.employeeId ? `/employees/${session.employeeId}` : '/settings'} className="user-menu"><Avatar name={session.name}/><div><strong>{session.name.split(' ').slice(0,2).join(' ')}</strong><span>{session.role === 'SUPER_ADMIN' ? 'المدير العام' : session.role === 'ADMIN' ? 'مدير العمليات' : 'حساب الموظف'}</span></div><ChevronDown size={14}/></Link><button className="icon-button desktop-logout" onClick={exit} aria-label="تسجيل الخروج"><LogOut size={18}/></button></div></header><main className="main-content" id="main-content">{children}</main><footer className="app-footer"><span>CenterPro © 2026</span><span>إدارة مبنية على الوضوح.</span></footer></div>
      <nav className="mobile-bottom-nav" aria-label="التنقل السريع">{(employee ? employeeNav.filter(item => item.href !== '/employee/attendance').slice(0,4) : adminNav.filter(item => ['/dashboard','/employees','/attendance','/payroll'].includes(item.href))).map(item => <Link href={item.href} key={item.href} className={current?.href === item.href ? 'active' : ''}><item.icon size={21}/><span>{item.label}</span></Link>)}<button onClick={() => setMenu(true)}><Menu size={21}/><span>المزيد</span></button></nav>
    </div>
    <Dialog open={menu} onClose={() => setMenu(false)} title="مساحة العمل"><div className="mobile-nav-links">{links}{!employee && <Link className="nav-link" href="/attendance-display"><Monitor size={19}/>شاشة الحضور</Link>}<button className="nav-link" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}<span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span></button><button className="nav-link" onClick={exit}><LogOut size={19}/>تسجيل الخروج</button></div></Dialog>
  </>;
}
