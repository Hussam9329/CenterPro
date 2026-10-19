'use client';

import { useMemo, useState } from 'react';
import { FilterX, History, ShieldCheck } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, StatCard } from '@/components/ui';
import { number } from '@/lib/format';
import { hasSessionAccountPermission } from '@/lib/permissions';
import type { AuditEntry } from '@/lib/types';
import { baghdadDate, entityLabels } from './audit-values';
import { AuditRecords, AuditDetailsDialog } from './audit-records';

export function AuditPage() {
  const { data, session } = useDemo();
  const [actor, setActor] = useState('all');
  const [employee, setEmployee] = useState('all');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const pageSize = 10;
  const invalidRange = Boolean(from && to && from > to);
  const rows = useMemo(() => data.audit.filter(entry => {
    const day = baghdadDate(entry.timestamp);
    return !invalidRange && (actor === 'all' || actor === entry.actor) && (employee === 'all' || employee === entry.employeeId) && (action === 'all' || action === entry.action) && (entity === 'all' || entity === entry.entity) && (!from || day >= from) && (!to || day <= to);
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [data.audit, actor, employee, action, entity, from, to, invalidRange]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const clear = () => { setActor('all'); setEmployee('all'); setAction('all'); setEntity('all'); setFrom(''); setTo(''); setPage(1); };
  const hasFilters = actor !== 'all' || employee !== 'all' || action !== 'all' || entity !== 'all' || Boolean(from || to);
  const canView = session?.role === 'SUPER_ADMIN' || (session?.role === 'EMPLOYEE' && hasSessionAccountPermission(data, session, 'AUDIT_LOG', 'view'));

  if (!canView) return <EmptyState title="لا تملك صلاحية عرض سجل العمليات" description="يجب أن يمنحك المشرف العام صلاحية سجل العمليات أولاً." />;

  return <div className="page-stack">
    <PageHeader title="سجل العمليات" actions={<Badge tone="brand"><ShieldCheck size={14} />{session?.role === 'SUPER_ADMIN' ? 'المدير العام' : 'عرض مفوض'}</Badge>} />
    <div className="stats-grid"><StatCard label="العمليات المسجلة" value={number(data.audit.length)} icon={<History size={21} />} /><StatCard label="نتائج الفلاتر" value={number(rows.length)} accent /><StatCard label="المستخدمون المنفذون" value={number(new Set(data.audit.map(entry => entry.actor)).size)} /></div>
    <Card title="البحث في السجل" action={hasFilters ? <Button variant="ghost" onClick={clear}><FilterX size={17} />مسح الفلاتر</Button> : undefined}>
      <div className="form-grid">
        <Field label="المستخدم المنفذ"><Select value={actor} onChange={event => change(setActor, event.target.value)}><option value="all">جميع المستخدمين</option>{[...new Set(data.audit.map(entry => entry.actor))].map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="الموظف المرتبط"><Select value={employee} onChange={event => change(setEmployee, event.target.value)}><option value="all">جميع الموظفين</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}</Select></Field>
        <Field label="الإجراء"><Select value={action} onChange={event => change(setAction, event.target.value)}><option value="all">جميع الإجراءات</option>{[...new Set(data.audit.map(entry => entry.action))].map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="نوع السجل"><Select value={entity} onChange={event => change(setEntity, event.target.value)}><option value="all">جميع الأنواع</option>{[...new Set(data.audit.map(entry => entry.entity))].map(value => <option key={value} value={value}>{entityLabels[value] || value}</option>)}</Select></Field>
        <Field label="من تاريخ"><Input type="date" value={from} max={to || undefined} dir="ltr" onChange={event => change(setFrom, event.target.value)} /></Field>
        <Field label="إلى تاريخ" error={invalidRange ? 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية أو مساوياً له.' : undefined}><Input type="date" value={to} min={from || undefined} dir="ltr" onChange={event => change(setTo, event.target.value)} /></Field>
      </div>
    </Card>
    <Card title="الإجراءات">
      {rows.length === 0 ? <EmptyState title={hasFilters ? "لا توجد عمليات تطابق الفلاتر" : "لا توجد عمليات مسجلة حتى الآن."} description={hasFilters ? "جرّب فترة زمنية أخرى أو امسح الفلاتر." : "ستُسجّل هنا الإضافات والتعديلات التي تجريها داخل CenterPro."} action={hasFilters ? <Button variant="secondary" onClick={clear}>مسح الفلاتر</Button> : undefined} /> : <>
        <AuditRecords visible={visible} data={data} currentPage={currentPage} total={rows.length} pageSize={pageSize} onPageChange={setPage} onSelect={setSelected} />
      </>}
    </Card>
    <AuditDetailsDialog selected={selected} data={data} onClose={() => setSelected(null)} />
  </div>;
}
