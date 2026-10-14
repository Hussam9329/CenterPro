'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, Banknote, Calculator, CircleAlert, FileText, LockKeyhole, Wallet } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Badge, Button, Card, EmptyState, Input, PageHeader, SearchInput, Select, StatCard } from '@/components/ui';
import { getMonthPayroll, recalculateReopenedPayroll } from '@/lib/payroll';
import { date, money, monthLabel } from '@/lib/format';
import type { Payment, PayrollMonth, PayrollResult } from '@/lib/types';
import { paymentLabels } from '@/lib/finance/payment-status';
import { PayrollRecords } from './payroll-records';
import { PayrollDetailsDialog, PayrollPaymentDialog, PayrollMonthDialog, type PayrollMonthAction } from './payroll-dialogs';
import { captureMonthSource, monthSource } from '@/lib/finance/month-source';
import styles from './finance.module.css';

export function PayrollPage() {
  const { data, session, updateData, today, month: currentMonth } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<PayrollResult | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentError, setPaymentError] = useState('');
  const [action, setAction] = useState<PayrollMonthAction | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const period = data.months.find(item => item.month === month);
  const monthState = period?.state ?? 'OPEN';
  const results = getMonthPayroll(data, month);
  const filtered = results.filter(item => (!query || `${item.employeeName} ${item.employeeCode}`.toLowerCase().includes(query.toLowerCase())) && (!department || item.departmentName === department) && (!status || item.paymentStatus === status) && (!mode || item.salaryMode === mode));
  const pageSize = 8;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = results.find(item => item.employeeId === selectedId);
  const unresolved = results.reduce((sum, item) => sum + item.unresolvedDays, 0);
  const total = results.reduce((sum, item) => sum + item.finalSalary, 0);
  const source = monthSource(data, month);
  const liveSource = monthState === 'REOPENED' ? captureMonthSource(data, month) : null;
  const pendingHistoricalEdits = Boolean(liveSource && period?.sourceSnapshot && (['attendance', 'workdays', 'deductions', 'bonuses'] as const).some(key => JSON.stringify(liveSource[key]) !== JSON.stringify(period.sourceSnapshot![key])));

  function beginAction(next: typeof action) { setAction(next); setConfirmText(''); }
  async function performMonthAction() {
    if (!action || confirmText !== month || !session || session.role === 'EMPLOYEE' || results.length === 0) return;
    if ((action === 'reopen' || action === 'recalculate' || monthState === 'REOPENED') && session.role !== 'SUPER_ADMIN') return;
    if (action === 'archive' && unresolved > 0) { toast('احسم جميع حالات الحضور قبل الأرشفة.'); return; }
    if (action === 'archive' && pendingHistoricalEdits) { toast('نفّذ إعادة الاحتساب الصريحة لمراجعة التعديلات قبل إعادة الأرشفة.'); return; }
    try {
      const oldValues = period ? { ...structuredClone(period) } : { month, state: 'OPEN' };
      const target: PayrollMonth = period ? structuredClone(period) : { id: crypto.randomUUID(), month, state: 'OPEN', snapshots: {} };
      if (action === 'archive') {
        target.snapshots = Object.fromEntries(getMonthPayroll(data, month).map(item => [item.employeeId, structuredClone(item)]));
        if (target.state === 'OPEN') target.sourceSnapshot = captureMonthSource(data, month);
        target.state = 'ARCHIVED'; target.archivedAt = new Date().toISOString();
      } else if (action === 'reopen') target.state = 'REOPENED';
      else {
        target.snapshots = Object.fromEntries(Object.keys(target.snapshots).map(id => [id, recalculateReopenedPayroll(data, id, month)]));
        const refreshedSource = captureMonthSource(data, month);
        target.sourceSnapshot = target.sourceSnapshot ? { ...refreshedSource, employees: target.sourceSnapshot.employees, departments: target.sourceSnapshot.departments } : refreshedSource;
      }
      if (!await mutate(() => updateData(draft => {
        const index = draft.months.findIndex(item => item.month === month);
        if (index >= 0) draft.months[index] = target; else draft.months.push(target);
      }, { action: action === 'archive' ? 'أرشفة رواتب الشهر' : action === 'reopen' ? 'إعادة فتح شهر مؤرشف' : 'إعادة احتساب صريحة لشهر معاد فتحه', entity: 'رواتب الشهر', entityId: month, oldValues, newValues: { ...target, explicitRecalculation: action === 'recalculate' } }))) return;
      toast(action === 'archive' ? 'تم تثبيت نسخة أرشيفية كاملة.' : action === 'reopen' ? 'تمت إعادة فتح الشهر مع الحفاظ على الإعدادات المؤرشفة.' : 'أعيد احتساب الشهر صراحةً وفق القواعد المؤرشفة.');
      setAction(null);
    } catch (failure) { toast(failure instanceof Error ? failure.message : 'تعذر حفظ تعديل الشهر.'); }
  }
  function beginPayment(item: PayrollResult) { setPaymentFor(item); setPaymentAmount(String(Math.max(0, item.finalSalary))); setPaymentDate(today); setPaymentError(''); }
  async function savePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentFor || !session || session.role === 'EMPLOYEE') return;
    const current = getMonthPayroll(data, month).find(item => item.employeeId === paymentFor.employeeId);
    const amount = Number(paymentAmount);
    if (!current || !Number.isSafeInteger(amount) || amount < 0 || !paymentDate) { setPaymentError('أدخل مبلغاً صحيحاً غير سالب وتاريخ صرف صالحاً.'); return; }
    const payment: Payment = { id: crypto.randomUUID(), employeeId: current.employeeId, month, salaryAtPayment: current.finalSalary, amount, date: paymentDate, paidBy: session.name, createdAt: new Date().toISOString() };
    if (!await mutate(() => updateData(draft => { draft.payments.push(payment); }, { action: 'تسجيل صرف راتب', entity: 'صرف راتب', entityId: payment.id, employeeId: payment.employeeId, oldValues: { paymentStatus: current.paymentStatus }, newValues: { ...payment } }), setPaymentError)) return;
    toast('تم تسجيل الصرف وحفظ سجل العملية.'); setPaymentFor(null);
  }

  return <div className="page-stack">
    <PageHeader title="الرواتب" actions={<Link href={`/reports?type=payroll&month=${month}`} className="button-link"><FileText size={17} /> كشف الرواتب</Link>} />
    <div className="toolbar"><div className="inline"><Input aria-label="شهر الرواتب" type="month" className={styles.monthField} value={month} onChange={event => { if(event.target.value) { setMonth(event.target.value); setPage(1); setSelectedId(null); } }} /><Badge tone={monthState === 'ARCHIVED' ? 'success' : monthState === 'REOPENED' ? 'warning' : 'brand'}>{!results.length && !period ? 'لا توجد بيانات' : monthState === 'ARCHIVED' ? 'مؤرشف' : monthState === 'REOPENED' ? 'معاد فتحه' : 'شهر مفتوح'}</Badge></div><div className="inline">{period && session?.role === 'SUPER_ADMIN' && <SafeDeleteButton collection="months" id={period.id} label={`أرشيف رواتب ${period.month}`} compact />}{monthState !== 'ARCHIVED' ? <Button variant="secondary" disabled={results.length === 0 || (monthState === 'REOPENED' && session?.role !== 'SUPER_ADMIN')} onClick={() => beginAction('archive')}><Archive size={17} /> إغلاق وأرشفة الشهر</Button> : session?.role === 'SUPER_ADMIN' ? <Button variant="secondary" onClick={() => beginAction('reopen')}><ArchiveRestore size={17} /> إعادة فتح للتعديل</Button> : <span className="muted inline"><LockKeyhole size={16} /> إعادة الفتح للمشرف العام فقط</span>}</div></div>
    {monthState === 'REOPENED' && <div className="notice notice-warning"><CircleAlert size={20} /><div><strong>هذا الشهر مؤرشف سابقاً وتمت إعادة فتحه للتعديل.</strong><p>القيم والقواعد التاريخية محفوظة. أي تعديل على السجلات لا يغيّر الراتب المعروض حتى إعادة الاحتساب الصريحة بواسطة المشرف العام.</p>{pendingHistoricalEdits && <p><strong>توجد تعديلات على السجلات تنتظر إعادة الاحتساب.</strong></p>}{session?.role === 'SUPER_ADMIN' && <Button variant="secondary" onClick={() => beginAction('recalculate')}><Calculator size={16} /> إعادة الاحتساب بالقواعد المؤرشفة</Button>}</div></div>}
    {monthState === 'ARCHIVED' && <div className="notice"><LockKeyhole size={18} /><span>نسخة ثابتة{period?.archivedAt ? ` — أُرشفت في ${date(period.archivedAt)}` : ''}. تغييرات إعدادات الأقسام لا تؤثر في هذا الشهر.</span></div>}
    <div className="stats-grid"><StatCard label="صافي رواتب الشهر" value={money(total)} icon={<Wallet size={20} />} accent /><StatCard label="رواتب غير مصروفة" value={String(results.filter(item => item.paymentStatus === 'UNPAID').length)} icon={<Banknote size={20} />} /><StatCard label="تحتاج مراجعة" value={String(results.filter(item => item.paymentStatus === 'REVIEW').length)} icon={<CircleAlert size={20} />} /><StatCard label="حضور غير محسوم" value={String(unresolved)} icon={<Calculator size={20} />} /></div>
    <Card title={`كشف ${monthLabel(month)}`} description={`${filtered.length} موظف في النتائج`}><div className="filter-row"><SearchInput value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="اسم الموظف أو رقمه" /><Select aria-label="القسم" value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}><option value="">كل الأقسام</option>{Array.from(new Set(results.map(item => item.departmentName))).map(name => <option key={name}>{name}</option>)}</Select><Select aria-label="حالة الصرف" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">كل حالات الصرف</option>{Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Select aria-label="نوع الراتب" value={mode} onChange={e => { setMode(e.target.value); setPage(1); }}><option value="">جميع الأنواع</option><option value="TIERED">غير قطعي</option><option value="FIXED">قطعي</option></Select></div>
      {!filtered.length ? <EmptyState title={!data.employees.length ? "لا توجد بيانات رواتب حتى الآن." : !results.length ? "لا توجد رواتب لهذا الشهر." : "لا توجد رواتب تطابق اختياراتك"} description={!data.employees.length ? "ابدأ بإضافة فريقك وتحديد قوانين القسم. ستظهر كشوف الموظفين هنا مع تفاصيل الاحتساب." : "جرّب شهراً آخر أو غيّر خيارات البحث."} action={!data.employees.length ? <Link className="button-link" href={data.departments.length ? "/employees?add=1" : "/departments"}>{data.departments.length ? "إضافة أول موظف" : "إضافة أول قسم"}</Link> : undefined} /> : <><PayrollRecords visible={visible} page={page} total={filtered.length} pageSize={pageSize} onPageChange={setPage} onSelect={setSelectedId} onPayment={beginPayment} /></>}
    </Card>
    <PayrollDetailsDialog selected={selected} source={source} month={month} onClose={() => setSelectedId(null)} onPayment={beginPayment} />
    <PayrollPaymentDialog paymentFor={paymentFor} month={month} pending={pending} paymentAmount={paymentAmount} paymentDate={paymentDate} paymentError={paymentError} onAmountChange={setPaymentAmount} onDateChange={setPaymentDate} onClose={() => setPaymentFor(null)} onSubmit={savePayment} />
    <PayrollMonthDialog action={action} month={month} pending={pending} pendingHistoricalEdits={pendingHistoricalEdits} unresolved={unresolved} total={total} employeeCount={results.length} confirmText={confirmText} onConfirmTextChange={setConfirmText} onClose={() => setAction(null)} onConfirm={performMonthAction} />

  </div>;
}
