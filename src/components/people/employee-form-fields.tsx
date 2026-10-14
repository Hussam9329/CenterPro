import type { RefCallback } from 'react';
import { ImagePlus, ShieldCheck } from 'lucide-react';
import { Avatar, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import type { Department, Employee, Role } from '@/lib/types';
import { fullPhone, phoneSuffix, telegramUsername, type DraftEmployee } from './employee-form-model';
import styles from './people.module.css';

type DraftFields = {
  draft: DraftEmployee;
  update: <K extends keyof DraftEmployee>(field: K, value: DraftEmployee[K]) => void;
};

export function EmployeePersonalFields({ draft, update, today, uploadPhoto }: DraftFields & {
  today: string;
  uploadPhoto: (file?: File) => void;
}) {
  return <>
          <div className={styles.photoUpload}><Avatar name={draft.name || 'موظف'} src={draft.photo} size={64} /><div className="stack"><label className="inline"><ImagePlus size={16} /> صورة الموظف<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="صورة الموظف" onChange={event => uploadPhoto(event.target.files?.[0])} /></label><span className={styles.mutedNote}>صورة اختيارية · JPG / PNG / WebP · حتى 1 MB</span>{draft.photo && <Button type="button" variant="ghost" onClick={() => update('photo', undefined)}>إزالة الصورة</Button>}</div></div>
          <div className="form-grid"><Field label="الاسم الكامل" required><Input value={draft.name} onChange={event => update('name', event.target.value)} autoFocus placeholder="اسم الموظف الكامل" autoComplete="name" /></Field><Field label="الجنس"><Select value={draft.gender} onChange={event => update('gender', event.target.value as Employee['gender'])}><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option></Select></Field><Field label="تاريخ الميلاد"><Input type="date" value={draft.birthDate} max={today} onChange={event => update('birthDate', event.target.value)} /></Field><Field label="التحصيل الدراسي"><Input value={draft.qualification} onChange={event => update('qualification', event.target.value)} placeholder="مثال: بكالوريوس علوم" /></Field></div>
        </>;
}

export function EmployeeContactFields({ draft, update }: DraftFields) {
  return <div className="form-grid"><Field label="رقم الهاتف" required hint="اكتب 9 أرقام فقط بعد 07."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>07</span><Input type="tel" inputMode="numeric" maxLength={9} value={phoneSuffix(draft.phone)} onChange={event => update('phone', fullPhone(event.target.value))} autoComplete="tel" placeholder="xxxxxxxxx" /></div></Field><Field label="رقم هاتف ولي الأمر" required hint="اكتب 9 أرقام فقط بعد 07."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>07</span><Input type="tel" inputMode="numeric" maxLength={9} value={phoneSuffix(draft.guardianPhone)} onChange={event => update('guardianPhone', fullPhone(event.target.value))} placeholder="xxxxxxxxx" /></div></Field><Field label="معرف تيليغرام" hint="اكتب المعرف فقط من دون @."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>@</span><Input dir="ltr" value={draft.telegram} onChange={event => update('telegram', telegramUsername(event.target.value))} placeholder="username" /></div></Field><div className="field-span-2"><Field label="العنوان / محل السكن"><Input value={draft.address} onChange={event => update('address', event.target.value)} placeholder="المحافظة، المنطقة" autoComplete="street-address" /></Field></div></div>;
}

export function EmployeeWorkFields({ draft, update, employee, departments }: DraftFields & {
  employee?: Employee;
  departments: Department[];
}) {
  return <div className="form-grid"><Field label="القسم" required><Select value={draft.departmentId} onChange={event => update('departmentId', event.target.value)}><option value="">اختر القسم</option>{departments.filter(item => item.active || item.id === employee?.departmentId).map(item => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' (غير نشط)' : ''}</option>)}</Select></Field><Field label="تاريخ المباشرة" required><Input type="date" value={draft.startDate} onChange={event => update('startDate', event.target.value)} /></Field><Field label="الرقم الوظيفي"><Input value={employee?.code ?? 'يُنشأ تلقائياً عند الحفظ'} readOnly /></Field><div className="field-span-2"><Field label="ملاحظات" hint="اختياري"><Textarea value={draft.notes} onChange={event => update('notes', event.target.value)} rows={3} placeholder="ملاحظات إدارية عن الموظف (اختياري)" /></Field></div></div>;
}

export function EmployeeAccountFields({ draft, update, employee, isSuper, saving, canModify, bindPasswordInput, changePassword }: DraftFields & {
  employee?: Employee;
  isSuper: boolean;
  saving: boolean;
  canModify: boolean;
  bindPasswordInput: RefCallback<HTMLInputElement>;
  changePassword: (value: string) => void;
}) {
  return <><div className="form-grid"><Field label="اسم المستخدم" required hint="فريد، وتسجيل الدخول لا يفرق بين الحروف الكبيرة والصغيرة."><Input dir="ltr" value={draft.username} onChange={event => update('username', event.target.value)} autoComplete="off" placeholder="AHMED21" /></Field><Field label="الصلاحية"><Select value={draft.role} disabled={!isSuper} onChange={event => update('role', event.target.value as Role)}><option value="EMPLOYEE">موظف</option>{isSuper && <><option value="ADMIN">مدير</option><option value="SUPER_ADMIN">مشرف عام</option></>}</Select></Field><div className="field-span-2"><Field label={employee ? 'كلمة المرور الجديدة' : 'كلمة المرور الأولية'} required={!employee} hint={employee ? 'اتركها فارغة للإبقاء على الحالية. 6 أحرف أو أرقام على الأقل.' : '6 أحرف أو أرقام على الأقل. لا يتم عرض كلمة المرور بعد حفظها.'}><Input type="password" disabled={saving || !canModify} ref={bindPasswordInput} autoComplete="new-password" onChange={event => changePassword(event.target.value)} /></Field></div></div>{!employee && <div className="notice" style={{ marginTop: 20 }}><ShieldCheck size={18} /><span>سيستخدم الموظف اسم المستخدم وكلمة المرور لتسجيل الدخول.</span></div>}</>;
}

export function EmployeeSalaryFields({ draft, update, departments, isSuper, fixedSalaryText, setFixedSalaryText }: DraftFields & {
  departments: Department[];
  isSuper: boolean;
  fixedSalaryText: string;
  setFixedSalaryText: (value: string) => void;
}) {
  return <><div className={styles.salaryType}><span>نوع الراتب</span><Badge tone="brand">{draft.fixedOverride || departments.find(item => item.id === draft.departmentId)?.salary.mode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</Badge></div><div className="notice"><ShieldCheck size={18} /><span>{isSuper ? 'تخصيص الراتب متاح للمشرف العام. اترك اليومية فارغة لاستخدام قيمة القسم.' : 'إعدادات الراتب محمية؛ يتولى المشرف العام تعديلها.'}</span></div><label className={styles.checkLabel}><input type="checkbox" checked={draft.fixedOverride} disabled={!isSuper} onChange={event => update('fixedOverride', event.target.checked)} />هذا الموظف راتبه قطعي</label>{draft.fixedOverride ? <div className="form-grid"><Field label="الراتب القطعي (د.ع)" required><Input type="number" min={0} step={1000} value={fixedSalaryText} placeholder="0" disabled={!isSuper} onChange={event => { setFixedSalaryText(event.target.value); update('fixedSalary', event.target.value === '' ? 0 : Number(event.target.value)); }} /></Field><Field label="قيمة اليومية الخاصة (د.ع)" hint="اختياري — تُستخدم يومية القسم عند تركه فارغاً."><Input type="number" min={0} step={1000} value={draft.dailyRateOverride ?? ''} disabled={!isSuper} placeholder="يومية القسم" onChange={event => update('dailyRateOverride', event.target.value === '' ? null : Number(event.target.value))} /></Field></div> : <p className={styles.mutedNote}>سيطبق نوع الراتب المعتمد لقسم {departments.find(item => item.id === draft.departmentId)?.name || 'الموظف'} تلقائياً.</p>}<p className={styles.mutedNote}>في أول أو آخر شهر غير مكتمل للراتب القطعي، يعتمد الأساسي على الأيام المطلوبة × اليومية. ثم تطبق الخصومات والمكافآت.</p></>;
}
