'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useDemo } from '@/components/demo-provider';
import { Skeleton } from '@/components/ui';
import { Brand } from '@/components/brand';
import { useTheme } from '@/components/theme-provider';
import { getActiveNavigation, getMobileNavigation, getShellNavigation, getShellRedirect } from './app-shell/navigation';
import { ShellMobileMenu, ShellMobileNavigation, ShellSidebar, ShellTopbar } from './app-shell/presentation';

export function AppSkeleton() { return <div className="app-loading" role="status" aria-label="جارٍ تحميل الصفحة"><Brand/><Skeleton className="loading-title"/><div className="stats-grid">{[0,1,2,3].map(i => <Skeleton key={i} className="loading-stat"/>)}</div><Skeleton className="loading-main"/></div>; }
export function AppShell({ children, employee = false }: { children: ReactNode; employee?: boolean }) {
  const { session, ready, logout, data, today, backend, connectionError, refresh, notify } = useDemo();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const redirect = getShellRedirect(session, employee, pathname);
  useEffect(() => {
    if (!ready) return;
    if (redirect) router.replace(redirect);
  }, [ready, session, employee, router, pathname, redirect]);
  if (!ready && connectionError) return <main className="app-loading" id="main-content"><Brand/><p role="alert">{connectionError}</p><button className="btn btn-primary" onClick={() => { void refresh().catch(() => {}); }}>إعادة الاتصال</button></main>;
  if (!ready || !session || redirect) return <AppSkeleton/>;
  const nav = getShellNavigation(data, session, employee);
  const current = getActiveNavigation(nav, pathname);
  async function exit() {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); router.replace('/login'); }
    catch (error) { notify(error instanceof Error ? error.message : 'تعذر تسجيل الخروج. حاول مرة أخرى.'); }
    finally { setLoggingOut(false); }
  }
  const links = <>{nav.map(item => <Link key={item.href} href={item.href === '/calculator' ? { pathname: '/calculator', query: { returnTo: pathname } } : item.href} onClick={() => setMenu(false)} className={`nav-link ${current?.href === item.href ? 'active' : ''}`} aria-current={current?.href === item.href ? 'page' : undefined}><item.icon size={19}/><span>{item.label}</span>{current?.href === item.href && <span className="nav-active-mark"/>}</Link>)}</>;
  return <>
    <div className={`app-shell ${employee ? 'employee-shell' : ''}`}>
      <ShellSidebar employee={employee} links={links}/>
      <div className="app-main">
        <ShellTopbar employee={employee} session={session} current={current} today={today} openMenu={() => setMenu(true)} theme={theme} toggleTheme={toggleTheme} loggingOut={loggingOut} exit={exit}/>
        <main className="main-content" id="main-content">
          {connectionError && <div className="notice" role="alert"><span>{connectionError}</span><button className="btn btn-secondary" onClick={() => { void refresh().catch(() => {}); }}>إعادة الاتصال</button></div>}
          {children}
        </main>
        <footer className="app-footer"><span>Kal-EL VISIONS © 2026</span>{backend === 'neon' && <span>{connectionError ? 'تعذر تحديث البيانات من الخادم' : 'البيانات محفوظة على الخادم'}</span>}</footer>
      </div>
      <ShellMobileNavigation nav={getMobileNavigation(nav, employee)} current={current} openMenu={() => setMenu(true)}/>
    </div>
    <ShellMobileMenu employee={employee} links={links} open={menu} closeMenu={() => setMenu(false)} theme={theme} toggleTheme={toggleTheme} loggingOut={loggingOut} exit={exit}/>
  </>;
}
