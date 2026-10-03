'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ImagePlus, ShieldCheck } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Avatar, Badge, Button, ConfirmDialog, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { DEMO_TODAY } from '@/lib/mock-data';
import type { Employee, Role } from '@/lib/types';
import styles from './people.module.css';

const steps = ['المعلومات الشخصية', 'معلومات الاتصال', 'معلومات العمل', 'حساب الدخول', 'إعدادات الراتب'];

type DraftEmployee = Omit<Employee, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'endDate'>;
const phoneSuffix = (value: string) => value.replace(/\D/g, '').replace(/^07/, '').slice(0, 9);
// Input values are suffixes: a suffix beginning with 07 is still nine digits.
const fullPhone = (suffix: string) => `07${suffix.replace(/\D/g, '').slice(0, 9)}`;
const telegramUsername = (value: string) => value.replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '');
function initialEmployee(employee?: Employee): DraftEmployee {
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
  return { name: '', address: '', phone: '07', guardianPhone: '07', departmentId: '', startDate: DEMO_TODAY, active: true, gender: 'MALE', birthDate: '', notes: '', qualification: '', telegram: '', username: '', role: 'EMPLOYEE', fixedOverride: false, fixedSalary: 0, dailyRateOverride: null };
}

export function EmployeeForm({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: Employee }) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftEmployee>(() => initialEmployee(employee));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [confirmSalary, setConfirmSalary] = useState(false);
  const [fixedSalaryText, setFixedSalaryText] = useState(employee ? String(employee.fixedSalary) : '');
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordProvided = useRef(false);
  const isSuper = session?.role === 'SUPER_ADMIN';
  const canModify = isSuper || !employee || employee.role === 'EMPLOYEE';
  const update = <K extends keyof DraftEmployee>(field: K, value: DraftEmployee[K]) => setDraft(previous => ({ ...previous, [field]: value }));

  const validateStep = (current: number) => {
    if (current === 0 && !draft.name.trim()) return 'اكتب الاسم الكامل للموظف.';
    if (current === 0 && draft.birthDate && draft.birthDate > DEMO_TODAY) return 'تاريخ الميلاد يجب أن يكون في الماضي.';
    if (current === 1 && !/^07\d{9}$/.test(draft.phone)) return 'رقم الهاتف مطلوب ويجب أن يتكون من 11 رقماً ويبدأ بـ 07.';
    if (current === 1 && !/^07\d{9}$/.test(draft.guardianPhone)) return 'رقم هاتف ولي الأمر مطلوب ويجب أن يتكون من 11 رقماً ويبدأ بـ 07.';
    if (current === 1 && draft.telegram && !/^[A-Za-z0-9_]+$/.test(draft.telegram)) return 'معرف تيليغرام يقبل الأحرف الإنجليزية والأرقام والشرطة السفلية فقط.';
    if (current === 2 && !data.departments.some(item => item.id === draft.departmentId && (item.active || item.id === employee?.departmentId))) return 'اختر قسماً نشطاً للموظف.';
    if (current === 2 && !draft.startDate) return 'حدد تاريخ مباشرة الموظف.';
    if (current === 3 && !draft.username.trim()) return 'اكتب اسم المستخدم الخاص بحساب الموظف.';
    if (current === 3 && /\s/.test(draft.username.trim())) return 'اسم المستخدم لا يحتوي على مسافات.';
    if (current === 3 && data.employees.some(item => item.id !== employee?.id && item.username.toLocaleLowerCase() === draft.username.trim().toLocaleLowerCase())) return 'اسم المستخدم مستخدم مسبقاً. اختر اسماً آخر.';
    if (current === 3 && !employee && !passwordProvided.current) return 'أدخل كلمة مرور أولية لتجربة إنشاء الحساب.';
    if (current === 4 && draft.fixedOverride && fixedSalaryText.trim() === '') return 'أدخل الراتب القطعي. اكتب 0 بنفسك إذا كانت القيمة المقصودة صفراً.';
    if (current === 4 && (!Number.isSafeInteger(draft.fixedSalary) || draft.fixedSalary < 0 || (draft.dailyRateOverride !== null && (!Number.isSafeInteger(draft.dailyRateOverride) || draft.dailyRateOverride < 0)))) return 'قيم الراتب واليومية يجب أن تكون أعداداً صحيحة تساوي صفراً أو أكثر.';
    return '';
  };

  const save = () => {
    if (!canModify) { setError('إدارة حسابات المسؤولين متاحة للمشرف العام فقط.'); return; }
    if (!data.departments.some(item => item.id === draft.departmentId && (item.active || item.id === employee?.departmentId))) { setError('أضف قسماً نشطاً أولاً قبل إضافة الموظفين.'); setStep(2); return; }
    const stamp = new Date().toISOString();
    const id = employee?.id ?? `employee-${crypto.randomUUID()}`;
    const nextCode = Math.max(0, ...data.employees.map(item => Number(item.code.replace('CP-', '')) || 0)) + 1;
    const updated: Employee = {
      ...draft, name: draft.name.trim(), phone: fullPhone(phoneSuffix(draft.phone)), guardianPhone: fullPhone(phoneSuffix(draft.guardianPhone)), telegram: telegramUsername(draft.telegram), username: draft.username.trim(), id,
      endDate: employee?.endDate,
      code: employee?.code ?? `CP-${String(nextCode).padStart(4, '0')}`,
      createdAt: employee?.createdAt ?? stamp, updatedAt: stamp,
      role: isSuper ? draft.role : employee?.role ?? 'EMPLOYEE',
      fixedOverride: isSuper ? draft.fixedOverride : employee?.fixedOverride ?? false,
      fixedSalary: isSuper ? draft.fixedSalary : employee?.fixedSalary ?? 0,
      dailyRateOverride: isSuper ? draft.dailyRateOverride : employee?.dailyRateOverride ?? null,
    };
    const auditProfile = (value: Employee) => { const { photo, ...fields } = value; return { ...fields, hasPhoto: Boolean(photo) }; };
    updateData(state => { const index = state.employees.findIndex(item => item.id === id); if (index >= 0) state.employees[index] = updated; else state.employees.push(updated); }, {
      action: employee ? 'تعديل بيانات موظف' : 'إضافة موظف وحساب دخول', entity: 'employee', entityId: id, employeeId: id,
      oldValues: employee ? auditProfile(employee) : {},
      newValues: auditProfile(updated),
    });
    passwordProvided.current = false;
    if (passwordRef.current) passwordRef.current.value = '';
    setConfirmSalary(false);
    toast(employee ? 'تم تحديث بيانات الموظف في المعاينة.' : 'تمت إضافة الموظف وحساب المعاينة بنجاح.');
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 3 && !employee && passwordRef.current?.value) passwordProvided.current = true;
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError('');
    if (step < steps.length - 1) { setStep(step + 1); return; }
    for (let index = 0; index < steps.length; index++) { const issue = validateStep(index); if (issue) { setStep(index); setError(issue); return; } }
    const salaryChanged = employee && (draft.fixedOverride !== employee.fixedOverride || draft.fixedSalary !== employee.fixedSalary || draft.dailyRateOverride !== employee.dailyRateOverride);
    if (salaryChanged && isSuper) setConfirmSalary(true); else save();
  };

  const uploadPhoto = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('اختر صورة بصيغة JPG أو PNG أو WebP.'); return; }
    if (file.size > 1024 * 1024) { setError('حجم صورة المعاينة يجب ألا يتجاوز 1 ميغابايت.'); return; }
    const reader = new FileReader();
    reader.onload = () => { update('photo', String(reader.result)); setError(''); };
    reader.readAsDataURL(file);
  };

  return <>
    <Dialog open={open} onClose={onClose} title={employee ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'} description={employee ? `${employee.name} · ${employee.code}` : 'بيانات الموظف وحساب دخوله في خطوات واضحة.'} wide>
      <form onSubmit={submit} noValidate>
        <div className={styles.formSteps} aria-label="خطوات بيانات الموظف">{steps.map((label, index) => <button key={label} type="button" className={styles.step} aria-current={index === step ? 'step' : undefined} onClick={() => { if (index < step || employee) { setStep(index); setError(''); } }}><span className={styles.stepNumber}>{index < step ? '✓' : index + 1}</span>{label}</button>)}</div>
        <div className={styles.formIntro}><h3>{steps[step]}</h3><p>{['ابدأ بالاسم والبيانات التي تظهر في الملف.', 'وسائل التواصل الخاصة بالموظف.', 'القسم ومعلومات المباشرة والحالة الوظيفية.', 'تسجيل الدخول يكون باسم المستخدم وكلمة المرور.', 'تطبق قوانين القسم تلقائياً ما لم تخصص راتب الموظف.'][step]}</p></div>
        {step === 0 && <>
          <div className={styles.photoUpload}><Avatar name={draft.name || 'موظف'} src={draft.photo} size={64} /><div className="stack"><label className="inline"><ImagePlus size={16} /> صورة الموظف<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="صورة الموظف" onChange={event => uploadPhoto(event.target.files?.[0])} /></label><span className={styles.mutedNote}>صورة اختيارية · JPG / PNG / WebP · حتى 1 MB</span>{draft.photo && <Button type="button" variant="ghost" onClick={() => update('photo', undefined)}>إزالة الصورة</Button>}</div></div>
          <div className="form-grid"><Field label="الاسم الكامل" required><Input value={draft.name} onChange={event => update('name', event.target.value)} autoFocus placeholder="اسم الموظف الكامل" autoComplete="name" /></Field><Field label="الجنس"><Select value={draft.gender} onChange={event => update('gender', event.target.value as Employee['gender'])}><option value="MALE">ذكر</option><option value="FEMALE">أنثى</option></Select></Field><Field label="تاريخ الميلاد"><Input type="date" value={draft.birthDate} max={DEMO_TODAY} onChange={event => update('birthDate', event.target.value)} /></Field><Field label="التحصيل الدراسي"><Input value={draft.qualification} onChange={event => update('qualification', event.target.value)} placeholder="مثال: بكالوريوس علوم" /></Field></div>
        </>}
        {step === 1 && <div className="form-grid"><Field label="رقم الهاتف" required hint="اكتب 9 أرقام فقط بعد 07."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>07</span><Input type="tel" inputMode="numeric" maxLength={9} value={phoneSuffix(draft.phone)} onChange={event => update('phone', fullPhone(event.target.value))} autoComplete="tel" placeholder="xxxxxxxxx" /></div></Field><Field label="رقم هاتف ولي الأمر" required hint="اكتب 9 أرقام فقط بعد 07."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>07</span><Input type="tel" inputMode="numeric" maxLength={9} value={phoneSuffix(draft.guardianPhone)} onChange={event => update('guardianPhone', fullPhone(event.target.value))} placeholder="xxxxxxxxx" /></div></Field><Field label="معرف تيليغرام" hint="اكتب المعرف فقط من دون @."><div className={styles.prefixedInput} dir="ltr"><span className={styles.inputPrefix}>@</span><Input dir="ltr" value={draft.telegram} onChange={event => update('telegram', telegramUsername(event.target.value))} placeholder="username" /></div></Field><div className="field-span-2"><Field label="العنوان / محل السكن"><Input value={draft.address} onChange={event => update('address', event.target.value)} placeholder="المحافظة، المنطقة" autoComplete="street-address" /></Field></div></div>}
        {step === 2 && <div className="form-grid"><Field label="القسم" required><Select value={draft.departmentId} onChange={event => update('departmentId', event.target.value)}><option value="">اختر القسم</option>{data.departments.filter(item => item.active || item.id === employee?.departmentId).map(item => <option key={item.id} value={item.id}>{item.name}{!item.active ? ' (غير نشط)' : ''}</option>)}</Select></Field><Field label="تاريخ المباشرة" required><Input type="date" value={draft.startDate} onChange={event => update('startDate', event.target.value)} /></Field><Field label="الرقم الوظيفي"><Input value={employee?.code ?? 'يُنشأ تلقائياً عند الحفظ'} readOnly /></Field><div className="field-span-2"><Field label="ملاحظات" hint="اختياري"><Textarea value={draft.notes} onChange={event => update('notes', event.target.value)} rows={3} placeholder="ملاحظات إدارية عن الموظف (اختياري)" /></Field></div></div>}
        {step === 3 && <><div className="form-grid"><Field label="اسم المستخدم" required hint="فريد، وتسجيل الدخول لا يفرق بين الحروف الكبيرة والصغيرة."><Input dir="ltr" value={draft.username} onChange={event => update('username', event.target.value)} autoComplete="off" placeholder="AHMED21" /></Field><Field label="الصلاحية"><Select value={draft.role} disabled={!isSuper} onChange={event => update('role', event.target.value as Role)}><option value="EMPLOYEE">موظف</option>{isSuper && <><option value="ADMIN">مدير</option><option value="SUPER_ADMIN">مشرف عام</option></>}</Select></Field>{!employee && <div className="field-span-2"><Field label="كلمة المرور الأولية" required hint="هذه معاينة؛ لن تُحفظ كلمة المرور أو تُستخدم لتسجيل دخول حقيقي."><Input type="password" ref={passwordRef} autoComplete="new-password" onChange={event => { passwordProvided.current = Boolean(event.target.value); }} /></Field></div>}</div><div className="notice" style={{ marginTop: 20 }}><ShieldCheck size={18} /><span>{employee ? 'يمكن تغيير كلمة المرور من تبويب «حساب الدخول» داخل ملف الموظف.' : 'تتم إضافة الملف وحساب المعاينة معاً. يستطيع الموظف الاطلاع على بياناته فقط.'}</span></div></>}
        {step === 4 && <><div className={styles.salaryType}><span>نوع الراتب</span><Badge tone="brand">{draft.fixedOverride || data.departments.find(item => item.id === draft.departmentId)?.salary.mode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</Badge></div><div className="notice"><ShieldCheck size={18} /><span>{isSuper ? 'تخصيص الراتب متاح للمشرف العام. اترك اليومية فارغة لاستخدام قيمة القسم.' : 'إعدادات الراتب محمية؛ يتولى المشرف العام تعديلها.'}</span></div><label className={styles.checkLabel}><input type="checkbox" checked={draft.fixedOverride} disabled={!isSuper} onChange={event => update('fixedOverride', event.target.checked)} />هذا الموظف راتبه قطعي</label>{draft.fixedOverride ? <div className="form-grid"><Field label="الراتب القطعي (د.ع)" required><Input type="number" min={0} step={1000} value={fixedSalaryText} placeholder="0" disabled={!isSuper} onChange={event => { setFixedSalaryText(event.target.value); update('fixedSalary', event.target.value === '' ? 0 : Number(event.target.value)); }} /></Field><Field label="قيمة اليومية الخاصة (د.ع)" hint="اختياري — تُستخدم يومية القسم عند تركه فارغاً."><Input type="number" min={0} step={1000} value={draft.dailyRateOverride ?? ''} disabled={!isSuper} placeholder="يومية القسم" onChange={event => update('dailyRateOverride', event.target.value === '' ? null : Number(event.target.value))} /></Field></div> : <p className={styles.mutedNote}>سيطبق نوع الراتب المعتمد لقسم {data.departments.find(item => item.id === draft.departmentId)?.name || 'الموظف'} تلقائياً.</p>}<p className={styles.mutedNote}>في أول أو آخر شهر غير مكتمل للراتب القطعي، يعتمد الأساسي على الأيام المطلوبة × اليومية. ثم تطبق الخصومات والمكافآت.</p></>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className="form-actions"><Button type="submit" disabled={!canModify}>{step < steps.length - 1 ? <>التالي<ArrowLeft size={16} /></> : <><Check size={16} />{employee ? 'حفظ التعديلات' : 'إضافة الموظف'}</>}</Button><Button type="button" variant="secondary" onClick={() => { if (step) { setStep(step - 1); setError(''); } else onClose(); }}>{step ? <><ArrowRight size={16} />السابق</> : 'إلغاء'}</Button></div>
      </form>
    </Dialog>
    <ConfirmDialog open={confirmSalary} onClose={() => setConfirmSalary(false)} onConfirm={save} title="تأكيد تعديل إعدادات الراتب" description="سيتم تطبيق هذا التعديل على الشهر المفتوح حالياً وإعادة احتساب الرواتب. الرواتب المؤرشفة تبقى محفوظة كما هي." confirmLabel="تأكيد وحفظ الإعدادات" />
  </>;
}

export function ResetPasswordDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { session, updateData } = useDemo();
  const toast = useToast();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!employee || (session?.role !== 'SUPER_ADMIN' && employee.role !== 'EMPLOYEE')) { setError('لا تمتلك صلاحية إدارة هذا الحساب.'); return; }
    if (!passwordRef.current?.value.trim()) { setError('أدخل كلمة المرور الجديدة.'); return; }
    updateData(() => {}, { action: 'محاكاة تغيير كلمة مرور الموظف', entity: 'employee', entityId: employee.id, employeeId: employee.id, oldValues: {}, newValues: { simulated: true } });
    passwordRef.current.value = '';
    setError('');
    toast('تمت محاكاة تغيير كلمة المرور. لم تُحفظ كلمة المرور في المعاينة.');
    onClose();
  };
  return <Dialog open={Boolean(employee)} onClose={onClose} title="تغيير كلمة المرور" description={employee ? `حساب ${employee.name} · ${employee.username}` : ''}><form onSubmit={submit}><Field label="كلمة المرور الجديدة" required hint="في هذه المعاينة لا تُحفظ كلمة المرور ولا تتغير جلسات حقيقية."><Input ref={passwordRef} type="password" autoComplete="new-password" autoFocus /></Field>{error && <p role="alert" className={styles.error}>{error}</p>}<div className="form-actions"><Button type="submit">حفظ</Button><Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button></div></form></Dialog>;
}
