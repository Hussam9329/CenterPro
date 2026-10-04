'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, ArrowUpRight, Banknote, Calculator, CircleAlert, FileText, LockKeyhole, Wallet } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui';
import { getMonthPayroll, recalculateReopenedPayroll } from '@/lib/payroll';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import { date, money, monthLabel } from '@/lib/format';
import type { Payment, PayrollMonth, PayrollResult } from '@/lib/types';
import { PaymentBadge, paymentLabels, PayrollBreakdown } from '@/components/finance/payroll-breakdown';
import { captureMonthSource, monthSource } from '@/components/finance/finance-data';
import styles from '@/components/finance/finance.module.css';

export default function PayrollPage() {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const [month, setMonth] = useState(DEMO_MONTH);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<PayrollResult | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(DEMO_TODAY);
  const [paymentError, setPaymentError] = useState('');
  const [action, setAction] = useState<'archive' | 'reopen' | 'recalculate' | null>(null);
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
  function performMonthAction() {
    if (!action || confirmText !== month || !session || session.role === 'EMPLOYEE' || results.length === 0) return;
    if ((action === 'reopen' || action === 'recalculate' || monthState === 'REOPENED') && session.role !== 'SUPER_ADMIN') return;
    if (action === 'archive' && unresolved > 0) { toast('احسم جميع حالات الحضور قبل الأرشفة.'); return; }
    if (action === 'archive' && pendingHistoricalEdits) { toast('نفّذ إعادة الاحتساب الصريحة لمراجعة التعديلات قبل إعادة الأرشفة.'); return; }
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
    updateData(draft => {
      const index = draft.months.findIndex(item => item.month === month);
      if (index >= 0) draft.months[index] = target; else draft.months.push(target);
    }, { action: action === 'archive' ? 'أرشفة رواتب الشهر' : action === 'reopen' ? 'إعادة فتح شهر مؤرشف' : 'إعادة احتساب صريحة لشهر معاد فتحه', entity: 'رواتب الشهر', entityId: month, oldValues, newValues: { ...target, explicitRecalculation: action === 'recalculate' } });
    toast(action === 'archive' ? 'تم تثبيت نسخة أرشيفية كاملة في المعاينة.' : action === 'reopen' ? 'تمت إعادة فتح الشهر مع الحفاظ على الإعدادات المؤرشفة.' : 'أعيد احتساب الشهر صراحةً وفق القواعد المؤرشفة.');
    setAction(null);
  }
  function beginPayment(item: PayrollResult) { setPaymentFor(item); setPaymentAmount(String(Math.max(0, item.finalSalary))); setPaymentDate(DEMO_TODAY); setPaymentError(''); }
  function savePayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentFor || !session || session.role === 'EMPLOYEE') return;
    const current = getMonthPayroll(data, month).find(item => item.employeeId === paymentFor.employeeId);
    const amount = Number(paymentAmount);
    if (!current || !Number.isSafeInteger(amount) || amount < 0 || !paymentDate) { setPaymentError('أدخل مبلغاً صحيحاً غير سالب وتاريخ صرف صالحاً.'); return; }
    const payment: Payment = { id: crypto.randomUUID(), employeeId: current.employeeId, month, salaryAtPayment: current.finalSalary, amount, date: paymentDate, paidBy: session.name, createdAt: new Date().toISOString() };
    updateData(draft => { draft.payments.push(payment); }, { action: 'تسجيل صرف راتب', entity: 'صرف راتب', entityId: payment.id, employeeId: payment.employeeId, oldValues: { paymentStatus: current.paymentStatus }, newValues: { ...payment } });
    toast('تم تسجيل الصرف في المعاينة وحفظ سجل العملية.'); setPaymentFor(null);
  }

  return <div className="page-stack">
    <PageHeader title="الرواتب" actions={<Link href={`/reports?type=payroll&month=${month}`} className="button-link"><FileText size={17} /> كشف الرواتب</Link>} />
    <div className="toolbar"><div className="inline"><Input aria-label="شهر الرواتب" type="month" className={styles.monthField} value={month} onChange={event => { if(event.target.value) { setMonth(event.target.value); setPage(1); setSelectedId(null); } }} /><Badge tone={monthState === 'ARCHIVED' ? 'success' : monthState === 'REOPENED' ? 'warning' : 'brand'}>{!results.length && !period ? 'لا توجد بيانات' : monthState === 'ARCHIVED' ? 'مؤرشف' : monthState === 'REOPENED' ? 'معاد فتحه' : 'شهر مفتوح'}</Badge></div><div className="inline">{monthState !== 'ARCHIVED' ? <Button variant="secondary" disabled={results.length === 0 || (monthState === 'REOPENED' && session?.role !== 'SUPER_ADMIN')} onClick={() => beginAction('archive')}><Archive size={17} /> إغلاق وأرشفة الشهر</Button> : session?.role === 'SUPER_ADMIN' ? <Button variant="secondary" onClick={() => beginAction('reopen')}><ArchiveRestore size={17} /> إعادة فتح للتعديل</Button> : <span className="muted inline"><LockKeyhole size={16} /> إعادة الفتح للمشرف العام فقط</span>}</div></div>
    {monthState === 'REOPENED' && <div className="notice notice-warning"><CircleAlert size={20} /><div><strong>هذا الشهر مؤرشف سابقاً وتمت إعادة فتحه للتعديل.</strong><p>القيم والقواعد التاريخية محفوظة. أي تعديل على السجلات لا يغيّر الراتب المعروض حتى إعادة الاحتساب الصريحة بواسطة المشرف العام.</p>{pendingHistoricalEdits && <p><strong>توجد تعديلات على السجلات تنتظر إعادة الاحتساب.</strong></p>}{session?.role === 'SUPER_ADMIN' && <Button variant="secondary" onClick={() => beginAction('recalculate')}><Calculator size={16} /> إعادة الاحتساب بالقواعد المؤرشفة</Button>}</div></div>}
    {monthState === 'ARCHIVED' && <div className="notice"><LockKeyhole size={18} /><span>نسخة ثابتة{period?.archivedAt ? ` — أُرشفت في ${date(period.archivedAt)}` : ''}. تغييرات إعدادات الأقسام لا تؤثر في هذا الشهر.</span></div>}
    <div className="stats-grid"><StatCard label="صافي رواتب الشهر" value={money(total)} icon={<Wallet size={20} />} accent /><StatCard label="رواتب غير مصروفة" value={String(results.filter(item => item.paymentStatus === 'UNPAID').length)} icon={<Banknote size={20} />} /><StatCard label="تحتاج مراجعة" value={String(results.filter(item => item.paymentStatus === 'REVIEW').length)} icon={<CircleAlert size={20} />} /><StatCard label="حضور غير محسوم" value={String(unresolved)} icon={<Calculator size={20} />} /></div>
    <Card title={`كشف ${monthLabel(month)}`} description={`${filtered.length} موظف في النتائج`}><div className="filter-row"><SearchInput value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder="اسم الموظف أو رقمه" /><Select aria-label="القسم" value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}><option value="">كل الأقسام</option>{Array.from(new Set(results.map(item => item.departmentName))).map(name => <option key={name}>{name}</option>)}</Select><Select aria-label="حالة الصرف" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">كل حالات الصرف</option>{Object.entries(paymentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Select aria-label="نوع الراتب" value={mode} onChange={e => { setMode(e.target.value); setPage(1); }}><option value="">جميع الأنواع</option><option value="TIERED">غير قطعي</option><option value="FIXED">قطعي</option></Select></div>
      {!filtered.length ? <EmptyState title={!data.employees.length ? "لا توجد بيانات رواتب حتى الآن." : !results.length ? "لا توجد رواتب لهذا الشهر." : "لا توجد رواتب تطابق اختياراتك"} description={!data.employees.length ? "ابدأ بإضافة فريقك وتحديد قوانين القسم. ستظهر كشوف الموظفين هنا مع تفاصيل الاحتساب." : "جرّب شهراً آخر أو غيّر خيارات البحث."} action={!data.employees.length ? <Link className="button-link" href={data.departments.length ? "/employees?add=1" : "/departments"}>{data.departments.length ? "إضافة أول موظف" : "إضافة أول قسم"}</Link> : undefined} /> : <><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>القسم / نوع الراتب</th><th>مطلوب</th><th>حضور</th><th>غياب بعذر / بدونه</th><th>الأساسي</th><th>خصومات أخرى</th><th>مكافآت</th><th>الصافي</th><th>الصرف</th><th aria-label="الإجراءات" /></tr></thead><tbody>{visible.map(item => <tr key={item.employeeId}><td><button className={styles.rowName} onClick={() => setSelectedId(item.employeeId)}>{item.employeeName}<small>{item.employeeCode}</small></button></td><td>{item.departmentName}<div className={styles.small}>{item.salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</div></td><td>{item.requiredDays}</td><td>{item.attendanceDays}</td><td>{item.excusedDays} / {item.unexcusedDays}</td><td className="amount">{money(item.baseSalary)}</td><td className="amount">{money(item.otherDeductions)}</td><td className="amount">{money(item.bonuses)}</td><td className={`amount ${item.finalSalary < 0 ? 'text-danger' : ''}`}><strong>{money(item.finalSalary)}</strong></td><td><PaymentBadge status={item.paymentStatus} /></td><td><Button variant="ghost" onClick={() => setSelectedId(item.employeeId)} aria-label={`تفاصيل راتب ${item.employeeName}`}><ArrowUpRight size={17} /></Button></td></tr>)}</tbody></table></div><div className="mobile-cards">{visible.map(item => <Card key={item.employeeId}><div className={styles.recordHead}><button className={styles.rowName} onClick={() => setSelectedId(item.employeeId)}>{item.employeeName}<small>{item.employeeCode} · {item.departmentName}</small></button><PaymentBadge status={item.paymentStatus} /></div><div className={styles.compactMetrics}><div><span>المطلوب</span><strong>{item.requiredDays}</strong></div><div><span>الحضور</span><strong>{item.attendanceDays}</strong></div><div><span>بعذر</span><strong>{item.excusedDays}</strong></div><div><span>بدون عذر</span><strong>{item.unexcusedDays}</strong></div></div><div className={styles.recordHead}><span>صافي الراتب</span><strong className={`amount ${item.finalSalary < 0 ? 'text-danger' : ''}`}>{money(item.finalSalary)}</strong></div><div className={styles.cardActions}><Button variant="secondary" onClick={() => setSelectedId(item.employeeId)}>التفاصيل</Button><Button variant="ghost" onClick={() => beginPayment(item)}>{item.paymentStatus === 'UNPAID' ? 'تسجيل الصرف' : 'صرف جديد'}</Button></div></Card>)}</div><Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} /></>}
    </Card>
    <Dialog open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.employeeName ?? 'تفاصيل الراتب'} description={selected ? `${selected.employeeCode} · ${selected.departmentName}` : ''} wide>{selected && <><PayrollBreakdown result={selected} data={source} /><div className="form-actions"><Link href={`/reports?type=payslip&employee=${selected.employeeId}&month=${month}`} className="button-link"><FileText size={16} /> قسيمة راتب</Link><Button onClick={() => beginPayment(selected)}><Banknote size={17} />{selected.paymentStatus === 'UNPAID' ? 'تسجيل صرف الراتب' : 'تسجيل عملية صرف جديدة'}</Button></div></>}</Dialog>
    <Dialog open={Boolean(paymentFor)} onClose={() => setPaymentFor(null)} title="تسجيل صرف الراتب" description={`${paymentFor?.employeeName ?? ''} · ${monthLabel(month)}`}><form onSubmit={savePayment} className="stack"><div className={styles.confirmDetails}><div><span>صافي الراتب الحالي</span><strong className="amount">{money(paymentFor?.finalSalary ?? 0)}</strong></div>{paymentFor && paymentFor.paymentStatus !== 'UNPAID' && <div><span>آخر مبلغ مصروف</span><strong className="amount">{money(paymentFor.paidAmount)}</strong></div>}</div>{paymentFor && paymentFor.paymentStatus !== 'UNPAID' && <div className="notice notice-warning">ستُضاف عملية جديدة إلى سجل الصرف. العملية السابقة تبقى محفوظة، وهذا ليس تعديلاً عليها.</div>}<Field label="المبلغ المصروف (د.ع)" required><Input type="number" min="0" step="1" required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></Field><Field label="تاريخ الصرف" required><Input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></Field>{paymentError && <p role="alert" className="text-danger">{paymentError}</p>}<div className="form-actions"><Button variant="secondary" type="button" onClick={() => setPaymentFor(null)}>إلغاء</Button><Button type="submit">تأكيد تسجيل الصرف</Button></div></form></Dialog>
    <Dialog open={Boolean(action)} onClose={() => setAction(null)} title={action === 'archive' ? 'إغلاق وأرشفة رواتب الشهر' : action === 'reopen' ? 'إعادة فتح الشهر للتعديل' : 'إعادة احتساب الشهر المؤرشف'} description={monthLabel(month)}><div className="stack"><div className="notice notice-warning"><CircleAlert size={20} /><span>{action === 'archive' ? 'سيتم تثبيت بيانات الرواتب والحضور والخصومات والمكافآت لهذا الشهر وإنشاء نسخة أرشيفية كاملة.' : action === 'reopen' ? 'ستصبح السجلات التاريخية قابلة للتعديل بإذن المشرف العام. تبقى الرواتب وقوانين القسم المؤرشفة كما هي حتى إعادة الاحتساب الصريحة.' : 'سيتم احتساب الحضور والخصومات والمكافآت المعدلة باستخدام قوانين القسم المؤرشفة، وتسجيل القيم السابقة والجديدة في سجل العمليات.'}</span></div><div className={styles.confirmDetails}><div><span>الشهر</span><strong>{monthLabel(month)}</strong></div><div><span>عدد الموظفين</span><strong>{results.length}</strong></div><div><span>الصافي الحالي</span><strong className="amount">{money(total)}</strong></div></div>{action === 'archive' && pendingHistoricalEdits ? <div className="notice notice-warning">نفّذ إعادة الاحتساب الصريحة أولاً حتى تشمل النسخة الجديدة تعديلات السجلات.</div> : action === 'archive' && unresolved > 0 ? <div className="notice notice-warning">لا يمكن الأرشفة: توجد {unresolved} حالة غير محسومة. <Link href="/attendance">مراجعة الحضور</Link></div> : <Field label={`للتأكيد، اكتب ${month}`} required><Input value={confirmText} onChange={e => setConfirmText(e.target.value)} dir="ltr" placeholder={month} autoComplete="off" /></Field>}<div className="form-actions"><Button variant="secondary" onClick={() => setAction(null)}>إلغاء</Button><Button disabled={confirmText !== month || (action === 'archive' && (unresolved > 0 || pendingHistoricalEdits)) || results.length === 0} onClick={performMonthAction}>{action === 'archive' ? 'تأكيد الأرشفة' : action === 'reopen' ? 'تأكيد إعادة الفتح' : 'تأكيد إعادة الاحتساب'}</Button></div></div></Dialog>
  </div>;
}
