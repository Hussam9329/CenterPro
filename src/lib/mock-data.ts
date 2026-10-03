import type { AttendanceRecord, DemoData, Department, Employee, SalaryConfig, Workday } from './types';

export const DEMO_TODAY = '2026-09-28';
export const DEMO_MONTH = '2026-09';

/** A clean installation. Populated scenarios belong exclusively to the explicit test-data loader. */
export function createInitialData(): DemoData {
  return {
    employees: [],
    departments: [],
    workdays: [],
    attendance: [],
    deductions: [],
    bonuses: [],
    months: [],
    payments: [],
    audit: [],
    evaluationCycles: [],
    evaluationExams: [],
    examEvaluations: [],
    settings: { centerName: 'CenterPro', qrInterval: 45 },
  };
}

const correctionSalary: SalaryConfig = {
  mode: 'TIERED',
  dailyRate: 25_000,
  unexcusedRate: 50_000,
  maximum: 600_000,
  fixedSalary: 0,
  extraDaysStart: 17,
  tiers: [
    { id: 'test-correction-law-1', fromDays: 0, toDays: 4, type: 'PER_DAY', amount: 0 },
    { id: 'test-correction-law-2', fromDays: 5, toDays: 8, type: 'FIXED', amount: 200_000 },
    { id: 'test-correction-law-3', fromDays: 9, toDays: 16, type: 'FIXED', amount: 400_000 },
  ],
};

const auditSalary: SalaryConfig = structuredClone(correctionSalary);
auditSalary.tiers = auditSalary.tiers.map((tier, index) => ({ ...tier, id: `test-audit-law-${index + 1}` }));

const testDepartments: Department[] = [
  { id: 'department-correction-test', name: 'التصحيح', active: true, description: 'قسم التصحيح — بيانات اختبار المعاينة', salary: correctionSalary },
  { id: 'department-audit-test', name: 'التدقيق', active: true, description: 'قسم التدقيق — بيانات اختبار المعاينة', salary: auditSalary },
];

function testEmployee(input: {
  id: string;
  code: string;
  name: string;
  username: string;
  departmentId: string;
  gender: 'MALE' | 'FEMALE';
  phone: string;
  guardianPhone: string;
}): Employee {
  return {
    ...input,
    address: 'بغداد',
    startDate: '2026-09-01',
    active: true,
    birthDate: '2000-01-01',
    notes: '',
    qualification: 'اختبار المعاينة',
    telegram: input.username.toLowerCase(),
    role: 'EMPLOYEE',
    fixedOverride: false,
    fixedSalary: 0,
    dailyRateOverride: null,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

const testEmployees: Employee[] = [
  testEmployee({ id: 'employee-abrar-haqi', code: 'CP-0001', name: 'ابرار حقي', username: 'ABRAR1', departmentId: 'department-correction-test', gender: 'FEMALE', phone: '07700000001', guardianPhone: '07800000001' }),
  testEmployee({ id: 'employee-hiba-mohammed', code: 'CP-0002', name: 'هبة محمد', username: 'HIBA1', departmentId: 'department-correction-test', gender: 'FEMALE', phone: '07700000002', guardianPhone: '07800000002' }),
  testEmployee({ id: 'employee-fatima-firas', code: 'CP-0003', name: 'فاطمة فراس', username: 'FATIMA1', departmentId: 'department-correction-test', gender: 'FEMALE', phone: '07700000003', guardianPhone: '07800000003' }),
  testEmployee({ id: 'employee-maryam-issam', code: 'CP-0004', name: 'مريم عصام', username: 'MARYAME1', departmentId: 'department-correction-test', gender: 'FEMALE', phone: '07700000004', guardianPhone: '07800000004' }),
  testEmployee({ id: 'employee-jaafar-ali', code: 'CP-0005', name: 'جعفر علي', username: 'JAAFAR1', departmentId: 'department-audit-test', gender: 'MALE', phone: '07700000005', guardianPhone: '07800000005' }),
  testEmployee({ id: 'employee-maryam-fahad', code: 'CP-0006', name: 'مريم فهد', username: 'MARYAMF1', departmentId: 'department-audit-test', gender: 'FEMALE', phone: '07700000006', guardianPhone: '07800000006' }),
];

function day(index: number): Workday {
  const date = `2026-09-${String(index).padStart(2, '0')}`;
  return {
    id: `test-workday-${String(index).padStart(2, '0')}`,
    date,
    startTime: '14:00:00',
    departmentIds: testDepartments.map(item => item.id),
    overrides: {},
    state: 'CLOSED',
    createdBy: 'بيانات الاختبار',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function attendance(employeeId: string, dayIndex: number, status: AttendanceRecord['status']): AttendanceRecord {
  const date = `2026-09-${String(dayIndex).padStart(2, '0')}`;
  const present = status === 'PRESENT';
  return {
    id: `test-attendance-${employeeId}-${dayIndex}`,
    employeeId,
    workdayId: `test-workday-${String(dayIndex).padStart(2, '0')}`,
    status,
    checkIn: present ? `${date}T11:00:00.000Z` : null,
    latenessSeconds: 0,
    source: present ? 'QR' : null,
    reason: status === 'EXCUSED' ? 'غياب بعذر — بيانات اختبار' : status === 'UNEXCUSED' ? 'غياب بدون عذر — بيانات اختبار' : status === 'EXEMPT' ? 'لا يوجد دوام — بيانات اختبار' : '',
    updatedAt: `${date}T15:00:00.000Z`,
  };
}

function recordsFor(employeeId: string, presentDays: number[], excusedDays: number[] = [], unexcusedDays: number[] = [], totalDays = 18): AttendanceRecord[] {
  const present = new Set(presentDays);
  const excused = new Set(excusedDays);
  const unexcused = new Set(unexcusedDays);
  return Array.from({ length: totalDays }, (_, offset) => offset + 1).map(dayIndex => {
    const status: AttendanceRecord['status'] = present.has(dayIndex) ? 'PRESENT' : excused.has(dayIndex) ? 'EXCUSED' : unexcused.has(dayIndex) ? 'UNEXCUSED' : 'EXEMPT';
    return attendance(employeeId, dayIndex, status);
  });
}

/** Explicit preview-only fixture. No exams or evaluation scores are pre-populated. */
export function createTestData(): DemoData {
  const workdays = Array.from({ length: 18 }, (_, index) => day(index + 1));
  const attendanceRecords = [
    ...recordsFor('employee-abrar-haqi', Array.from({ length: 16 }, (_, index) => index + 1)),
    ...recordsFor('employee-hiba-mohammed', [1, 2, 3, 4, 5, 6, 7], [8, 9]),
    ...recordsFor('employee-fatima-firas', Array.from({ length: 16 }, (_, index) => index + 1), [17], [18]),
    ...recordsFor('employee-maryam-issam', Array.from({ length: 18 }, (_, index) => index + 1)),
    ...recordsFor('employee-jaafar-ali', Array.from({ length: 17 }, (_, index) => index + 1)),
    ...recordsFor('employee-maryam-fahad', [1, 2, 3, 4], [5, 6]),
  ];
  return {
    ...createInitialData(),
    departments: structuredClone(testDepartments),
    employees: structuredClone(testEmployees),
    workdays,
    attendance: attendanceRecords,
  };
}
