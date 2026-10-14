import { date, duration, money, monthLabel, number, time } from '@/lib/format';
import type { DemoData, Role } from '@/lib/types';

export const roleLabels: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف', QR_DISPLAY: 'QR Display' };
export const entityLabels: Record<string, string> = {
  employee: 'الموظفون',
  department: 'الأقسام',
  workday: 'أيام الحضور',
  attendance: 'الحضور',
  deduction: 'الخصومات',
  bonus: 'المكافآت',
  payment: 'صرف الرواتب',
  payroll_month: 'رواتب الشهر',
  settings: 'إعدادات النظام',
  'evaluation-season': 'مواسم التقييم',
  'evaluation-cycle': 'دورات التقييم',
  'evaluation-exam': 'امتحانات التدقيق',
  'exam-evaluation': 'تقييمات المصححين'
};
const valueLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin / Manager',
  EMPLOYEE: 'موظف',
  QR_DISPLAY: 'QR Display',
  OPEN: 'مفتوح',
  CLOSED: 'مغلق',
  ARCHIVED: 'مؤرشف',
  REOPENED: 'معاد فتحه',
  PAID: 'تم الصرف',
  UNPAID: 'لم يُصرف',
  REVIEW: 'تحتاج مراجعة',
  PRESENT: 'حاضر',
  UNRESOLVED: 'لم يُحسم',
  EXCUSED: 'غياب بعذر',
  UNEXCUSED: 'غياب بدون عذر',
  EXEMPT: 'معفى',
  QR: 'رمز QR',
  MANUAL: 'إداري',
  FIXED: 'قطعي',
  TIERED: 'غير قطعي',
  PER_DAY: 'عن كل يوم',
  INCLUDE: 'مشمول',
  EXCLUDE: 'مستثنى',
  MALE: 'ذكر',
  FEMALE: 'أنثى'
};
export const fieldLabels: Record<string, string> = {
  id: 'رقم السجل',
  code: 'الرقم الوظيفي',
  name: 'الاسم',
  date: 'التاريخ',
  startDate: 'تاريخ المباشرة',
  endDate: 'تاريخ إنهاء الخدمة',
  startTime: 'بداية الدوام',
  checkIn: 'وقت الحضور',
  month: 'الشهر',
  state: 'الحالة',
  status: 'حالة الحضور',
  paymentStatus: 'حالة الصرف',
  amount: 'المبلغ',
  finalSalary: 'صافي الراتب',
  salaryAtPayment: 'الراتب عند الصرف',
  paidAmount: 'المبلغ المصروف',
  active: 'نشط',
  role: 'الدور',
  username: 'اسم المستخدم',
  employeeId: 'الموظف',
  departmentId: 'القسم',
  departmentIds: 'الأقسام المشمولة',
  reason: 'السبب',
  type: 'النوع',
  customType: 'نوع الخصم',
  createdBy: 'أضيف بواسطة',
  paidBy: 'صرف بواسطة',
  createdAt: 'تاريخ الإنشاء',
  updatedAt: 'آخر تعديل',
  sessionsInvalidated: 'إنهاء الجلسات السابقة',
  simulated: 'محاكاة',
  preview: 'معاينة',
  latenessSeconds: 'مدة التأخير',
  centerName: 'اسم المركز',
  qrInterval: 'مدة تجديد QR بالثواني',
  salary: 'إعدادات الراتب',
  salaryConfig: 'إعدادات الراتب',
  mode: 'نوع الراتب',
  dailyRate: 'قيمة اليوم',
  unexcusedRate: 'خصم اليوم بدون عذر',
  maximum: 'سقف الراتب',
  fixedSalary: 'الراتب القطعي',
  extraDaysStart: 'بداية الأيام الإضافية',
  tiers: 'قوانين القسم',
  fromDays: 'من يوم',
  toDays: 'إلى يوم',
  fixedOverride: 'راتب قطعي خاص',
  dailyRateOverride: 'قيمة يوم خاصة',
  address: 'السكن',
  phone: 'رقم الهاتف',
  guardianPhone: 'هاتف ولي الأمر',
  gender: 'الجنس',
  birthDate: 'تاريخ الميلاد',
  notes: 'الملاحظات',
  qualification: 'المؤهل',
  telegram: 'معرّف تليغرام',
  photo: 'الصورة',
  overrides: 'استثناءات الموظفين',
  explicitRecalculation: 'إعادة احتساب صريحة',
  salaryRules: 'قوانين القسم',
  requiredDays: 'الأيام المطلوبة',
  attendanceDays: 'أيام الحضور',
  excusedDays: 'غياب بعذر',
  unexcusedDays: 'غياب بدون عذر',
  exemptDays: 'أيام الإعفاء',
  unresolvedDays: 'أيام لم تُحسم',
  baseSalary: 'الراتب الأساسي',
  otherDeductions: 'الخصومات الأخرى',
  bonuses: 'المكافآت',
  seasonId: 'موسم التقييم',
  cycleId: 'دورة التقييم',
  examId: 'الامتحان',
  papers: 'عدد الأوراق المصححة',
  correctionErrors: 'أخطاء التصحيح',
  behaviorErrors: 'أخطاء السلوك',
  note: 'الملاحظة',
  rows: 'عدد المصححين',
  exams: 'عدد الامتحانات'
};
export const sensitiveField = /password|passphrase|hash|secret|token|credential|كلمة.?المرور|كلمة.?السر/i;
const financialFields = new Set([
  'amount',
  'finalSalary',
  'salaryAtPayment',
  'paidAmount',
  'dailyRate',
  'unexcusedRate',
  'maximum',
  'fixedSalary',
  'dailyRateOverride',
  'baseSalary',
  'otherDeductions',
  'bonuses'
]);
export function readableValue(value: unknown, key: string, data: DemoData): string {
  if (value === null || value === undefined || value === '')
    return '—';
  if (typeof value === 'boolean')
    return value ? 'نعم' : 'لا';
  if (typeof value === 'number')
    return financialFields.has(key) ? money(value) : key === 'latenessSeconds' ? duration(value) : number(value);
  if (Array.isArray(value))
    return value.length ? value.map(item => readableValue(item, key === 'departmentIds' ? 'departmentId' : key, data)).join('، ') : 'لا يوجد';
  if (typeof value === 'object')
    return Object.entries(value).filter(([child]) => !sensitiveField.test(child)).map(([child, item]) => `${fieldLabels[child] || data.employees.find(employee => employee.id === child)?.name || child}: ${readableValue(item, child, data)}`).join(' · ') || 'لا يوجد';
  const text = String(value);
  if (key === 'employeeId')
    return data.employees.find(employee => employee.id === text)?.name || text;
  if (key === 'departmentId')
    return data.departments.find(department => department.id === text)?.name || text;
  if (key === 'month' && /^\d{4}-\d{2}$/.test(text))
    return monthLabel(text);
  if (key === 'startTime')
    return time(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text))
    return `${date(text)} — ${time(text)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return date(text);
  return valueLabels[text] || text;
}

export function baghdadDate(value: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
