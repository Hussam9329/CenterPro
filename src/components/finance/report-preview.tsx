import Image from 'next/image';
import Link from 'next/link';
import { Badge, EmptyState } from '@/components/ui';
import { date, money, monthLabel } from '@/lib/format';
import type { ReportCell, ReportColumn } from '@/lib/report-export';
import type { DemoData } from '@/lib/types';
import type { FinanceReportModel, ReportFilters } from '@/lib/finance/reports';
import { paymentLabels } from '@/lib/finance/payment-status';
import styles from './finance.module.css';

function displayCell(cell: ReportCell | undefined, column: ReportColumn) {
  return cell instanceof Date ? date(cell.toISOString()) : typeof cell === 'number' ? column.type === 'money' ? money(cell) : String(cell) : cell ?? '—';
}

interface FinanceReportPreviewProps {
  data: DemoData;
  backend: string;
  model: FinanceReportModel;
  filters: Pick<ReportFilters, 'type' | 'month' | 'from' | 'to'>;
}

export function FinanceReportPreview({ data, backend, model, filters }: FinanceReportPreviewProps) {
  const { report, dateRangeAvailable, personReport, results, hasRows } = model;
  const { type, month, from, to } = filters;
  return (
    <article className={styles.report} aria-label="معاينة التقرير"><header className={styles.reportHeader}><div><Image className={styles.reportLogo} src="/brand/logo.svg" width={175} height={51} alt="CenterPro" unoptimized priority /><h2>{report.title}</h2><div className="muted">{report.subtitle}</div></div><div className="stack"><strong>{monthLabel(month)}</strong>{backend !== 'neon' && <span className={styles.reportsPreviewOnly}>بيانات تجريبية للمعاينة — غير معتمدة مالياً</span>}<Badge tone={data.months.find(item => item.month === month)?.state === 'ARCHIVED' ? 'success' : 'neutral'}>{data.months.find(item => item.month === month)?.state === 'ARCHIVED' ? 'نسخة أرشيفية ثابتة' : 'نسخة للمراجعة'}</Badge></div></header>
    {dateRangeAvailable && (from || to) && <p className={styles.small}>الفترة: {from ? date(from) : 'بداية الشهر'} — {to ? date(to) : 'نهاية الشهر'}</p>}
    {personReport && results[0] && <div className={styles.compactMetrics}><div><span>الأيام المطلوبة</span><strong>{results[0].requiredDays}</strong></div><div><span>أيام الحضور</span><strong>{results[0].attendanceDays}</strong></div><div><span>نوع الراتب</span><strong style={{ fontFamily: 'inherit', fontSize: 14 }}>{results[0].salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</strong></div><div><span>حالة الصرف</span><strong style={{ fontFamily: 'inherit', fontSize: 14 }}>{paymentLabels[results[0].paymentStatus]}</strong></div></div>}
    {!hasRows ? <EmptyState title={!data.employees.length ? "لا توجد بيانات للتقارير حتى الآن." : "لا توجد بيانات لهذا التقرير"} description={!data.employees.length ? "أضف أقسام المركز وفريقك للبدء. ستصبح كشوف الرواتب والحضور والتقارير متاحة بعد تسجيل بياناتها." : "غيّر الفترة أو الفلاتر لإظهار النتائج."} action={!data.employees.length ? <Link className="button-link" href={data.departments.length ? "/employees?add=1" : "/departments"}>{data.departments.length ? "إضافة أول موظف" : "إضافة أول قسم"}</Link> : undefined} /> : report.sections.map(section => <section key={section.title} className={styles.reportSection}><h3 style={{ fontSize: 14 }}>{section.title}</h3>{section.rows.length ? <div className={styles.reportScroll} role="region" aria-label={section.title} tabIndex={0}><table className={styles.reportTable}><thead><tr>{section.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.map((row, index) => <tr key={index}>{section.columns.map(column => <td className={column.type === 'money' || column.type === 'number' ? 'amount' : ''} key={column.key}>{column.type === 'money' || column.type === 'number' ? <bdi dir="ltr">{displayCell(row[column.key], column)}</bdi> : displayCell(row[column.key], column)}</td>)}</tr>)}</tbody></table></div> : <p className={styles.small}>لا توجد سجلات في هذا القسم.</p>}</section>)}
    {type === 'payroll' && hasRows && <div className={`${styles.breakdownRow} ${styles.reportTotal}`}><strong>إجمالي صافي الرواتب</strong><strong className="amount"><bdi dir="ltr">{money(results.reduce((sum, item) => sum + item.finalSalary, 0))}</bdi></strong></div>}
    <footer className={styles.reportFooter}><span>CenterPro · {data.settings.centerName}</span><span>{backend === 'neon' ? 'تقرير من السجلات المحفوظة' : 'بيانات محاكاة لغرض مراجعة الواجهات فقط'}</span></footer></article>
  );
}
