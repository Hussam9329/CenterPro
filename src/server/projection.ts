import { getSeasonLeaderboard, isAuditEmployee, isCorrectionEmployee } from '@/lib/evaluations';
import { hasEmployeePermission } from '@/lib/permissions';
import { isExpected } from '@/lib/attendance';
import type { DemoData, DemoSession, Department, Employee, EvaluationCycleSnapshot, EvaluationLeaderboardRow, EvaluationSeasonSnapshot, PayrollMonth, PayrollResult, SalaryConfig, SeasonLeaderboardRow, Workday } from '@/lib/types';

const emptySalary: Department['salary'] = { mode: 'FIXED', dailyRate: 0, unexcusedRate: 0, maximum: 0, fixedSalary: 0, extraDaysStart: 0, tiers: [] };
function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> { return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, structuredClone(value[key])])) as Pick<T, K>; }
function salaryView(value: SalaryConfig): SalaryConfig {
  return { ...pick(value, ['mode', 'dailyRate', 'unexcusedRate', 'maximum', 'fixedSalary', 'extraDaysStart']), tiers: value.tiers.map(tier => pick(tier, ['id', 'fromDays', 'toDays', 'type', 'amount'])) };
}
function privateEmployee(value: Employee): Employee { return pick(value, ['id', 'code', 'name', 'photo', 'address', 'phone', 'guardianPhone', 'departmentId', 'startDate', 'endDate', 'active', 'gender', 'birthDate', 'notes', 'qualification', 'telegram', 'username', 'role', 'permissions', 'fixedOverride', 'fixedSalary', 'dailyRateOverride', 'createdAt', 'updatedAt']); }
function employeeProfileView(value: Employee): Employee { return pick(value, ['id', 'code', 'name', 'photo', 'address', 'phone', 'guardianPhone', 'departmentId', 'startDate', 'endDate', 'active', 'gender', 'birthDate', 'notes', 'qualification', 'telegram', 'username', 'role', 'fixedOverride', 'fixedSalary', 'dailyRateOverride', 'createdAt', 'updatedAt']); }
/** Operational modules need roster/payroll fields, never contact/account PII. */
function operationalEmployee(value: Employee): Employee {
  return {
    id: value.id, code: value.code, name: value.name, departmentId: value.departmentId, startDate: value.startDate, endDate: value.endDate, active: value.active,
    role: 'EMPLOYEE', fixedOverride: value.fixedOverride, fixedSalary: value.fixedSalary, dailyRateOverride: value.dailyRateOverride,
    address: '', phone: '', guardianPhone: '', gender: value.gender, birthDate: '', notes: '', qualification: '', telegram: '', username: '', createdAt: '', updatedAt: '',
  };
}
function privateDepartment(value: Department): Department { return { ...pick(value, ['id', 'name', 'active', 'description']), salary: salaryView(value.salary) }; }
function privateAttendance(value: DemoData['attendance'][number]) { return pick(value, ['id', 'employeeId', 'workdayId', 'status', 'checkIn', 'latenessSeconds', 'source', 'reason', 'updatedAt']); }
function privateDeduction(value: DemoData['deductions'][number]) { return pick(value, ['id', 'employeeId', 'amount', 'date', 'type', 'customType', 'reason', 'createdBy', 'createdAt']); }
function privateBonus(value: DemoData['bonuses'][number]) { return pick(value, ['id', 'employeeId', 'amount', 'date', 'reason', 'createdBy', 'createdAt']); }
function privatePayment(value: DemoData['payments'][number]) { return pick(value, ['id', 'employeeId', 'month', 'salaryAtPayment', 'amount', 'date', 'paidBy', 'createdAt']); }
function payrollView(value: PayrollResult): PayrollResult {
  return { ...pick(value, ['employeeId', 'employeeName', 'employeeCode', 'departmentName', 'month', 'salaryMode', 'dailyRate', 'requiredDays', 'attendanceDays', 'excusedDays', 'unexcusedDays', 'exemptDays', 'unresolvedDays', 'lateDays', 'latenessSeconds', 'baseSalary', 'excusedDeduction', 'unexcusedDeduction', 'otherDeductions', 'bonuses', 'finalSalary', 'partialMonth', 'paymentStatus', 'paidAmount', 'difference']), salaryConfig: salaryView(value.salaryConfig) };
}
function rankingRow(value: EvaluationLeaderboardRow): EvaluationLeaderboardRow { return pick(value, ['employeeId', 'employeeName', 'employeeCode', 'papers', 'correctionErrors', 'behaviorErrors', 'examsEvaluated', 'score', 'accuracy']); }
function seasonRow(value: SeasonLeaderboardRow): SeasonLeaderboardRow { return { ...rankingRow(value), ...pick(value, ['cyclesEvaluated', 'attendanceDays', 'averagePapersPerDay']) }; }
function cycleSnapshot(value: EvaluationCycleSnapshot): EvaluationCycleSnapshot { return { rows: value.rows.map(rankingRow), exams: value.exams.map(exam => ({ ...pick(exam, ['id', 'name', 'date']), rows: exam.rows.map(rankingRow) })) }; }
function seasonSnapshot(value: EvaluationSeasonSnapshot): EvaluationSeasonSnapshot { return { rows: value.rows.map(seasonRow), cycleIds: [...value.cycleIds] }; }

/** Shared rankings identify colleagues by name/code only. Fill the existing
 * frontend's Employee contract with non-sensitive blanks, never source PII. */
function descriptor(employee: Employee): Employee {
  return { id: employee.id, code: employee.code, name: employee.name, departmentId: employee.departmentId, active: employee.active, role: 'EMPLOYEE', address: '', phone: '', guardianPhone: '', startDate: '', gender: 'MALE', birthDate: '', notes: '', qualification: '', telegram: '', username: '', fixedOverride: false, fixedSalary: 0, dailyRateOverride: null, createdAt: '', updatedAt: '' };
}
function ownDay(day: Workday, employeeId: string, departmentId: string): Workday {
  const ownOverride = day.overrides[employeeId];
  return { id: day.id, date: day.date, startTime: day.startTime, state: day.state, departmentIds: day.departmentIds.includes(departmentId) ? [departmentId] : [], overrides: ownOverride ? { [employeeId]: ownOverride } : {} };
}
function ownMonth(period: PayrollMonth, employeeId: string): PayrollMonth {
  const copy: PayrollMonth = { ...pick(period, ['id', 'month', 'state', 'archivedAt']), snapshots: period.snapshots[employeeId] ? { [employeeId]: payrollView(period.snapshots[employeeId]) } : {} };
  if (period.sourceSnapshot) {
    const source = period.sourceSnapshot;
    const employee = source.employees.find(item => item.id === employeeId);
    const attendance = source.attendance.filter(item => item.employeeId === employeeId);
    const dates = new Set(attendance.map(item => item.workdayId));
    copy.sourceSnapshot = {
      employees: employee ? [privateEmployee(employee)] : [],
      departments: employee ? source.departments.filter(item => item.id === employee.departmentId).map(privateDepartment) : [],
      workdays: source.workdays.filter(day => dates.has(day.id) || Boolean(employee && isExpected(employee, day))).map(day => ownDay(day, employeeId, employee?.departmentId ?? '')),
      attendance: attendance.map(privateAttendance),
      deductions: source.deductions.filter(item => item.employeeId === employeeId).map(privateDeduction),
      bonuses: source.bonuses.filter(item => item.employeeId === employeeId).map(privateBonus),
    };
  }
  return copy;
}

/** Construct authorized data before serialization; client-side hiding is never
 * used as the boundary for private personnel, financial or unpublished data. */
export function projectData(data: DemoData, actor: DemoSession): DemoData {
  // Input is repository data, never a previously projected response. Discard a
  // coincidentally imported extension with this reserved name defensively.
  data = { ...data }; delete data.serverEvaluation;
  if (actor.role === 'QR_DISPLAY') {
    return {
      employees: [], departments: [], attendance: [], deductions: [], bonuses: [], months: [], payments: [], audit: [],
      evaluationSeasons: [], evaluationCycles: [], evaluationExams: [], examEvaluations: [],
      workdays: data.workdays.filter(day => day.state === 'OPEN').map(day => ({ id: day.id, date: day.date, startTime: day.startTime, state: day.state, departmentIds: [], overrides: {} })),
      settings: { centerName: data.settings.centerName, qrInterval: data.settings.qrInterval },
    };
  }
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'ADMIN') {
    const result = structuredClone(data); delete result.serverEvaluation;
    // Managers have operational data, but the owner-only audit log must not be
    // recoverable from their browser even when its navigation entry is hidden.
    if (actor.role === 'ADMIN') result.audit = [];
    return result;
  }
  const employee = data.employees.find(item => item.id === actor.employeeId && item.active && item.role === 'EMPLOYEE');
  if (!employee) throw new Error('انتهت صلاحية الحساب. سجّل الدخول مجدداً.');
  const can = (feature: Parameters<typeof hasEmployeePermission>[1]) => hasEmployeePermission(employee, feature, 'view');
  const auditor = isAuditEmployee(data, employee);
  const corrector = isCorrectionEmployee(data, employee);
  const evaluationAllowed = auditor || corrector;
  const dashboardReports = can('DASHBOARD') || can('REPORTS');
  const employeesAdmin = can('EMPLOYEES');
  const attendanceAdmin = can('ATTENDANCE');
  const payrollAdmin = can('PAYROLL');
  const departmentsAdmin = can('DEPARTMENTS');
  const delegatedDeductions = can('DEDUCTIONS');
  const delegatedBonuses = can('BONUSES');
  const delegatedFinance = delegatedDeductions || delegatedBonuses;
  const payrollData = dashboardReports || payrollAdmin;

  // Each delegated menu receives only the data it needs. Granting Employees,
  // for example, must not implicitly disclose payroll or attendance history.
  const operationalRoster = dashboardReports || employeesAdmin || attendanceAdmin || payrollAdmin;
  const peerEmployees = operationalRoster
    ? data.employees.filter(item => item.id !== employee.id)
    : departmentsAdmin || delegatedFinance || can('AUDIT_LOG')
      ? data.employees.filter(item => item.id !== employee.id)
      : evaluationAllowed ? data.employees.filter(item => item.id !== employee.id && isCorrectionEmployee(data, item)) : [];
  const others = peerEmployees.map(item => employeesAdmin ? employeeProfileView(item) : operationalRoster ? operationalEmployee(item) : descriptor(item));
  const departmentIds = new Set([employee.departmentId, ...others.map(item => item.departmentId)]);
  const ownAttendance = data.attendance.filter(item => item.employeeId === employee.id);
  const ownWorkdayIds = new Set(ownAttendance.map(item => item.workdayId));
  const exams = evaluationAllowed ? data.evaluationExams : [];
  const visibleExamIds = new Set(exams.filter(exam => auditor || exam.state === 'CLOSED').map(exam => exam.id));
  const allDepartments = dashboardReports || employeesAdmin || payrollAdmin || departmentsAdmin || attendanceAdmin;
  const allWorkdays = dashboardReports || payrollAdmin || attendanceAdmin;
  const allAttendance = dashboardReports || payrollAdmin || attendanceAdmin;
  const result: DemoData = {
    employees: [privateEmployee(employee), ...others],
    departments: allDepartments
      ? data.departments.map(privateDepartment)
      : data.departments.filter(item => departmentIds.has(item.id)).map(item => item.id === employee.departmentId ? privateDepartment(item) : { id: item.id, name: item.name, active: item.active, description: '', salary: structuredClone(emptySalary) }),
    workdays: allWorkdays
      ? data.workdays.map(item => structuredClone(item))
      : data.workdays.filter(day => day.state === 'OPEN' || ownWorkdayIds.has(day.id) || isExpected(employee, day)).map(day => ownDay(day, employee.id, employee.departmentId)),
    attendance: (allAttendance ? data.attendance : ownAttendance).map(privateAttendance),
    deductions: ((payrollData || delegatedDeductions) ? data.deductions : data.deductions.filter(item => item.employeeId === employee.id)).map(privateDeduction),
    bonuses: ((payrollData || delegatedBonuses) ? data.bonuses : data.bonuses.filter(item => item.employeeId === employee.id)).map(privateBonus),
    payments: (payrollData ? data.payments : data.payments.filter(item => item.employeeId === employee.id)).map(privatePayment),
    months: payrollData ? structuredClone(data.months) : (delegatedFinance ? data.months.map(item => ownMonth(item, employee.id)) : data.months.filter(item => item.state === 'OPEN' || Boolean(item.snapshots[employee.id])).map(item => ownMonth(item, employee.id))),
    audit: can('AUDIT_LOG') ? structuredClone(data.audit) : [],
    settings: { centerName: data.settings.centerName, qrInterval: data.settings.qrInterval },
    evaluationSeasons: evaluationAllowed ? data.evaluationSeasons.map(item => ({ id: item.id, name: item.name, startDate: item.startDate, endDate: item.endDate, state: item.state, openedAt: item.openedAt, openedBy: '', closedAt: item.closedAt, closedBy: '', ...(item.state === 'ARCHIVED' && item.snapshot ? { snapshot: seasonSnapshot(item.snapshot) } : {}) })) : [],
    evaluationCycles: evaluationAllowed ? data.evaluationCycles.map(item => ({ id: item.id, seasonId: item.seasonId, name: item.name, state: item.state, openedAt: item.openedAt, openedBy: '', closedAt: item.closedAt, closedBy: '', ...(item.state === 'ARCHIVED' && item.snapshot ? { snapshot: cycleSnapshot(item.snapshot) } : {}) })) : [],
    evaluationExams: exams.map(item => ({ id: item.id, cycleId: item.cycleId, name: item.name, date: item.date, state: item.state, note: auditor ? item.note : '', createdAt: item.createdAt, createdBy: '', closedAt: item.closedAt, closedBy: '' })),
    examEvaluations: evaluationAllowed ? data.examEvaluations.filter(item => visibleExamIds.has(item.examId)).map(item => ({ id: item.id, examId: item.examId, employeeId: item.employeeId, papers: item.papers, correctionErrors: item.correctionErrors, behaviorErrors: item.behaviorErrors, note: auditor ? item.note : '', createdAt: item.createdAt, createdBy: '', updatedAt: item.updatedAt, updatedBy: '' })) : [],
  };
  if (evaluationAllowed) result.serverEvaluation = { seasons: Object.fromEntries(data.evaluationSeasons.map(season => [season.id, getSeasonLeaderboard(data, season.id, { publishedOnly: !auditor }).map(seasonRow)])) };
  return result;
}
