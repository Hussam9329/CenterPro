'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { AccountPermissionsEditor } from '@/components/people/account-permissions-editor';
import { Card, EmptyState, PageHeader, Select } from '@/components/ui';

export default function PermissionsPage() {
  const { data, session } = useDemo();
  const employees = useMemo(() => data.employees.filter(employee => employee.role === 'EMPLOYEE').sort((a, b) => a.name.localeCompare(b.name, 'ar')), [data.employees]);
  const [selectedId, setSelectedId] = useState('');
  const selected = employees.find(employee => employee.id === selectedId) ?? employees[0];

  if (session?.role !== 'SUPER_ADMIN') return <EmptyState title="إدارة الصلاحيات متاحة للمشرف العام فقط" />;
  return <div className="page-stack">
    <PageHeader eyebrow="إدارة الحسابات" title="الصلاحيات" description="امنح قوائم إضافية لحساب موظف محدد، بغض النظر عن قسمه. يبدأ منح أي قائمة بصلاحية العرض فقط." />
    {!employees.length ? <Card><EmptyState title="لا توجد حسابات موظفين" description="أضف حساب موظف أولاً ثم ارجع لإدارة صلاحياته." /></Card> : <>
      <Card title="اختيار الموظف"><div className="field"><span className="field-label">حساب الموظف</span><Select value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)} aria-label="حساب الموظف">{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} — {employee.code}</option>)}</Select></div><div className="notice"><ShieldCheck size={19}/><span>الصلاحيات هنا تخص هذا الحساب فقط ولا تعتمد على اسم القسم أو وظيفة الموظف.</span></div></Card>
      {selected && <AccountPermissionsEditor key={selected.id} employee={selected} />}
    </>}
  </div>;
}
