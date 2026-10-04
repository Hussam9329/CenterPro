'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Gift, MinusCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from '@/components/ui';
import { date, money } from '@/lib/format';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import type { Bonus, Deduction } from '@/lib/types';
import { monthIsLocked } from './finance-data';
import styles from './finance.module.css';

type Adjustment = Bonus | Deduction;
interface AdjustmentForm { employeeId: string; amount: string; date: string; reason: string; type: Deduction['type']; customType: string }

export function AdjustmentsPage({ kind }: { kind: 'deductions' | 'bonuses' }) {
  const { data, session, updateData } = useDemo();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isDeduction = kind === 'deductions';
  const noun = isDeduction ? 'خصم' : 'مكافأة';
  const [month, setMonth] = useState(DEMO_MONTH);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Adjustment | null>(null);
  const [open, setOpen] = useState(() => searchParams.get('add') === '1' && data.employees.length > 0 && !monthIsLocked(data, DEMO_MONTH, session?.role));
  const [toDelete, setToDelete] = useState<Adjustment | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AdjustmentForm>({ employeeId: '', amount: '', date: DEMO_TODAY, reason: '', type: 'خصم إداري', customType: '' });
  const rows = data[kind].filter(item => item.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const filtered = rows.filter(item => { const employee = data.employees.find(person => person.id === item.employeeId); return (!query || `${employee?.name} ${employee?.code} ${item.reason}`.includes(query)) && (!department || employee?.departmentId === department) && (!typeFilter || ('type' in item && item.type === typeFilter)); });
  const visible = filtered.slice((page - 1) * 8, page * 8);
  const locked = monthIsLocked(data, month, session?.role);
  const state = data.months.find(item => item.month === month)?.state;

  function begin(item?: Adjustment) {
    if (!data.employees.length) { toast('أضف موظفاً أولاً قبل تسجيل الخصومات والمكافآت.'); return; }
    setEditing(item ?? null); setError('');
    setForm(item ? { employeeId: item.employeeId, amount: String(item.amount), date: item.date, reason: item.reason, type: 'type' in item ? item.type : 'خصم إداري', customType: 'customType' in item ? item.customType : '' } : { employeeId: '', amount: '', date: month === DEMO_MONTH ? DEMO_TODAY : `${month}-01`, reason: '', type: 'خصم إداري', customType: '' });
    setOpen(true);
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!session || session.role === 'EMPLOYEE') return;
    const amount = Number(form.amount);
    if (!data.employees.some(person => person.id === form.employeeId)) { setError('اختر الموظف أولاً.'); return; }
    if (form.amount === '' || !Number.isSafeInteger(amount) || amount < 0) { setError('أدخل مبلغاً صحيحاً غير سالب بالدينار العراقي.'); return; }
    if (!form.date || !form.reason.trim() || (isDeduction && form.type === 'أخرى' && !form.customType.trim())) { setError('أكمل التاريخ والسبب ونوع الخصم عند اختيار «أخرى».'); return; }
    if (monthIsLocked(data, form.date.slice(0, 7), session.role) || (editing && monthIsLocked(data, editing.date.slice(0, 7), session.role))) { setError('الشهر مؤرشف أو لا تملك صلاحية تعديل الشهر المعاد فتحه.'); return; }
    const base: Bonus = { id: editing?.id ?? crypto.randomUUID(), employeeId: form.employeeId, amount, date: form.date, reason: form.reason.trim(), createdBy: editing?.createdBy ?? session.name, createdAt: editing?.createdAt ?? new Date().toISOString() };
    const entry: Adjustment = isDeduction ? { ...base, type: form.type, customType: form.type === 'أخرى' ? form.customType.trim() : '' } : base;
    updateData(draft => {
      if (isDeduction) { const index = draft.deductions.findIndex(item => item.id === entry.id); if(index >= 0) draft.deductions[index] = entry as Deduction; else draft.deductions.push(entry as Deduction); }
      else { const index = draft.bonuses.findIndex(item => item.id === entry.id); if(index >= 0) draft.bonuses[index] = entry; else draft.bonuses.push(entry); }
    }, { action: `${editing ? 'تعديل' : 'إضافة'} ${noun}`, entity: isDeduction ? 'خصم' : 'مكافأة', entityId: entry.id, employeeId: entry.employeeId, oldValues: editing ? { ...editing } : {}, newValues: { ...entry } });
    toast(`تم ${editing ? 'تعديل' : 'إضافة'} ${noun} في المعاينة.`); setOpen(false);
  }
  function remove() {
    if (!toDelete || !session || session.role === 'EMPLOYEE' || monthIsLocked(data, toDelete.date.slice(0, 7), session.role)) return;
    updateData(draft => { if(isDeduction) draft.deductions = draft.deductions.filter(item => item.id !== toDelete.id); else draft.bonuses = draft.bonuses.filter(item => item.id !== toDelete.id); }, { action: `حذف ${noun}`, entity: noun, entityId: toDelete.id, employeeId: toDelete.employeeId, oldValues: { ...toDelete }, newValues: {} });
    toast(`تم حذف ${noun} وتحديث الراتب في الشهر المفتوح.`); setToDelete(null);
  }
  const rowActions = (item: Adjustment) => <div className="inline"><Button variant="ghost" disabled={monthIsLocked(data, item.date.slice(0, 7), session?.role)} aria-label={`تعديل ${noun} ${data.employees.find(person => person.id === item.employeeId)?.name}`} onClick={() => begin(item)}><Pencil size={16} /></Button><Button variant="ghost" disabled={monthIsLocked(data, item.date.slice(0, 7), session?.role)} aria-label={`حذف ${noun} ${data.employees.find(person => person.id === item.employeeId)?.name}`} onClick={() => setToDelete(item)}><Trash2 size={16} /></Button></div>;
  return <div className="page-stack"><PageHeader title={isDeduction ? 'الخصومات' : 'المكافآت'} actions={<Button onClick={() => begin()} disabled={locked || !data.employees.length}><Plus size={18} /> إضافة {noun}</Button>} />
    {locked && <div className="notice">سجلات الشهر محمية. يتطلب التعديل إعادة فتح الشهر بواسطة المشرف العام.</div>}{state === 'REOPENED' && <div className="notice notice-warning">شهر مؤرشف سابقاً. التعديلات هنا لا تغيّر النسخة المالية حتى ينفذ المشرف العام إعادة الاحتساب من صفحة الرواتب.</div>}
    <div className="stats-grid"><StatCard label={isDeduction ? 'إجمالي الخصومات' : 'إجمالي المكافآت'} value={money(rows.reduce((sum, item) => sum + item.amount, 0))} icon={isDeduction ? <MinusCircle size={20} /> : <Gift size={20} />} accent /><StatCard label="عدد العمليات" value={String(rows.length)} /><StatCard label="الموظفون المشمولون" value={String(new Set(rows.map(item => item.employeeId)).size)} /></div>
    <Card title={isDeduction ? 'سجل الخصومات' : 'سجل المكافآت'}><div className="filter-row"><SearchInput value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="اسم الموظف، رقمه أو السبب" /><Input type="month" value={month} aria-label="الشهر" onChange={e => { if(e.target.value) { setMonth(e.target.value); setPage(1); } }} /><Select aria-label="القسم" value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}><option value="">كل الأقسام</option>{data.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>{isDeduction && <Select aria-label="نوع الخصم" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}><option value="">كل الأنواع</option><option>اعتراض</option><option>خصم إداري</option><option>أخرى</option></Select>}</div>
    {!filtered.length ? <EmptyState title={data[kind].length ? (isDeduction ? 'لا توجد خصومات تطابق اختياراتك' : 'لا توجد مكافآت تطابق اختياراتك') : (isDeduction ? 'لا توجد خصومات.' : 'لا توجد مكافآت.')} description={!data.employees.length ? 'أضف موظفاً أولاً. ستتمكن بعدها من توثيق المبلغ والتاريخ والسبب ومتابعة أثره على الراتب.' : rows.length ? 'غيّر خيارات البحث لإظهار العمليات المطلوبة.' : `ستظهر هنا كل ${noun} تضيفها، مع المبلغ والسبب وسجلها المالي.`} action={!data.employees.length ? <Link className="button-link" href={data.departments.length ? '/employees?add=1' : '/departments'}>{data.departments.length ? 'إضافة أول موظف' : 'إضافة أول قسم'}</Link> : <Button variant="secondary" disabled={locked} onClick={() => begin()}>إضافة {noun}</Button>} /> : <><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>المبلغ</th><th>التاريخ</th>{isDeduction && <th>النوع</th>}<th>السبب</th><th>أضيف بواسطة</th><th>الإجراءات</th></tr></thead><tbody>{visible.map(item => { const employee = data.employees.find(person => person.id === item.employeeId); return <tr key={item.id}><td>{employee?.name}<div className={styles.small}>{employee?.code}</div></td><td className={`amount ${isDeduction ? 'text-danger' : ''}`}><strong>{money(item.amount)}</strong></td><td>{date(item.date)}</td>{'type' in item && <td><Badge tone="neutral">{item.type === 'أخرى' ? (item as Deduction).customType : String(item.type)}</Badge></td>}<td style={{ maxWidth: 280 }}>{item.reason}</td><td>{item.createdBy}<div className={styles.small}>{date(item.createdAt)}</div></td><td>{rowActions(item)}</td></tr>; })}</tbody></table></div><div className="mobile-cards">{visible.map(item => <Card key={item.id}><div className={styles.recordHead}><strong>{data.employees.find(person => person.id === item.employeeId)?.name}</strong><strong className={`amount ${isDeduction ? 'text-danger' : ''}`}>{money(item.amount)}</strong></div><p>{item.reason}</p><div className={styles.recordHead}><div className="inline"><span className={styles.small}>{date(item.date)}</span>{'type' in item && <Badge>{item.type === 'أخرى' ? (item as Deduction).customType : String(item.type)}</Badge>}</div>{rowActions(item)}</div></Card>)}</div><Pagination page={page} total={filtered.length} pageSize={8} onChange={setPage} /></>}
    </Card>
    <Dialog open={open} onClose={() => setOpen(false)} title={`${editing ? 'تعديل' : 'إضافة'} ${noun}`}><form onSubmit={save} className="stack"><Field label="الموظف" required><Select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}><option value="">اختر الموظف</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}{!item.active ? ' (غير فعال)' : ''}</option>)}</Select></Field><div className="form-grid"><Field label="المبلغ (د.ع)" required><Input type="number" min="0" step="1" inputMode="numeric" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field><Field label="التاريخ" required><Input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field></div>{isDeduction && <Field label="نوع الخصم" required><Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Deduction['type'] })}><option>اعتراض</option><option>خصم إداري</option><option>أخرى</option></Select></Field>}{isDeduction && form.type === 'أخرى' && <Field label="تحديد نوع الخصم" required><Input required value={form.customType} maxLength={80} onChange={e => setForm({ ...form, customType: e.target.value })} /></Field>}<Field label={`سبب ${noun}`} required><Textarea required rows={3} value={form.reason} maxLength={1000} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={isDeduction ? 'مثال: اعتراض على تصحيح السؤال رقم 4' : 'مثال: أداء مميز خلال الأسبوع'} /></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button><Button type="submit">حفظ {noun}</Button></div></form></Dialog>
    <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={remove} danger title={`حذف ${noun}؟`} description={`سيُحذف ${noun} بقيمة ${money(toDelete?.amount ?? 0)} للموظف ${data.employees.find(item => item.id === toDelete?.employeeId)?.name ?? ''}. سيتغير الراتب في الشهر المفتوح، وتبقى العملية موثقة في سجل العمليات.`} confirmLabel={`تأكيد حذف ${noun}`} />
  </div>;
}
