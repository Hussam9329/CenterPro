'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Gift, MinusCircle, Pencil, Plus } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Button, Card, EmptyState, Input, PageHeader, SearchInput, Select, StatCard } from '@/components/ui';
import { money } from '@/lib/format';
import type { Bonus, Deduction } from '@/lib/types';
import { hasSessionAccountPermission } from '@/lib/permissions';
import { monthIsLocked } from './finance-data';
import { AdjustmentRecords, AdjustmentDialog, type Adjustment, type AdjustmentForm } from './adjustment-views';

export function AdjustmentsPage({ kind }: { kind: 'deductions' | 'bonuses' }) {
  const { data, session, updateData, today, month: currentMonth } = useDemo();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const isDeduction = kind === 'deductions';
  const feature = isDeduction ? 'DEDUCTIONS' as const : 'BONUSES' as const;
  const noun = isDeduction ? 'خصم' : 'مكافأة';
  const canCreate = hasSessionAccountPermission(data, session, feature, 'create');
  const canEdit = hasSessionAccountPermission(data, session, feature, 'edit');
  const canDelete = hasSessionAccountPermission(data, session, feature, 'delete');
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Adjustment | null>(null);
  const [open, setOpen] = useState(() => searchParams.get('add') === '1' && canCreate && data.employees.length > 0 && !monthIsLocked(data, currentMonth, session?.role));
  const [error, setError] = useState('');
  const [form, setForm] = useState<AdjustmentForm>({ employeeId: '', amount: '', date: today, reason: '', type: 'خصم إداري', customType: '' });
  const rows = data[kind].filter(item => item.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const filtered = rows.filter(item => { const employee = data.employees.find(person => person.id === item.employeeId); return (!query || `${employee?.name} ${employee?.code} ${item.reason}`.includes(query)) && (!department || employee?.departmentId === department) && (!typeFilter || ('type' in item && item.type === typeFilter)); });
  const visible = filtered.slice((page - 1) * 8, page * 8);
  const locked = monthIsLocked(data, month, session?.role);
  const state = data.months.find(item => item.month === month)?.state;

  function begin(item?: Adjustment) {
    if (pending || (item ? !canEdit : !canCreate)) return;
    if (monthIsLocked(data, item?.date.slice(0, 7) ?? month, session?.role)) return;
    if (!data.employees.length) { toast('أضف موظفاً أولاً قبل تسجيل الخصومات والمكافآت.'); return; }
    setEditing(item ?? null); setError('');
    setForm(item ? { employeeId: item.employeeId, amount: String(item.amount), date: item.date, reason: item.reason, type: 'type' in item ? item.type : 'خصم إداري', customType: 'customType' in item ? item.customType : '' } : { employeeId: '', amount: '', date: month === currentMonth ? today : `${month}-01`, reason: '', type: 'خصم إداري', customType: '' });
    setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!session || (editing ? !canEdit : !canCreate)) return;
    const amount = Number(form.amount);
    if (!data.employees.some(person => person.id === form.employeeId)) { setError('اختر الموظف أولاً.'); return; }
    if (form.amount === '' || !Number.isSafeInteger(amount) || amount < 0) { setError('أدخل مبلغاً صحيحاً غير سالب بالدينار العراقي.'); return; }
    if (!form.date || !form.reason.trim() || (isDeduction && form.type === 'أخرى' && !form.customType.trim())) { setError('أكمل التاريخ والسبب ونوع الخصم عند اختيار «أخرى».'); return; }
    if (monthIsLocked(data, form.date.slice(0, 7), session.role) || (editing && monthIsLocked(data, editing.date.slice(0, 7), session.role))) { setError('الشهر مؤرشف أو لا تملك صلاحية تعديل الشهر المعاد فتحه.'); return; }
    const base: Bonus = { id: editing?.id ?? crypto.randomUUID(), employeeId: form.employeeId, amount, date: form.date, reason: form.reason.trim(), createdBy: editing?.createdBy ?? session.name, createdAt: editing?.createdAt ?? new Date().toISOString() };
    const entry: Adjustment = isDeduction ? { ...base, type: form.type, customType: form.type === 'أخرى' ? form.customType.trim() : '' } : base;
    if (!await mutate(() => updateData((draft, actor) => {
      if (!hasSessionAccountPermission(draft, actor, feature, editing ? 'edit' : 'create')) throw new Error('لم تعد تملك صلاحية حفظ هذه العملية.');
      if (isDeduction) { const index = draft.deductions.findIndex(item => item.id === entry.id); if(index >= 0) draft.deductions[index] = entry as Deduction; else draft.deductions.push(entry as Deduction); }
      else { const index = draft.bonuses.findIndex(item => item.id === entry.id); if(index >= 0) draft.bonuses[index] = entry; else draft.bonuses.push(entry); }
    }, { action: `${editing ? 'تعديل' : 'إضافة'} ${noun}`, entity: isDeduction ? 'خصم' : 'مكافأة', entityId: entry.id, employeeId: entry.employeeId, oldValues: editing ? { ...editing } : {}, newValues: { ...entry } }), setError)) return;
    toast(`تم ${editing ? 'تعديل' : 'إضافة'} ${noun}.`); setOpen(false);
  }
  const rowActions = (item: Adjustment) => <div className="inline">{canEdit && <Button variant="ghost" disabled={monthIsLocked(data, item.date.slice(0, 7), session?.role)} aria-label={`تعديل ${noun} ${data.employees.find(person => person.id === item.employeeId)?.name}`} onClick={() => begin(item)}><Pencil size={16} /></Button>}{canDelete && <SafeDeleteButton collection={kind} id={item.id} label={`${noun} ${data.employees.find(person => person.id === item.employeeId)?.name ?? "الموظف"}`} compact />}</div>;
  return <div className="page-stack"><PageHeader title={isDeduction ? 'الخصومات' : 'المكافآت'} actions={canCreate ? <Button onClick={() => begin()} disabled={locked || !data.employees.length}><Plus size={18} /> إضافة {noun}</Button> : undefined} />
    {!canCreate && !canEdit && !canDelete && <div className="notice">لديك صلاحية عرض السجلات فقط.</div>}
    {locked && <div className="notice">سجلات الشهر محمية. يتطلب التعديل إعادة فتح الشهر بواسطة المشرف العام.</div>}{state === 'REOPENED' && <div className="notice notice-warning">شهر مؤرشف سابقاً. التعديلات هنا لا تغيّر النسخة المالية حتى ينفذ المشرف العام إعادة الاحتساب من صفحة الرواتب.</div>}
    <div className="stats-grid"><StatCard label={isDeduction ? 'إجمالي الخصومات' : 'إجمالي المكافآت'} value={money(rows.reduce((sum, item) => sum + item.amount, 0))} icon={isDeduction ? <MinusCircle size={20} /> : <Gift size={20} />} accent /><StatCard label="عدد العمليات" value={String(rows.length)} /><StatCard label="الموظفون المشمولون" value={String(new Set(rows.map(item => item.employeeId)).size)} /></div>
    <Card title={isDeduction ? 'سجل الخصومات' : 'سجل المكافآت'}><div className="filter-row"><SearchInput value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="اسم الموظف، رقمه أو السبب" /><Input type="month" value={month} aria-label="الشهر" onChange={e => { if(e.target.value) { setMonth(e.target.value); setPage(1); } }} /><Select aria-label="القسم" value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}><option value="">كل الأقسام</option>{data.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>{isDeduction && <Select aria-label="نوع الخصم" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}><option value="">كل الأنواع</option><option>اعتراض</option><option>خصم إداري</option><option>أخرى</option></Select>}</div>
    {!filtered.length ? <EmptyState title={data[kind].length ? (isDeduction ? 'لا توجد خصومات تطابق اختياراتك' : 'لا توجد مكافآت تطابق اختياراتك') : (isDeduction ? 'لا توجد خصومات.' : 'لا توجد مكافآت.')} description={!data.employees.length ? 'أضف موظفاً أولاً. ستتمكن بعدها من توثيق المبلغ والتاريخ والسبب ومتابعة أثره على الراتب.' : rows.length ? 'غيّر خيارات البحث لإظهار العمليات المطلوبة.' : `ستظهر هنا كل ${noun} تضيفها، مع المبلغ والسبب وسجلها المالي.`} action={!data.employees.length ? undefined : canCreate ? <Button variant="secondary" disabled={locked} onClick={() => begin()}>إضافة {noun}</Button> : undefined} /> : <><AdjustmentRecords visible={visible} data={data} isDeduction={isDeduction} page={page} total={filtered.length} onPageChange={setPage} rowActions={rowActions} /></>}
    </Card>
    <AdjustmentDialog open={open && (editing ? canEdit : canCreate)} pending={pending} editing={Boolean(editing)} noun={noun} isDeduction={isDeduction} data={data} form={form} error={error} onFormChange={setForm} onClose={() => setOpen(false)} onSubmit={save} />
  </div>;
}
