'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarDays, Menu, LogOut, QrCode, ChevronLeft, Monitor, ChevronDown, ShieldCheck, Moon, Sun } from 'lucide-react';
import { Avatar, Dialog } from '@/components/ui';
import { Brand } from '@/components/brand';
import type { ThemeMode } from '@/components/theme-provider';
import { date } from '@/lib/format';
import type { DemoSession } from '@/lib/types';
import type { NavigationItem } from './navigation';

interface NavigationProps { employee: boolean; links: ReactNode }
interface SessionActions {
  theme: ThemeMode;
  toggleTheme: () => void;
  loggingOut: boolean;
  exit: () => Promise<void>;
}

export function ShellSidebar({ employee, links }: NavigationProps) {
  return <aside className="sidebar">
    <Link href={employee ? '/employee' : '/dashboard'} className="sidebar-brand"><Brand/></Link>
    <div className="workspace-label"><span className="workspace-dot"/>إدارة المركز<span className="workspace-version">01</span></div>
    <div className="nav-caption">{employee ? 'مساحتك الشخصية' : 'مساحة العمل'}</div>
    <nav aria-label="القائمة الرئيسية">{links}</nav>
    {!employee && <Link className="sidebar-qr" href="/attendance-display"><QrCode size={22}/><div>شاشة الحضور<span>عرض الرمز على شاشة المركز</span></div><ChevronLeft size={16}/></Link>}
    <div className="sidebar-footer"><ShieldCheck size={16}/><span>نظام واحد. مركز أكثر وضوحاً.</span></div>
  </aside>;
}

interface TopbarProps extends SessionActions {
  employee: boolean;
  session: DemoSession;
  current: NavigationItem | undefined;
  today: string;
  openMenu: () => void;
}

export function ShellTopbar({ employee, session, current, today, openMenu, theme, toggleTheme, loggingOut, exit }: TopbarProps) {
  return <header className="topbar">
    <div className="inline">
      <button className="icon-button mobile-menu" onClick={openMenu} aria-label="فتح القائمة"><Menu size={22}/></button>
      <div className="breadcrumb"><span>CenterPro</span><ChevronLeft size={13}/><strong>{current?.label || 'مساحة العمل'}</strong></div>
    </div>
    <div className="topbar-end">
      <div className="topbar-date"><CalendarDays size={16}/><span dir="ltr">{date(today)}</span></div>
      <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <span className="topbar-divider"/>
      <Link href={employee ? '/employee/profile' : session.employeeId ? `/employees/${session.employeeId}` : '/settings'} className="user-menu"><Avatar name={session.name}/><div><strong>{session.name.split(' ').slice(0,2).join(' ')}</strong><span>{session.role === 'SUPER_ADMIN' ? 'المدير العام' : session.role === 'ADMIN' ? 'مدير العمليات' : 'حساب الموظف'}</span></div><ChevronDown size={14}/></Link>
      <button className="icon-button desktop-logout" onClick={exit} disabled={loggingOut} aria-label="تسجيل الخروج"><LogOut size={18}/></button>
    </div>
  </header>;
}

interface MobileNavigationProps {
  nav: readonly NavigationItem[];
  current: NavigationItem | undefined;
  openMenu: () => void;
}

export function ShellMobileNavigation({ nav, current, openMenu }: MobileNavigationProps) {
  return <nav className="mobile-bottom-nav" aria-label="التنقل السريع">
    {nav.map(item => <Link href={item.href} key={item.href} className={current?.href === item.href ? 'active' : ''}><item.icon size={21}/><span>{item.label}</span></Link>)}
    <button onClick={openMenu}><Menu size={21}/><span>المزيد</span></button>
  </nav>;
}

interface MobileMenuProps extends NavigationProps, SessionActions {
  open: boolean;
  closeMenu: () => void;
}

export function ShellMobileMenu({ employee, links, open, closeMenu, theme, toggleTheme, loggingOut, exit }: MobileMenuProps) {
  return <Dialog open={open} onClose={closeMenu} title="مساحة العمل">
    <div className="mobile-nav-links">
      {links}
      {!employee && <Link className="nav-link" href="/attendance-display"><Monitor size={19}/>شاشة الحضور</Link>}
      <button className="nav-link" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}<span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span></button>
      <button className="nav-link" onClick={exit} disabled={loggingOut}><LogOut size={19}/>تسجيل الخروج</button>
    </div>
  </Dialog>;
}
