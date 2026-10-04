'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Banknote, CalendarCheck, Download, FileText, Gift, MinusCircle, Printer, UserRound, UserRoundX } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select } from '@/components/ui';
import { getMonthPayroll } from '@/lib/payroll';
import { isExpected, statusLabel } from '@/lib/attendance';
import { date, duration, money, monthLabel, time } from '@/lib/format';
import { DEMO_MONTH } from '@/lib/mock-data';
import type { CenterReport, ReportCell, ReportColumn, ReportSection } from '@/lib/report-export';
import type { AttendanceRecord, DemoData, PayrollResult } from '@/lib/types';
import { paymentLabels } from './payroll-breakdown';
import { monthSource } from './finance-data';
import styles from './finance.module.css';

const reportTypes = [
  { value: 'payroll', label: 'كشف رواتب الشهر', icon: Banknote },
  { value: 'attendance', label: 'كشف الحضور', icon: CalendarCheck },
  { value: 'absences', label: 'كشف الغيابات', icon: UserRoundX },
  { value: 'deductions', label: 'كشف الخصومات', icon: MinusCircle },
  { value: 'bonuses', label: 'كشف المكافآت', icon: Gift },
  { value: 'employee', label: 'تقرير موظف', icon: UserRound },
  { value: 'payslip', label: 'قسيمة راتب', icon: FileText },
] as const;
type ReportType = typeof reportTypes[number]['value'];
const moneyColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'money' });
const textColumn = (key: string, label: string): ReportColumn => ({ key, label });
const numberColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'number' });
const dateColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'date' });
const nativeDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

function payrollSection(results: PayrollResult[]): ReportSection {
  return { title: 'كشف الرواتب', columns: [textColumn('code', 'رقم الموظف'), textColumn('name', 'الموظف'), textColumn('department', 'القسم'), textColumn('mode', 'نوع الراتب'), numberColumn('required', 'الأيام المطلوبة'), numberColumn('attendance', 'حضور'), numberColumn('excused', 'بعذر'), numberColumn('unexcused', 'بدون عذر'), moneyColumn('base', 'الأساسي'), moneyColumn('absence', 'خصم الغياب'), moneyColumn('deductions', 'خصومات أخرى'), moneyColumn('bonuses', 'المكافآت'), moneyColumn('final', 'الصافي'), textColumn('payment', 'الصرف')], rows: results.map(item => ({ code: item.employeeCode, name: item.employeeName, department: item.departmentName, mode: item.salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي', required: item.requiredDays, attendance: item.attendanceDays, excused: item.excusedDays, unexcused: item.unexcusedDays, base: item.baseSalary, absence: item.excusedDeduction + item.unexcusedDeduction, deductions: item.otherDeductions, bonuses: item.bonuses, final: item.finalSalary, payment: paymentLabels[item.paymentStatus] })) };
}

function payslipSections(result: PayrollResult, data: DemoData): ReportSection[] {
  const summary: ReportSection = { title: 'تفاصيل الراتب', columns: [textColumn('label', 'البند'), moneyColumn('amount', 'المبلغ (د.ع)')], rows: [{ label: 'الراتب الأساسي', amount: result.baseSalary }, { label: `غياب بعذر (${result.excusedDays})`, amount: -result.excusedDeduction }, { label: `غياب بدون عذر (${result.unexcusedDays})`, amount: -result.unexcusedDeduction }, { label: 'خصومات أخرى', amount: -result.otherDeductions }, { label: 'المكافآت', amount: result.bonuses }, { label: 'صافي الراتب', amount: result.finalSalary }, { label: 'آخر مبلغ مصروف', amount: result.paidAmount }, { label: 'الفرق عن المصروف', amount: result.difference }] };
  const payments: ReportSection = { title: 'سجل الصرف', columns: [dateColumn('date', 'تاريخ الصرف'), moneyColumn('salary', 'الراتب وقت الصرف'), moneyColumn('amount', 'المبلغ المصروف'), textColumn('actor', 'بواسطة')], rows: data.payments.filter(item => item.employeeId === result.employeeId && item.month === result.month).map(item => ({ date: nativeDate(item.date), salary: item.salaryAtPayment, amount: item.amount, actor: item.paidBy })) };
  return [summary, payments];
}

export function ReportsPage() {
  const { data } = useDemo();
  const toast = useToast();
  const params = useSearchParams();
  const initialType = params.get('type');
  const initialMonth = params.get('month');
  const [type, setType] = useState<ReportType>(reportTypes.some(item => item.value === initialType) ? initialType as ReportType : 'payroll');
  const [month, setMonth] = useState(initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth) ? initialMonth : DEMO_MONTH);
  const [department, setDepartment] = useState('');
  const [employee, setEmployee] = useState(params.get('employee') ?? '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const monthEnd = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).toISOString().slice(0,10);
  const source = monthSource(data, month);
  const allResults = getMonthPayroll(data, month);
  const personReport = type === 'employee' || type === 'payslip';
  const filteredEmployees = source.employees.filter(item => !department || item.departmentId === department);
  const selectedEmployee = personReport ? employee || filteredEmployees[0]?.id || '' : employee;
  const selectedPerson = source.employees.find(item => item.id === selectedEmployee);
  const employeeIds = new Set(filteredEmployees.filter(item => !selectedEmployee || item.id === selectedEmployee).map(item => item.id));
  const results = allResults.filter(item => employeeIds.has(item.employeeId));
  const attendanceReport = type === 'attendance' || type === 'absences';
  const dateRangeAvailable = attendanceReport || type === 'deductions' || type === 'bonuses' || type === 'employee';
  const dateMatches = (value: string) => value.startsWith(month) && (!dateRangeAvailable || ((!from || value >= from) && (!to || value <= to)));
  const invalidRange = Boolean(dateRangeAvailable && from && to && from > to);
  const workdays = new Map(source.workdays.filter(item => dateMatches(item.date)).map(item => [item.id, item]));
  const recordedKeys = new Set(source.attendance.map(item => `${item.employeeId}:${item.workdayId}`));
  const missingRecords: AttendanceRecord[] = [];
  for (const workday of workdays.values()) {
    for (const person of source.employees) {
      if (employeeIds.has(person.id) && isExpected(person, workday) && !recordedKeys.has(`${person.id}:${workday.id}`)) missingRecords.push({ id: `pending-${workday.id}-${person.id}`, employeeId: person.id, workdayId: workday.id, status: 'UNRESOLVED', checkIn: null, latenessSeconds: 0, source: null, reason: 'بانتظار حسم حالة الحضور', updatedAt: `${workday.date}T00:00:00.000Z` });
    }
  }
  const records = [...source.attendance, ...missingRecords].filter(item => employeeIds.has(item.employeeId) && workdays.has(item.workdayId) && (!status || item.status === status) && (type !== 'absences' || item.status === 'EXCUSED' || item.status === 'UNEXCUSED' || item.status === 'UNRESOLVED')).sort((a, b) => (workdays.get(b.workdayId)?.date ?? '').localeCompare(workdays.get(a.workdayId)?.date ?? ''));
  const attendance: ReportSection = { title: type === 'absences' ? 'كشف الغيابات' : 'سجل الحضور', columns: [dateColumn('date', 'التاريخ'), textColumn('code', 'رقم الموظف'), textColumn('name', 'الموظف'), textColumn('department', 'القسم'), textColumn('status', 'الحالة'), textColumn('checkin', 'وقت الحضور'), textColumn('late', 'مدة التأخير'), textColumn('reason', 'السبب')], rows: records.map(item => { const person = source.employees.find(entry => entry.id === item.employeeId); return { date: nativeDate(workdays.get(item.workdayId)!.date), code: person?.code ?? '', name: person?.name ?? '', department: source.departments.find(entry => entry.id === person?.departmentId)?.name ?? '', status: statusLabel(item.status), checkin: item.checkIn ? time(item.checkIn) : '—', late: duration(item.latenessSeconds), reason: item.reason || '—' }; }) };
  const deductions: ReportSection = { title: 'كشف الخصومات', columns: [dateColumn('date', 'التاريخ'), textColumn('code', 'رقم الموظف'), textColumn('name', 'الموظف'), textColumn('type', 'نوع الخصم'), moneyColumn('amount', 'المبلغ'), textColumn('reason', 'السبب'), textColumn('actor', 'أضيف بواسطة')], rows: source.deductions.filter(item => employeeIds.has(item.employeeId) && dateMatches(item.date)).map(item => ({ date: nativeDate(item.date), code: source.employees.find(person => person.id === item.employeeId)?.code ?? '', name: source.employees.find(person => person.id === item.employeeId)?.name ?? '', type: item.type === 'أخرى' ? item.customType : item.type, amount: item.amount, reason: item.reason, actor: item.createdBy })) };
  const bonuses: ReportSection = { title: 'كشف المكافآت', columns: [dateColumn('date', 'التاريخ'), textColumn('code', 'رقم الموظف'), textColumn('name', 'الموظف'), moneyColumn('amount', 'المبلغ'), textColumn('reason', 'السبب'), textColumn('actor', 'أضيف بواسطة')], rows: source.bonuses.filter(item => employeeIds.has(item.employeeId) && dateMatches(item.date)).map(item => ({ date: nativeDate(item.date), code: source.employees.find(person => person.id === item.employeeId)?.code ?? '', name: source.employees.find(person => person.id === item.employeeId)?.name ?? '', amount: item.amount, reason: item.reason, actor: item.createdBy })) };
  const sections: ReportSection[] = type === 'payroll' ? [payrollSection(results)] : attendanceReport ? [attendance] : type === 'deductions' ? [deductions] : type === 'bonuses' ? [bonuses] : results[0] ? [...payslipSections(results[0], source), ...(type === 'employee' ? [attendance] : []), deductions, bonuses] : [];
  const report: CenterReport = { title: reportTypes.find(item => item.value === type)!.label, period: month, subtitle: personReport && selectedPerson ? `${selectedPerson.name} · ${selectedPerson.code} · ${results[0]?.departmentName ?? ''}` : `${department ? source.departments.find(item => item.id === department)?.name : 'جميع الأقسام'}${selectedPerson ? ` · ${selectedPerson.name}` : ''}`, sections: invalidRange ? [] : sections };
  const hasRows = report.sections.some(section => section.rows.length);
  async function exportExcel() {
    if(!hasRows) return;
    setExporting(true);
    try { const { exportReportExcel } = await import('@/lib/report-export'); await exportReportExcel(report); toast('تم تصدير Excel ببيانات منظمة وخلايا مالية رقمية.'); }
    catch { toast('تعذر إنشاء ملف Excel. حاول مرة أخرى.'); }
    finally { setExporting(false); }
  }
  const displayCell = (cell: ReportCell | undefined, column: ReportColumn) => cell instanceof Date ? date(cell.toISOString()) : typeof cell === 'number' ? column.type === 'money' ? money(cell) : String(cell) : cell ?? '—';

  return <div className={`page-stack ${styles.reportPage}`}><PageHeader title="التقارير" actions={<div className="inline"><Button variant="secondary" disabled={!hasRows || exporting} onClick={exportExcel} loading={exporting}><Download size={17} /> Excel</Button><Button disabled={!hasRows} onClick={() => window.print()}><Printer size={17} /> طباعة / حفظ PDF</Button></div>} />
    <div className={styles.reportTypes}>{reportTypes.map(item => <button key={item.value} aria-pressed={type === item.value} className={styles.reportType} onClick={() => { setType(item.value); setStatus(''); if (item.value === 'payroll' || item.value === 'payslip') { setFrom(''); setTo(''); } }}><item.icon /><span>{item.label}</span></button>)}</div>
    <Card title="تخصيص التقرير"><div className={styles.filterPanel}><Field label="الشهر"><Input type="month" value={month} onChange={e => { if(e.target.value) { setMonth(e.target.value); setFrom(''); setTo(''); } }} /></Field><Field label="القسم"><Select value={department} onChange={e => { setDepartment(e.target.value); setEmployee(''); }}><option value="">كل الأقسام</option>{source.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></Field><Field label="الموظف"><Select value={selectedEmployee} onChange={e => setEmployee(e.target.value)}>{!personReport && <option value="">كل الموظفين</option>}{personReport && !filteredEmployees.length && <option value="">لا يوجد موظفون</option>}{filteredEmployees.map(item => <option value={item.id} key={item.id}>{item.name} — {item.code}</option>)}</Select></Field>{dateRangeAvailable && <><Field label="من تاريخ"><Input type="date" value={from} min={`${month}-01`} max={monthEnd} onChange={e => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><Input type="date" value={to} min={`${month}-01`} max={monthEnd} onChange={e => setTo(e.target.value)} /></Field></>}{attendanceReport && <Field label="حالة الحضور"><Select value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option>{(type === 'absences' ? ['EXCUSED', 'UNEXCUSED', 'UNRESOLVED'] : ['PRESENT', 'EXCUSED', 'UNEXCUSED', 'EXEMPT', 'UNRESOLVED']).map(value => <option key={value} value={value}>{statusLabel(value as Parameters<typeof statusLabel>[0])}</option>)}</Select></Field>}</div>{invalidRange && <p role="alert" className="text-danger">يجب أن يكون تاريخ البداية قبل تاريخ النهاية.</p>}</Card>
    <div className="notice">لحفظ PDF: افتح «طباعة / حفظ PDF» ثم اختر «حفظ كملف PDF». التقرير مهيأ للطباعة على A4، وجميع بيانات هذه النسخة تجريبية.</div>
    <article className={styles.report} aria-label="معاينة التقرير"><header className={styles.reportHeader}><div><Image className={styles.reportLogo} src="/brand/logo.svg" width={175} height={51} alt="CenterPro" unoptimized priority /><h2>{report.title}</h2><div className="muted">{report.subtitle}</div></div><div className="stack"><strong>{monthLabel(month)}</strong><span className={styles.reportsPreviewOnly}>بيانات تجريبية للمعاينة — غير معتمدة مالياً</span><Badge tone={data.months.find(item => item.month === month)?.state === 'ARCHIVED' ? 'success' : 'neutral'}>{data.months.find(item => item.month === month)?.state === 'ARCHIVED' ? 'نسخة أرشيفية ثابتة' : 'نسخة للمراجعة'}</Badge></div></header>
    {dateRangeAvailable && (from || to) && <p className={styles.small}>الفترة: {from ? date(from) : 'بداية الشهر'} — {to ? date(to) : 'نهاية الشهر'}</p>}
    {personReport && results[0] && <div className={styles.compactMetrics}><div><span>الأيام المطلوبة</span><strong>{results[0].requiredDays}</strong></div><div><span>أيام الحضور</span><strong>{results[0].attendanceDays}</strong></div><div><span>نوع الراتب</span><strong style={{ fontFamily: 'inherit', fontSize: 14 }}>{results[0].salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</strong></div><div><span>حالة الصرف</span><strong style={{ fontFamily: 'inherit', fontSize: 14 }}>{paymentLabels[results[0].paymentStatus]}</strong></div></div>}
    {!hasRows ? <EmptyState title={!data.employees.length ? "لا توجد بيانات للتقارير حتى الآن." : "لا توجد بيانات لهذا التقرير"} description={!data.employees.length ? "أضف أقسام المركز وفريقك للبدء. ستصبح كشوف الرواتب والحضور والتقارير متاحة بعد تسجيل بياناتها." : "غيّر الفترة أو الفلاتر لإظهار النتائج."} action={!data.employees.length ? <Link className="button-link" href={data.departments.length ? "/employees?add=1" : "/departments"}>{data.departments.length ? "إضافة أول موظف" : "إضافة أول قسم"}</Link> : undefined} /> : report.sections.map(section => <section key={section.title} className={styles.reportSection}><h3 style={{ fontSize: 14 }}>{section.title}</h3>{section.rows.length ? <div className={styles.reportScroll} role="region" aria-label={section.title} tabIndex={0}><table className={styles.reportTable}><thead><tr>{section.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.map((row, index) => <tr key={index}>{section.columns.map(column => <td className={column.type === 'money' || column.type === 'number' ? 'amount' : ''} key={column.key}>{column.type === 'money' || column.type === 'number' ? <bdi dir="ltr">{displayCell(row[column.key], column)}</bdi> : displayCell(row[column.key], column)}</td>)}</tr>)}</tbody></table></div> : <p className={styles.small}>لا توجد سجلات في هذا القسم.</p>}</section>)}
    {type === 'payroll' && hasRows && <div className={`${styles.breakdownRow} ${styles.reportTotal}`}><strong>إجمالي صافي الرواتب</strong><strong className="amount"><bdi dir="ltr">{money(results.reduce((sum, item) => sum + item.finalSalary, 0))}</bdi></strong></div>}
    <footer className={styles.reportFooter}><span>CenterPro · {data.settings.centerName}</span><span>بيانات محاكاة لغرض مراجعة الواجهات فقط</span></footer></article>
  </div>;
}
