import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AppShell><Suspense fallback={<div className="page-stack" role="status"><div className="skeleton" style={{ height: 72 }} /><div className="skeleton" style={{ height: 260 }} /><span className="sr-only">جارٍ تحميل الصفحة…</span></div>}>{children}</Suspense></AppShell>; }
