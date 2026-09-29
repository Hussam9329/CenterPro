import { getLatenessSeconds } from '../../src/lib/attendance';
import { calculateEmployeePayroll } from '../../src/lib/payroll';
import type { AttendanceRecord, AttendanceStatus, DemoData, Department, Employee, SalaryConfig, Workday } from '../../src/lib/types';

import { DEMO_TODAY, DEMO_MONTH } from '../../src/lib/mock-data';

function tiered(dailyRate: number, half: number, full: number, maximum: number, unexcusedRate: number): SalaryConfig {
  return {
    mode: 'TIERED', dailyRate, unexcusedRate, maximum, fixedSalary: 0, extraDaysStart: 17,
    tiers: [
      { id: 'tier-1', fromDays: 0, toDays: 4, type: 'PER_DAY', amount: 0 },
      { id: 'tier-2', fromDays: 5, toDays: 8, type: 'FIXED', amount: half },
      { id: 'tier-3', fromDays: 9, toDays: 16, type: 'FIXED', amount: full },
    ],
  };
}

function fixed(fixedSalary: number, dailyRate: number, unexcusedRate: number): SalaryConfig {
  return { mode: 'FIXED', fixedSalary, dailyRate, unexcusedRate, maximum: fixedSalary, extraDaysStart: 17, tiers: [] };
}

function departments(): Department[] {
  return [
    { id: 'dept-correction', name: 'التصحيح', active: true, description: 'تصحيح الامتحانات ومتابعة دقة الإجابات.', salary: tiered(25000, 200000, 400000, 600000, 50000) },
    { id: 'dept-review', name: 'التدقيق', active: true, description: 'مراجعة الدرجات وتدقيق نتائج الامتحانات.', salary: tiered(30000, 240000, 480000, 720000, 60000) },
    { id: 'dept-followup', name: 'المتابعة', active: true, description: 'التواصل مع الطلبة وأولياء الأمور ومتابعة الالتزام.', salary: tiered(25000, 225000, 450000, 650000, 45000) },
    { id: 'dept-sales', name: 'المبيعات', active: true, description: 'تسجيل الطلبة وتجهيز الطلبات وخدمة المراجعين.', salary: tiered(25000, 200000, 425000, 625000, 50000) },
    { id: 'dept-design', name: 'التصميم', active: true, description: 'إعداد المحتوى البصري والمواد التعليمية.', salary: fixed(750000, 25000, 50000) },
    { id: 'dept-admin', name: 'الادارة', active: true, description: 'إدارة المركز والعمليات اليومية وشؤون الفريق.', salary: fixed(1000000, 50000, 75000) },
  ];
}

function employees(): Employee[] {
  const people: Array<Pick<Employee, 'name' | 'departmentId' | 'gender'> & Partial<Employee>> = [
    { name: 'علي محمد حسن', departmentId: 'dept-correction', gender: 'MALE' },
    { name: 'مريم أحمد ناصر', departmentId: 'dept-correction', gender: 'FEMALE' },
    { name: 'زينب خالد علي', departmentId: 'dept-correction', gender: 'FEMALE' },
    { name: 'مصطفى عمر كريم', departmentId: 'dept-review', gender: 'MALE' },
    { name: 'نور سامي جاسم', departmentId: 'dept-review', gender: 'FEMALE', fixedOverride: true, fixedSalary: 800000 },
    { name: 'حسين فاضل سالم', departmentId: 'dept-followup', gender: 'MALE' },
    { name: 'زهراء ياسر عبد الله', departmentId: 'dept-followup', gender: 'FEMALE' },
    { name: 'عمر حيدر عباس', departmentId: 'dept-sales', gender: 'MALE' },
    { name: 'سارة وليد مهدي', departmentId: 'dept-sales', gender: 'FEMALE', startDate: '2026-09-17', fixedOverride: true, fixedSalary: 1000000, dailyRateOverride: 25000 },
    { name: 'محمد رائد سعد', departmentId: 'dept-design', gender: 'MALE' },
    { name: 'ريم طارق يوسف', departmentId: 'dept-design', gender: 'FEMALE', startDate: '2026-09-26', notes: 'بيانات افتراضية لمعاينة الرصيد السالب في أول شهر عمل.' },
    { name: 'حسن أحمد فلاح', departmentId: 'dept-admin', gender: 'MALE', role: 'SUPER_ADMIN' },
    { name: 'أحمد كريم مهند', departmentId: 'dept-admin', gender: 'MALE', role: 'ADMIN' },
    { name: 'كرار مازن قاسم', departmentId: 'dept-correction', gender: 'MALE', active: false, endDate: '2026-09-14', notes: 'انتهت خدمته في منتصف الشهر. السجل السابق محفوظ.' },
  ];
  return people.map((person, index) => {
    const code = `CP-${String(index + 1).padStart(4, '0')}`;
    return {
      id: code, code, address: ['بغداد — المنصور', 'بغداد — الكرادة', 'بغداد — اليرموك', 'بغداد — زيونة'][index % 4],
      phone: `0700000${String(index + 1).padStart(4, '0')}`, guardianPhone: `0701000${String(index + 1).padStart(4, '0')}`,
      startDate: '2026-01-05', active: true, birthDate: `${1993 + index % 9}-05-${String(10 + index).padStart(2, '0')}`,
      notes: 'سجل افتراضي مخصص لمراجعة واجهات CenterPro.', qualification: index % 3 === 0 ? 'بكالوريوس علوم' : 'بكالوريوس تربية',
      telegram: `centerpro_demo_${index + 1}`, username: `EMP${String(index + 1).padStart(3, '0')}`,
      role: 'EMPLOYEE', fixedOverride: false, fixedSalary: 0, dailyRateOverride: null,
      createdAt: '2026-01-04T09:00:00.000Z', updatedAt: '2026-09-27T11:00:00.000Z', ...person,
    };
  });
}

function datesForMonth(month: string): string[] {
  return Array.from({ length: 28 }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
    .filter((date) => new Date(`${date}T12:00:00Z`).getUTCDay() !== 5);
}

function attendanceStatus(employee: Employee, index: number, date: string, month: string): AttendanceStatus {
  if (month !== DEMO_MONTH) {
    if (employee.id === 'CP-0003' && index >= 16) return 'EXEMPT';
    if (employee.id === 'CP-0004' && index === 12) return 'EXCUSED';
    return 'PRESENT';
  }
  if (employee.id === 'CP-0001') return date === DEMO_TODAY ? 'UNRESOLVED' : index === 22 ? 'EXCUSED' : 'PRESENT';
  if (employee.id === 'CP-0003') return index < 14 ? 'PRESENT' : index === 14 ? 'EXCUSED' : 'EXEMPT';
  if (employee.id === 'CP-0004') return index === 20 ? 'EXCUSED' : index === 21 ? 'UNEXCUSED' : 'PRESENT';
  if (employee.id === 'CP-0006') return date === DEMO_TODAY ? 'UNRESOLVED' : 'PRESENT';
  if (employee.id === 'CP-0007') return date === DEMO_TODAY || index === 5 ? 'UNEXCUSED' : 'PRESENT';
  if (employee.id === 'CP-0008') return index === 10 ? 'EXCUSED' : 'PRESENT';
  if (employee.id === 'CP-0009') return date >= '2026-09-27' ? 'EXEMPT' : 'PRESENT';
  return 'PRESENT';
}

/** Test-only populated scenarios. Application code must never import this fixture. */
export function createPopulatedTestData(): DemoData {
  const departmentList = departments();
  const employeeList = employees();
  const workdays: Workday[] = [];
  const attendance: AttendanceRecord[] = [];
  for (const month of ['2026-07', '2026-08', DEMO_MONTH]) {
    const dates = datesForMonth(month);
    dates.forEach((date, index) => {
      const workday: Workday = {
        id: `wd-${date}`, date, startTime: '14:00:00', departmentIds: departmentList.map((item) => item.id),
        overrides: {}, state: date === DEMO_TODAY ? 'OPEN' : 'CLOSED',
      };
      workdays.push(workday);
      employeeList.forEach((employee, employeeIndex) => {
        if (date < employee.startDate || (employee.endDate && date > employee.endDate)) return;
        const status = attendanceStatus(employee, index, date, month);
        if (status === 'EXEMPT') workday.overrides[employee.id] = 'EXCLUDE';
        const late = [1, 6, 13].includes(index) && employeeIndex % 3 !== 2;
        const seconds = late ? [1, 343, 1063][[1, 6, 13].indexOf(index)] : -300 - employeeIndex * 13;
        const checkIn = status === 'PRESENT' ? new Date(Date.parse(`${date}T14:00:00+03:00`) + seconds * 1000).toISOString() : null;
        attendance.push({
          id: `att-${date}-${employee.id}`, employeeId: employee.id, workdayId: workday.id, status, checkIn,
          latenessSeconds: checkIn ? getLatenessSeconds(checkIn, date, workday.startTime) : 0,
          source: status === 'PRESENT' ? index === 8 ? 'MANUAL' : 'QR' : null,
          reason: status === 'EXCUSED' ? 'عذر شخصي مقبول من الإدارة.' : status === 'UNEXCUSED' ? 'لم يقدّم عذراً للغياب.' : status === 'EXEMPT' ? 'مستثنى من دوام هذا اليوم بقرار الإدارة.' : index === 8 ? 'إثبات حضور يدوي بعد تعذر استخدام الكاميرا.' : '',
          updatedAt: checkIn ?? `${date}T15:00:00.000Z`,
        });
      });
    });
  }
  const data: DemoData = {
    employees: employeeList, departments: departmentList, workdays, attendance,
    deductions: [
      { id: 'ded-001', employeeId: 'CP-0001', amount: 15000, date: '2026-09-21', type: 'اعتراض', customType: '', reason: 'اعتراض على تصحيح السؤال رقم 4 بعد مراجعة الإجابة.', createdBy: 'أحمد كريم مهند', createdAt: '2026-09-21T12:20:00.000Z' },
      { id: 'ded-002', employeeId: 'CP-0002', amount: 25000, date: '2026-09-28', type: 'خصم إداري', customType: '', reason: 'تعديل مالي بعد الصرف يحتاج إلى مراجعة الإدارة.', createdBy: 'أحمد كريم مهند', createdAt: '2026-09-28T11:10:00.000Z' },
      { id: 'ded-003', employeeId: 'CP-0011', amount: 100000, date: '2026-09-27', type: 'أخرى', customType: 'تسوية سلفة', reason: 'استقطاع سلفة افتراضية موثقة لإظهار الرصيد السالب بوضوح.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-09-27T12:00:00.000Z' },
      { id: 'ded-004', employeeId: 'CP-0008', amount: 10000, date: '2026-09-16', type: 'خصم إداري', customType: '', reason: 'تسوية فرق في سجل تجهيز الطلبات.', createdBy: 'أحمد كريم مهند', createdAt: '2026-09-16T13:00:00.000Z' },
      { id: 'ded-aug-001', employeeId: 'CP-0001', amount: 10000, date: '2026-08-20', type: 'اعتراض', customType: '', reason: 'اعتراض تصحيح معتمد للشهر السابق.', createdBy: 'أحمد كريم مهند', createdAt: '2026-08-20T12:00:00.000Z' },
    ],
    bonuses: [
      { id: 'bon-001', employeeId: 'CP-0001', amount: 50000, date: '2026-09-24', reason: 'أداء مميز ودقة مستمرة خلال الأسبوع.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-09-24T13:00:00.000Z' },
      { id: 'bon-002', employeeId: 'CP-0002', amount: 50000, date: '2026-09-25', reason: 'إنجاز مراجعة الدفعة الإضافية من الامتحانات.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-09-25T13:00:00.000Z' },
      { id: 'bon-003', employeeId: 'CP-0005', amount: 75000, date: '2026-09-22', reason: 'دقة عالية في التدقيق وتسليم النتائج في موعدها.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-09-22T13:00:00.000Z' },
      { id: 'bon-004', employeeId: 'CP-0010', amount: 50000, date: '2026-09-20', reason: 'إتمام تصميم المواد التعليمية الجديدة.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-09-20T13:00:00.000Z' },
      { id: 'bon-aug-001', employeeId: 'CP-0001', amount: 25000, date: '2026-08-24', reason: 'التزام مميز خلال شهر آب.', createdBy: 'حسن أحمد فلاح', createdAt: '2026-08-24T13:00:00.000Z' },
    ],
    months: [
      { id: 'pm-2026-09', month: DEMO_MONTH, state: 'OPEN', snapshots: {} },
      { id: 'pm-2026-08', month: '2026-08', state: 'ARCHIVED', archivedAt: '2026-08-31T16:00:00.000Z', snapshots: {} },
      { id: 'pm-2026-07', month: '2026-07', state: 'ARCHIVED', archivedAt: '2026-07-31T16:00:00.000Z', snapshots: {} },
    ],
    payments: [
      { id: 'pay-sep-002', employeeId: 'CP-0002', month: DEMO_MONTH, salaryAtPayment: 650000, amount: 650000, date: '2026-09-28', paidBy: 'أحمد كريم مهند', createdAt: '2026-09-28T10:30:00.000Z' },
    ],
    audit: ([
      { id: 'audit-001', actor: 'أحمد كريم مهند', role: 'ADMIN', action: 'فتح يوم حضور', entity: 'workday', entityId: 'wd-2026-09-28', oldValues: {}, newValues: { date: DEMO_TODAY, startTime: '14:00:00' }, timestamp: '2026-09-28T08:30:00.000Z' },
      { id: 'audit-002', actor: 'أحمد كريم مهند', role: 'ADMIN', action: 'تم صرف الراتب', entity: 'payment', entityId: 'pay-sep-002', employeeId: 'CP-0002', oldValues: { paymentStatus: 'UNPAID' }, newValues: { amount: 650000, month: DEMO_MONTH }, timestamp: '2026-09-28T10:30:00.000Z' },
      { id: 'audit-003', actor: 'أحمد كريم مهند', role: 'ADMIN', action: 'إضافة خصم بعد الصرف', entity: 'deduction', entityId: 'ded-002', employeeId: 'CP-0002', oldValues: { finalSalary: 650000 }, newValues: { amount: 25000, finalSalary: 625000, paymentStatus: 'REVIEW' }, timestamp: '2026-09-28T11:10:00.000Z' },
      { id: 'audit-004', actor: 'حسن أحمد فلاح', role: 'SUPER_ADMIN', action: 'إضافة موظفة', entity: 'employee', entityId: 'CP-0011', employeeId: 'CP-0011', oldValues: {}, newValues: { name: 'ريم طارق يوسف', startDate: '2026-09-26' }, timestamp: '2026-09-26T08:15:00.000Z' },
      { id: 'audit-005', actor: 'حسن أحمد فلاح', role: 'SUPER_ADMIN', action: 'تم تغيير كلمة مرور الموظف', entity: 'employee', entityId: 'CP-0006', employeeId: 'CP-0006', oldValues: {}, newValues: { sessionsInvalidated: true }, timestamp: '2026-09-25T09:30:00.000Z' },
      { id: 'audit-006', actor: 'حسن أحمد فلاح', role: 'SUPER_ADMIN', action: 'أرشفة رواتب الشهر', entity: 'payroll_month', entityId: 'pm-2026-08', oldValues: { state: 'OPEN' }, newValues: { state: 'ARCHIVED', month: '2026-08' }, timestamp: '2026-08-31T16:00:00.000Z' },
      { id: 'audit-007', actor: 'أحمد كريم مهند', role: 'ADMIN', action: 'إنهاء خدمة موظف', entity: 'employee', entityId: 'CP-0014', employeeId: 'CP-0014', oldValues: { active: true }, newValues: { active: false, endDate: '2026-09-14' }, timestamp: '2026-09-14T16:10:00.000Z' },
    ] satisfies DemoData['audit']).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    settings: { centerName: 'CenterPro', qrInterval: 45 },
  };
  for (const month of data.months.filter((item) => item.state === 'ARCHIVED')) {
    for (const employee of data.employees.filter((item) => item.startDate <= `${month.month}-31` && (!item.endDate || item.endDate >= `${month.month}-01`))) {
      const result = calculateEmployeePayroll(data, employee.id, month.month);
      data.payments.push({ id: `pay-${month.month}-${employee.id}`, employeeId: employee.id, month: month.month, salaryAtPayment: result.finalSalary, amount: result.finalSalary, date: `${month.month}-28`, paidBy: 'حسن أحمد فلاح', createdAt: `${month.month}-28T16:00:00.000Z` });
      month.snapshots[employee.id] = calculateEmployeePayroll(data, employee.id, month.month);
    }
    const monthWorkdays = data.workdays.filter((item) => item.date.startsWith(month.month));
    const monthWorkdayIds = new Set(monthWorkdays.map((item) => item.id));
    month.sourceSnapshot = structuredClone({
      employees: data.employees.filter((item) => Boolean(month.snapshots[item.id])),
      departments: data.departments,
      workdays: monthWorkdays,
      attendance: data.attendance.filter((item) => monthWorkdayIds.has(item.workdayId)),
      deductions: data.deductions.filter((item) => item.date.startsWith(month.month)),
      bonuses: data.bonuses.filter((item) => item.date.startsWith(month.month)),
    });
  }
  return data;
}
