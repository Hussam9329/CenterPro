import type { Department, Employee } from '@/lib/types';
import { passwordProblem } from '@/lib/password-policy';

export const employeeFormSteps = ['المعلومات الشخصية', 'معلومات الاتصال', 'معلومات العمل', 'حساب الدخول', 'إعدادات الراتب'];

export type DraftEmployee = Omit<Employee, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'endDate'>;
export const phoneSuffix = (value: string) => value.replace(/\D/g, '').replace(/^07/, '').slice(0, 9);
// Input values are suffixes: a suffix beginning with 07 is still nine digits.
export const fullPhone = (suffix: string) => `07${suffix.replace(/\D/g, '').slice(0, 9)}`;
export const telegramUsername = (value: string) => value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '');
export function initialEmployee(today: string, employee?: Employee): DraftEmployee {
  if (employee) {
    // Pick the supported editable fields so removed legacy properties are not
    // copied back from an older browser session.
    return {
      name: employee.name, photo: employee.photo, address: employee.address,
      phone: employee.phone, guardianPhone: employee.guardianPhone,
      departmentId: employee.departmentId, startDate: employee.startDate,
      active: employee.active, gender: employee.gender, birthDate: employee.birthDate,
      notes: employee.notes, qualification: employee.qualification,
      telegram: telegramUsername(employee.telegram), username: employee.username,
      role: employee.role, fixedOverride: employee.fixedOverride,
      fixedSalary: employee.fixedSalary, dailyRateOverride: employee.dailyRateOverride,
    };
  }
  return { name: '', address: '', phone: '07', guardianPhone: '07', departmentId: '', startDate: today, active: true, gender: 'MALE', birthDate: '', notes: '', qualification: '', telegram: '', username: '', role: 'EMPLOYEE', fixedOverride: false, fixedSalary: 0, dailyRateOverride: null };
}

export function validateEmployeeStep(current: number, {
  draft, today, departments, employees, employee, systemUsername, password, fixedSalaryText,
}: {
  draft: DraftEmployee;
  today: string;
  departments: Department[];
  employees: Employee[];
  employee?: Employee;
  systemUsername: string;
  password: string;
  fixedSalaryText: string;
}) {
  if (current === 0 && !draft.name.trim()) return 'اكتب الاسم الكامل للموظف.';
  if (current === 0 && draft.birthDate && draft.birthDate > today) return 'تاريخ الميلاد يجب أن يكون في الماضي.';
  if (current === 1 && !/^07\d{9}$/.test(draft.phone)) return 'رقم الهاتف مطلوب ويجب أن يتكون من 11 رقماً ويبدأ بـ 07.';
  if (current === 1 && !/^07\d{9}$/.test(draft.guardianPhone)) return 'رقم هاتف ولي الأمر مطلوب ويجب أن يتكون من 11 رقماً ويبدأ بـ 07.';
  if (current === 1 && draft.telegram && !/^[A-Za-z0-9_]+$/.test(draft.telegram)) return 'معرف تيليغرام يقبل الأحرف الإنجليزية والأرقام والشرطة السفلية فقط.';
  if (current === 2 && !departments.some(item => item.id === draft.departmentId && (item.active || item.id === employee?.departmentId))) return 'اختر قسماً نشطاً للموظف.';
  if (current === 2 && !draft.startDate) return 'حدد تاريخ مباشرة الموظف.';
  if (current === 3 && !draft.username.trim()) return 'اكتب اسم المستخدم الخاص بحساب الموظف.';
  if (current === 3 && /\s/.test(draft.username.trim())) return 'اسم المستخدم لا يحتوي على مسافات.';
  if (current === 3 && employees.some(item => item.id !== employee?.id && item.username.toLocaleLowerCase() === draft.username.trim().toLocaleLowerCase())) return 'اسم المستخدم مستخدم مسبقاً. اختر اسماً آخر.';
  if (current === 3 && draft.username.trim().toLocaleLowerCase('en-US') === systemUsername.trim().toLocaleLowerCase('en-US')) return 'اسم المستخدم محجوز لحساب مدير النظام. اختر اسماً آخر.';
  if (current === 3 && !employee && !password.trim()) return 'أدخل كلمة مرور أولية للحساب.';
  if (current === 3 && password) { const problem = passwordProblem(password, draft.username); if (problem) return problem; }
  if (current === 4 && draft.fixedOverride && fixedSalaryText.trim() === '') return 'أدخل الراتب القطعي. اكتب 0 بنفسك إذا كانت القيمة المقصودة صفراً.';
  if (current === 4 && (!Number.isSafeInteger(draft.fixedSalary) || draft.fixedSalary < 0 || (draft.dailyRateOverride !== null && (!Number.isSafeInteger(draft.dailyRateOverride) || draft.dailyRateOverride < 0)))) return 'قيم الراتب واليومية يجب أن تكون أعداداً صحيحة تساوي صفراً أو أكثر.';
  return '';
  }
