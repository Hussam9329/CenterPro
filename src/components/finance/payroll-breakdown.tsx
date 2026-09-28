'use client';

import type { DemoData, PayrollResult } from '@/lib/types';
import { Badge, Card, EmptyState } from '@/components/ui';
import { date, duration, money, monthLabel } from '@/lib/format';
import { CircleAlert, CircleCheck } from 'lucide-react';
import styles from './finance.module.css';

export const paymentLabels = { UNPAID: 'غير مصروف', PAID: 'تم الصرف', REVIEW: 'يحتاج مراجعة' } as const;
export function PaymentBadge({ status }: { status: PayrollResult['paymentStatus'] }) {
  return <Badge tone={status === 'PAID' ? 'success' : status === 'REVIEW' ? 'warning' : 'neutral'}>{paymentLabels[status]}</Badge>;
}

export function PayrollBreakdown({ result, data, details = true }: { result: PayrollResult; data: DemoData; details?: boolean }) {
  const deductions = data.deductions.filter(item => item.employeeId === result.employeeId && item.date.startsWith(result.month));
  const bonuses = data.bonuses.filter(item => item.employeeId === result.employeeId && item.date.startsWith(result.month));
  const payments = data.payments.filter(item => item.employeeId === result.employeeId && item.month === result.month).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = [
    ['الراتب الأساسي', result.baseSalary],
    [`غياب بعذر · ${result.excusedDays} يوم`, -result.excusedDeduction],
    [`غياب بدون عذر · ${result.unexcusedDays} يوم`, -result.unexcusedDeduction],
    ['خصومات أخرى', -result.otherDeductions],
    ['المكافآت', result.bonuses],
    ['صافي الراتب', result.finalSalary],
  ] as const;
  return <div className="stack">
    <div className={styles.summary}>
      <div><p className="muted">صافي راتب {monthLabel(result.month)}</p><div className={`${styles.heroAmount} ${result.finalSalary < 0 ? styles.amountNegative : ''}`}>{money(result.finalSalary)}</div></div>
      <div className="stack"><PaymentBadge status={result.paymentStatus} /><Badge tone="brand">{result.salaryMode === 'FIXED' ? 'راتب قطعي' : 'نظام شرائح'}{result.partialMonth ? ' · شهر جزئي' : ''}</Badge></div>
    </div>
    {result.paymentStatus === 'REVIEW' && <div className={styles.review}><h3>تغيّر الراتب بعد الصرف — يحتاج مراجعة</h3><div className="detail-grid"><div>المصروف سابقاً <strong className="amount">{money(result.paidAmount)}</strong></div><div>الراتب الحالي <strong className="amount">{money(result.finalSalary)}</strong></div><div>الفرق <strong className="amount">{money(result.difference)}</strong></div></div><p className={styles.small}>سجل الصرف السابق محفوظ كما هو.</p></div>}
    {result.unresolvedDays > 0 && <div className="notice notice-warning"><CircleAlert size={17} /> توجد {result.unresolvedDays} حالة حضور غير محسومة. الراتب تقديري لحين مراجعتها.</div>}
    <div className="grid-2">
      <Card title="تفاصيل الاحتساب"><div className={styles.breakdown}>{items.map(([label, amount]) => <div className={styles.breakdownRow} key={label}><span>{label}</span><strong className={`amount ${amount < 0 ? styles.amountNegative : ''}`}>{amount > 0 && label === 'المكافآت' ? '+' : ''}{money(amount)}</strong></div>)}</div></Card>
      <Card title="الحضور وقواعد الراتب"><div className={styles.compactMetrics}><div><span>أيام الحضور</span><strong>{result.attendanceDays}</strong></div><div><span>أيام الاستثناء</span><strong>{result.exemptDays}</strong></div><div><span>مرات التأخير</span><strong>{result.lateDays}</strong></div></div><div className={styles.breakdown}><div className={styles.breakdownRow}><span>قيمة اليومية</span><span className="amount">{money(result.dailyRate)}</span></div><div className={styles.breakdownRow}><span>خصم الغياب بدون عذر / يوم</span><span className="amount">{money(result.salaryConfig.unexcusedRate)}</span></div><div className={styles.breakdownRow}><span>إجمالي التأخير</span><span>{duration(result.latenessSeconds)}</span></div></div><p className={styles.small}>التأخير للمراجعة فقط ولا يخصم تلقائياً من الراتب.</p><details className={styles.salaryRules}><summary>عرض قواعد الراتب المستخدمة</summary>{result.salaryMode === 'FIXED' ? <p>الراتب القطعي الكامل: <strong className="amount">{money(result.salaryConfig.fixedSalary)}</strong></p> : <div className={styles.breakdown}>{result.salaryConfig.tiers.map(tier => <div className={styles.breakdownRow} key={tier.id}><span>{tier.fromDays}–{tier.toDays} يوم</span><span>{tier.type === 'PER_DAY' ? 'الحضور × اليومية' : money(tier.amount)}</span></div>)}<div className={styles.breakdownRow}><span>الأيام الإضافية من اليوم {result.salaryConfig.extraDaysStart}</span><span className="amount">+{money(result.dailyRate)} / يوم</span></div><div className={styles.breakdownRow}><span>الحد الأعلى للأساسي</span><strong className="amount">{money(result.salaryConfig.maximum)}</strong></div></div>}</details>{result.partialMonth && result.salaryMode === 'FIXED' && <p className={styles.small}>شهر مباشرة أو انتهاء خدمة جزئي: الحضور × اليومية، بحد أقصى الراتب القطعي.</p>}</Card>
    </div>
    {details && <div className="grid-2"><Card title="الخصومات وأسبابها">{deductions.length ? deductions.map(item => <div key={item.id} className={styles.record}><div className={styles.recordHead}><Badge tone="danger">{item.type === 'أخرى' ? item.customType : item.type}</Badge><strong className="amount text-danger">−{money(item.amount)}</strong></div><p>{item.reason}</p><small>{date(item.date)}</small></div>) : <EmptyState title="لا توجد خصومات لهذا الشهر" />}</Card><Card title="المكافآت وأسبابها">{bonuses.length ? bonuses.map(item => <div key={item.id} className={styles.record}><div className={styles.recordHead}><span>مكافأة</span><strong className="amount">+{money(item.amount)}</strong></div><p>{item.reason}</p><small>{date(item.date)}</small></div>) : <EmptyState title="لا توجد مكافآت لهذا الشهر" />}</Card></div>}
    <Card title="سجل الصرف" description="يبقى الراتب وقت الصرف والمبلغ المصروف محفوظين مع كل عملية.">{payments.length ? payments.map(item => <div key={item.id} className={styles.record}><div className={styles.recordHead}><span className="inline"><CircleCheck size={17} /> {date(item.date)}</span><strong className="amount">{money(item.amount)}</strong></div><small>الراتب وقت الصرف: {money(item.salaryAtPayment)} · بواسطة: {item.paidBy}</small></div>) : <EmptyState title="لم يُصرف راتب هذا الشهر بعد" />}</Card>
  </div>;
}
