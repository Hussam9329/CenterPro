'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Banknote, CalendarCheck, Download, FileText, Gift, MinusCircle, Printer, UserRound, UserRoundX } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { statusLabel } from '@/lib/attendance';
import { buildFinanceReport, reportLabels, type ReportType } from '@/lib/finance/reports';
import { FinanceReportPreview } from './report-preview';
import styles from './finance.module.css';

const reportTypes = [
  { value: 'payroll', label: reportLabels.payroll, icon: Banknote },
  { value: 'attendance', label: reportLabels.attendance, icon: CalendarCheck },
  { value: 'absences', label: reportLabels.absences, icon: UserRoundX },
  { value: 'deductions', label: reportLabels.deductions, icon: MinusCircle },
  { value: 'bonuses', label: reportLabels.bonuses, icon: Gift },
  { value: 'employee', label: reportLabels.employee, icon: UserRound },
  { value: 'payslip', label: reportLabels.payslip, icon: FileText },
] as const;
export function ReportsPage() {
  const { data, month: currentMonth, backend } = useDemo();
  const toast = useToast();
  const params = useSearchParams();
  const initialType = params.get('type');
  const initialMonth = params.get('month');
  const [type, setType] = useState<ReportType>(reportTypes.some(item => item.value === initialType) ? initialType as ReportType : 'payroll');
  const [month, setMonth] = useState(initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth) ? initialMonth : currentMonth);
  const [department, setDepartment] = useState('');
  const [employee, setEmployee] = useState(params.get('employee') ?? '');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const model = buildFinanceReport(data, { type, month, department, employee, status, from, to });
  const { monthEnd, source, personReport, filteredEmployees, selectedEmployee, attendanceReport, dateRangeAvailable, invalidRange, report, hasRows } = model;
  async function exportExcel() {
    if(!hasRows) return;
    setExporting(true);
    try { const { exportReportExcel } = await import('@/lib/report-export'); await exportReportExcel(report, { preview: backend !== 'neon' }); toast('تم تصدير Excel ببيانات منظمة وخلايا مالية رقمية.'); }
    catch { toast('تعذر إنشاء ملف Excel. حاول مرة أخرى.'); }
    finally { setExporting(false); }
  }

  return <div className={`page-stack ${styles.reportPage}`}><PageHeader title="التقارير" actions={<div className="inline"><Button variant="secondary" disabled={!hasRows || exporting} onClick={exportExcel} loading={exporting}><Download size={17} /> Excel</Button><Button disabled={!hasRows} onClick={() => window.print()}><Printer size={17} /> طباعة / حفظ PDF</Button></div>} />
    <div className={styles.reportTypes}>{reportTypes.map(item => <button key={item.value} aria-pressed={type === item.value} className={styles.reportType} onClick={() => { setType(item.value); setStatus(''); if (item.value === 'payroll' || item.value === 'payslip') { setFrom(''); setTo(''); } }}><item.icon /><span>{item.label}</span></button>)}</div>
    <Card title="تخصيص التقرير"><div className={styles.filterPanel}><Field label="الشهر"><Input type="month" value={month} onChange={e => { if(e.target.value) { setMonth(e.target.value); setFrom(''); setTo(''); } }} /></Field><Field label="القسم"><Select value={department} onChange={e => { setDepartment(e.target.value); setEmployee(''); }}><option value="">كل الأقسام</option>{source.departments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></Field><Field label="الموظف"><Select value={selectedEmployee} onChange={e => setEmployee(e.target.value)}>{!personReport && <option value="">كل الموظفين</option>}{personReport && !filteredEmployees.length && <option value="">لا يوجد موظفون</option>}{filteredEmployees.map(item => <option value={item.id} key={item.id}>{item.name} — {item.code}</option>)}</Select></Field>{dateRangeAvailable && <><Field label="من تاريخ"><Input type="date" value={from} min={`${month}-01`} max={monthEnd} onChange={e => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><Input type="date" value={to} min={`${month}-01`} max={monthEnd} onChange={e => setTo(e.target.value)} /></Field></>}{attendanceReport && <Field label="حالة الحضور"><Select value={status} onChange={e => setStatus(e.target.value)}><option value="">كل الحالات</option>{(type === 'absences' ? ['EXCUSED', 'UNEXCUSED', 'UNRESOLVED'] : ['PRESENT', 'EXCUSED', 'UNEXCUSED', 'EXEMPT', 'UNRESOLVED']).map(value => <option key={value} value={value}>{statusLabel(value as Parameters<typeof statusLabel>[0])}</option>)}</Select></Field>}</div>{invalidRange && <p role="alert" className="text-danger">يجب أن يكون تاريخ البداية قبل تاريخ النهاية.</p>}</Card>
    <div className="notice">لحفظ PDF: افتح «طباعة / حفظ PDF» ثم اختر «حفظ كملف PDF». التقرير مهيأ للطباعة على A4.{backend !== 'neon' && ' جميع بيانات هذه النسخة تجريبية.'}</div>
    <FinanceReportPreview data={data} backend={backend} model={model} filters={{ type, month, from, to }} />
  </div>;
}
