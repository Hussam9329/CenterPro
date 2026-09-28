import { Suspense } from 'react';
import { ReportsPage } from '@/components/finance/reports-page';
export default function ReportsRoute() { return <Suspense fallback={<p>جارٍ تجهيز التقارير…</p>}><ReportsPage /></Suspense>; }
