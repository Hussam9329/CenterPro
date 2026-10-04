'use client';

import { useState } from 'react';
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import { DEMO_MONTH } from '@/lib/mock-data';
import { getMonthPayroll } from '@/lib/payroll';
import { PayrollBreakdown } from '@/components/finance/payroll-breakdown';
import { monthSource } from '@/components/finance/finance-data';

export default function EmployeeSalaryPage() {
  const { data, session } = useDemo();
  const [month, setMonth] = useState(DEMO_MONTH);
  const result = session ? getMonthPayroll(data, month).find(item => item.employeeId === session.employeeId) : undefined;
  const period = data.months.find(item => item.month === month);
  return <div className="page-stack"><PageHeader title="راتبي" /><Card><div className="toolbar"><label className="inline">الشهر <Input type="month" value={month} onChange={e => { if(e.target.value) setMonth(e.target.value); }} aria-label="شهر راتبي" /></label><Badge tone={period?.state === 'ARCHIVED' ? 'success' : 'brand'}>{period?.state === 'ARCHIVED' ? 'كشف مؤرشف' : period?.state === 'REOPENED' ? 'معاد فتحه للمراجعة' : 'راتب تقديري · شهر مفتوح'}</Badge></div></Card>{result ? <PayrollBreakdown result={result} data={monthSource(data, month)} /> : <EmptyState title="لا يوجد كشف راتب لهذا الشهر" description="اختر شهراً ضمن فترة عملك للاطلاع على كشفك." />}</div>;
}
