import { getMonthPayroll } from '../payroll';
import { isExpected, statusLabel } from '../attendance';
import { duration, time } from '../format';
import type { CenterReport, ReportColumn, ReportSection } from '../report-export';
import type { AttendanceRecord, DemoData, PayrollResult } from '../types';
import { monthSource } from './month-source';
import { paymentLabels } from './payment-status';

export const reportLabels = {
  payroll: 'كشف رواتب الشهر',
  attendance: 'كشف الحضور',
  absences: 'كشف الغيابات',
  deductions: 'كشف الخصومات',
  bonuses: 'كشف المكافآت',
  employee: 'تقرير موظف',
  payslip: 'قسيمة راتب',
} as const;
export type ReportType = keyof typeof reportLabels;
export interface ReportFilters {
  type: ReportType;
  month: string;
  department: string;
  employee: string;
  status: string;
  from: string;
  to: string;
}
const moneyColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'money' });
const textColumn = (key: string, label: string): ReportColumn => ({ key, label });
const numberColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'number' });
const dateColumn = (key: string, label: string): ReportColumn => ({ key, label, type: 'date' });
const nativeDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
function payrollSection(results: PayrollResult[]): ReportSection {
  return {
    title: 'كشف الرواتب',
    columns: [
      textColumn('code', 'رقم الموظف'),
      textColumn('name', 'الموظف'),
      textColumn('department', 'القسم'),
      textColumn('mode', 'نوع الراتب'),
      numberColumn('required', 'الأيام المطلوبة'),
      numberColumn('attendance', 'حضور'),
      numberColumn('excused', 'بعذر'),
      numberColumn('unexcused', 'بدون عذر'),
      moneyColumn('base', 'الأساسي'),
      moneyColumn('absence', 'خصم الغياب'),
      moneyColumn('deductions', 'خصومات أخرى'),
      moneyColumn('bonuses', 'المكافآت'),
      moneyColumn('final', 'الصافي'),
      textColumn('payment', 'الصرف')
    ],
    rows: results.map(item => ({
      code: item.employeeCode,
      name: item.employeeName,
      department: item.departmentName,
      mode: item.salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي',
      required: item.requiredDays,
      attendance: item.attendanceDays,
      excused: item.excusedDays,
      unexcused: item.unexcusedDays,
      base: item.baseSalary,
      absence: item.excusedDeduction + item.unexcusedDeduction,
      deductions: item.otherDeductions,
      bonuses: item.bonuses,
      final: item.finalSalary,
      payment: paymentLabels[item.paymentStatus]
    }))
  };
}

function payslipSections(result: PayrollResult, data: DemoData): ReportSection[] {
  const summary: ReportSection = {
    title: 'تفاصيل الراتب',
    columns: [textColumn('label', 'البند'), moneyColumn('amount', 'المبلغ (د.ع)')],
    rows: [
      { label: 'الراتب الأساسي', amount: result.baseSalary },
      { label: `غياب بعذر (${result.excusedDays})`, amount: -result.excusedDeduction },
      { label: `غياب بدون عذر (${result.unexcusedDays})`, amount: -result.unexcusedDeduction },
      { label: 'خصومات أخرى', amount: -result.otherDeductions },
      { label: 'المكافآت', amount: result.bonuses },
      { label: 'صافي الراتب', amount: result.finalSalary },
      { label: 'آخر مبلغ مصروف', amount: result.paidAmount },
      { label: 'الفرق عن المصروف', amount: result.difference }
    ]
  };
  const payments: ReportSection = {
    title: 'سجل الصرف',
    columns: [
      dateColumn('date', 'تاريخ الصرف'),
      moneyColumn('salary', 'الراتب وقت الصرف'),
      moneyColumn('amount', 'المبلغ المصروف'),
      textColumn('actor', 'بواسطة')
    ],
    rows: data.payments.filter(item => item.employeeId === result.employeeId && item.month === result.month).map(item => ({ date: nativeDate(item.date), salary: item.salaryAtPayment, amount: item.amount, actor: item.paidBy }))
  };
  return [summary, payments];
}

/** Build the same model for the preview, Excel export, and printable report. */
export function buildFinanceReport(data: DemoData, { type, month, department, employee, status, from, to }: ReportFilters) {
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
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
      if (employeeIds.has(person.id) && isExpected(person, workday) && !recordedKeys.has(`${person.id}:${workday.id}`))
        missingRecords.push({
          id: `pending-${workday.id}-${person.id}`,
          employeeId: person.id,
          workdayId: workday.id,
          status: 'UNRESOLVED',
          checkIn: null,
          latenessSeconds: 0,
          source: null,
          reason: 'بانتظار حسم حالة الحضور',
          updatedAt: `${workday.date}T00:00:00.000Z`
        });
    }
  }
  const records = [...source.attendance, ...missingRecords].filter(item => employeeIds.has(item.employeeId) && workdays.has(item.workdayId) && (!status || item.status === status) && (type !== 'absences' || item.status === 'EXCUSED' || item.status === 'UNEXCUSED' || item.status === 'UNRESOLVED')).sort((a, b) => (workdays.get(b.workdayId)?.date ?? '').localeCompare(workdays.get(a.workdayId)?.date ?? ''));
  const attendance: ReportSection = {
    title: type === 'absences' ? 'كشف الغيابات' : 'سجل الحضور',
    columns: [
      dateColumn('date', 'التاريخ'),
      textColumn('code', 'رقم الموظف'),
      textColumn('name', 'الموظف'),
      textColumn('department', 'القسم'),
      textColumn('status', 'الحالة'),
      textColumn('checkin', 'وقت الحضور'),
      textColumn('late', 'مدة التأخير'),
      textColumn('reason', 'السبب')
    ],
    rows: records.map(item => {
      const person = source.employees.find(entry => entry.id === item.employeeId);
      return {
        date: nativeDate(workdays.get(item.workdayId)!.date),
        code: person?.code ?? '',
        name: person?.name ?? '',
        department: source.departments.find(entry => entry.id === person?.departmentId)?.name ?? '',
        status: statusLabel(item.status),
        checkin: item.checkIn ? time(item.checkIn) : '—',
        late: duration(item.latenessSeconds),
        reason: item.reason || '—'
      };
    })
  };
  const deductions: ReportSection = {
    title: 'كشف الخصومات',
    columns: [
      dateColumn('date', 'التاريخ'),
      textColumn('code', 'رقم الموظف'),
      textColumn('name', 'الموظف'),
      textColumn('type', 'نوع الخصم'),
      moneyColumn('amount', 'المبلغ'),
      textColumn('reason', 'السبب'),
      textColumn('actor', 'أضيف بواسطة')
    ],
    rows: source.deductions.filter(item => employeeIds.has(item.employeeId) && dateMatches(item.date)).map(item => ({
      date: nativeDate(item.date),
      code: source.employees.find(person => person.id === item.employeeId)?.code ?? '',
      name: source.employees.find(person => person.id === item.employeeId)?.name ?? '',
      type: item.type === 'أخرى' ? item.customType : item.type,
      amount: item.amount,
      reason: item.reason,
      actor: item.createdBy
    }))
  };
  const bonuses: ReportSection = {
    title: 'كشف المكافآت',
    columns: [
      dateColumn('date', 'التاريخ'),
      textColumn('code', 'رقم الموظف'),
      textColumn('name', 'الموظف'),
      moneyColumn('amount', 'المبلغ'),
      textColumn('reason', 'السبب'),
      textColumn('actor', 'أضيف بواسطة')
    ],
    rows: source.bonuses.filter(item => employeeIds.has(item.employeeId) && dateMatches(item.date)).map(item => ({
      date: nativeDate(item.date),
      code: source.employees.find(person => person.id === item.employeeId)?.code ?? '',
      name: source.employees.find(person => person.id === item.employeeId)?.name ?? '',
      amount: item.amount,
      reason: item.reason,
      actor: item.createdBy
    }))
  };
  const sections: ReportSection[] = type === 'payroll' ? [payrollSection(results)] : attendanceReport ? [attendance] : type === 'deductions' ? [deductions] : type === 'bonuses' ? [bonuses] : results[0] ? [...payslipSections(results[0], source), ...(type === 'employee' ? [attendance] : []), deductions, bonuses] : [];
  const report: CenterReport = {
    title: reportLabels[type],
    period: month,
    subtitle: personReport && selectedPerson ? `${selectedPerson.name} · ${selectedPerson.code} · ${results[0]?.departmentName ?? ''}` : `${department ? source.departments.find(item => item.id === department)?.name : 'جميع الأقسام'}${selectedPerson ? ` · ${selectedPerson.name}` : ''}`,
    sections: invalidRange ? [] : sections
  };
  const hasRows = report.sections.some(section => section.rows.length);
  return {
    monthEnd,
    source,
    personReport,
    filteredEmployees,
    selectedEmployee,
    results,
    attendanceReport,
    dateRangeAvailable,
    invalidRange,
    report,
    hasRows
  };
}

export type FinanceReportModel = ReturnType<typeof buildFinanceReport>;
