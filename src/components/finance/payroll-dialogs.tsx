import Link from 'next/link';
import { Banknote, CircleAlert, FileText } from 'lucide-react';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { money, monthLabel } from '@/lib/format';
import type { DemoData, PayrollResult } from '@/lib/types';
import { PayrollBreakdown } from './payroll-breakdown';
import styles from './finance.module.css';

export type PayrollMonthAction = 'archive' | 'reopen' | 'recalculate';

interface PayrollDetailsDialogProps {
  selected: PayrollResult | undefined;
  source: DemoData;
  month: string;
  onClose: () => void;
  onPayment: (result: PayrollResult) => void;
  canPayment: boolean;
}

export function PayrollDetailsDialog({ selected, source, month, onClose, onPayment, canPayment }: PayrollDetailsDialogProps) {
  return (
    <Dialog open={Boolean(selected)} onClose={onClose} title={selected?.employeeName ?? 'تفاصيل الراتب'} description={selected ? `${selected.employeeCode} · ${selected.departmentName}` : ''} wide>{selected && <><PayrollBreakdown result={selected} data={source} /><div className="form-actions"><Link href={`/reports?type=payslip&employee=${selected.employeeId}&month=${month}`} className="button-link"><FileText size={16} /> قسيمة راتب</Link>{canPayment && <Button onClick={() => onPayment(selected)}><Banknote size={17} />{selected.paymentStatus === 'UNPAID' ? 'تسجيل صرف الراتب' : 'تسجيل عملية صرف جديدة'}</Button>}</div></>}</Dialog>
  );
}

interface PayrollPaymentDialogProps {
  paymentFor: PayrollResult | null;
  month: string;
  pending: boolean;
  paymentAmount: string;
  paymentDate: string;
  paymentError: string;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}

export function PayrollPaymentDialog({ paymentFor, month, pending, paymentAmount, paymentDate, paymentError, onAmountChange, onDateChange, onClose, onSubmit }: PayrollPaymentDialogProps) {
  return (
    <Dialog open={Boolean(paymentFor)} onClose={() => { if (!pending) onClose(); }} title="تسجيل صرف الراتب" description={`${paymentFor?.employeeName ?? ''} · ${monthLabel(month)}`}><form onSubmit={onSubmit} className="stack"><div className={styles.confirmDetails}><div><span>صافي الراتب الحالي</span><strong className="amount"><bdi dir="ltr">{money(paymentFor?.finalSalary ?? 0)}</bdi></strong></div>{paymentFor && paymentFor.paymentStatus !== 'UNPAID' && <div><span>آخر مبلغ مصروف</span><strong className="amount"><bdi dir="ltr">{money(paymentFor.paidAmount)}</bdi></strong></div>}</div>{paymentFor && paymentFor.paymentStatus !== 'UNPAID' && <div className="notice notice-warning">ستُضاف عملية جديدة إلى سجل الصرف. العملية السابقة تبقى محفوظة، وهذا ليس تعديلاً عليها.</div>}<Field label="المبلغ المصروف (د.ع)" required><Input type="number" min="0" step="1" required value={paymentAmount} onChange={e => onAmountChange(e.target.value)} /></Field><Field label="تاريخ الصرف" required><Input type="date" required value={paymentDate} onChange={e => onDateChange(e.target.value)} /></Field>{paymentError && <p role="alert" className="text-danger">{paymentError}</p>}<div className="form-actions"><Button disabled={pending} variant="secondary" type="button" onClick={onClose}>إلغاء</Button><Button loading={pending} type="submit">تأكيد تسجيل الصرف</Button></div></form></Dialog>
  );
}

interface PayrollMonthDialogProps {
  action: PayrollMonthAction | null;
  month: string;
  pending: boolean;
  pendingHistoricalEdits: boolean;
  unresolved: number;
  total: number;
  employeeCount: number;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function PayrollMonthDialog({ action, month, pending, pendingHistoricalEdits, unresolved, total, employeeCount, confirmText, onConfirmTextChange, onClose, onConfirm }: PayrollMonthDialogProps) {
  return (
    <Dialog open={Boolean(action)} onClose={() => { if (!pending) onClose(); }} title={action === 'archive' ? 'إغلاق وأرشفة رواتب الشهر' : action === 'reopen' ? 'إعادة فتح الشهر للتعديل' : 'إعادة احتساب الشهر المؤرشف'} description={monthLabel(month)}><div className="stack"><div className="notice notice-warning"><CircleAlert size={20} /><span>{action === 'archive' ? 'سيتم تثبيت بيانات الرواتب والحضور والخصومات والمكافآت لهذا الشهر وإنشاء نسخة أرشيفية كاملة.' : action === 'reopen' ? 'ستصبح السجلات التاريخية قابلة للتعديل بإذن المشرف العام. تبقى الرواتب وقوانين القسم المؤرشفة كما هي حتى إعادة الاحتساب الصريحة.' : 'سيتم احتساب الحضور والخصومات والمكافآت المعدلة باستخدام قوانين القسم المؤرشفة، وتسجيل القيم السابقة والجديدة في سجل العمليات.'}</span></div><div className={styles.confirmDetails}><div><span>الشهر</span><strong>{monthLabel(month)}</strong></div><div><span>عدد الموظفين</span><strong>{employeeCount}</strong></div><div><span>الصافي الحالي</span><strong className="amount"><bdi dir="ltr">{money(total)}</bdi></strong></div></div>{action === 'archive' && pendingHistoricalEdits ? <div className="notice notice-warning">نفّذ إعادة الاحتساب الصريحة أولاً حتى تشمل النسخة الجديدة تعديلات السجلات.</div> : action === 'archive' && unresolved > 0 ? <div className="notice notice-warning">لا يمكن الأرشفة: توجد {unresolved} حالة غير محسومة. <Link href="/attendance">مراجعة الحضور</Link></div> : <Field label={`للتأكيد، اكتب ${month}`} required><Input value={confirmText} onChange={e => onConfirmTextChange(e.target.value)} dir="ltr" placeholder={month} autoComplete="off" /></Field>}<div className="form-actions"><Button disabled={pending} variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={pending} disabled={confirmText !== month || (action === 'archive' && (unresolved > 0 || pendingHistoricalEdits)) || employeeCount === 0} onClick={onConfirm}>{action === 'archive' ? 'تأكيد الأرشفة' : action === 'reopen' ? 'تأكيد إعادة الفتح' : 'تأكيد إعادة الاحتساب'}</Button></div></div></Dialog>
  );
}
