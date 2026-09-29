export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';
export type AttendanceStatus = 'PRESENT' | 'UNRESOLVED' | 'EXCUSED' | 'UNEXCUSED' | 'EXEMPT';
export type SalaryMode = 'TIERED' | 'FIXED';
export interface SalaryTier { id: string; fromDays: number; toDays: number; type: 'PER_DAY' | 'FIXED'; amount: number }
export interface SalaryConfig { mode: SalaryMode; dailyRate: number; unexcusedRate: number; maximum: number; fixedSalary: number; extraDaysStart: number; tiers: SalaryTier[] }
export interface Department { id: string; name: string; active: boolean; description: string; salary: SalaryConfig }
export interface Employee { id: string; code: string; name: string; photo?: string; address: string; phone: string; guardianPhone: string; departmentId: string; startDate: string; endDate?: string; active: boolean; gender: 'MALE' | 'FEMALE'; birthDate: string; notes: string; qualification: string; telegram: string; username: string; role: Role; fixedOverride: boolean; fixedSalary: number; dailyRateOverride: number | null; createdAt: string; updatedAt: string }
export interface Workday { id: string; date: string; startTime: string; departmentIds: string[]; overrides: Record<string, 'INCLUDE' | 'EXCLUDE'>; state: 'OPEN' | 'CLOSED'; createdBy?: string; createdAt?: string }
export interface AttendanceRecord { id: string; employeeId: string; workdayId: string; status: AttendanceStatus; checkIn: string | null; latenessSeconds: number; source: 'QR' | 'MANUAL' | null; reason: string; updatedAt: string }
export interface Deduction { id: string; employeeId: string; amount: number; date: string; type: 'اعتراض' | 'خصم إداري' | 'أخرى'; customType: string; reason: string; createdBy: string; createdAt: string }
export interface Bonus { id: string; employeeId: string; amount: number; date: string; reason: string; createdBy: string; createdAt: string }
export interface PayrollResult { employeeId: string; employeeName: string; employeeCode: string; departmentName: string; month: string; salaryMode: SalaryMode; dailyRate: number; requiredDays: number; attendanceDays: number; excusedDays: number; unexcusedDays: number; exemptDays: number; unresolvedDays: number; lateDays: number; latenessSeconds: number; baseSalary: number; excusedDeduction: number; unexcusedDeduction: number; otherDeductions: number; bonuses: number; finalSalary: number; partialMonth: boolean; paymentStatus: 'UNPAID' | 'PAID' | 'REVIEW'; paidAmount: number; difference: number; salaryConfig: SalaryConfig }
export interface PayrollMonth { id: string; month: string; state: 'OPEN' | 'ARCHIVED' | 'REOPENED'; archivedAt?: string; snapshots: Record<string, PayrollResult>; sourceSnapshot?: Pick<DemoData, 'attendance' | 'workdays' | 'deductions' | 'bonuses' | 'employees' | 'departments'> }
export interface Payment { id: string; employeeId: string; month: string; salaryAtPayment: number; amount: number; date: string; paidBy: string; createdAt: string }
export interface AuditEntry { id: string; actor: string; role: Role; action: string; entity: string; entityId: string; employeeId?: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; timestamp: string; ip?: string; userAgent?: string }
export interface DemoSettings { centerName: string; qrInterval: number }
export interface DemoData { employees: Employee[]; departments: Department[]; workdays: Workday[]; attendance: AttendanceRecord[]; deductions: Deduction[]; bonuses: Bonus[]; months: PayrollMonth[]; payments: Payment[]; audit: AuditEntry[]; settings: DemoSettings }
export interface DemoSession { role: Role; employeeId?: string; name: string; kind?: 'SYSTEM' | 'EMPLOYEE' }
export type AuditInput = Pick<AuditEntry, 'action' | 'entity' | 'entityId'> & Partial<Pick<AuditEntry, 'employeeId' | 'oldValues' | 'newValues'>>;
