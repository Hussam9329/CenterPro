'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Button, ConfirmDialog, Dialog } from '@/components/ui';
import { canManageEmployeeWithSession } from '@/lib/permissions';
import type { Employee } from '@/lib/types';
import { employeeFormSteps as steps, fullPhone, phoneSuffix, telegramUsername, initialEmployee, validateEmployeeStep, type DraftEmployee } from './employee-form-model';
import { EmployeePersonalFields, EmployeeContactFields, EmployeeWorkFields, EmployeeAccountFields, EmployeeSalaryFields } from './employee-form-fields';
import styles from './people.module.css';

export function EmployeeForm({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: Employee }) {
  const { data, session, systemUsername, today, backend, updateData } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftEmployee>(() => initialEmployee(today, employee));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [confirmSalary, setConfirmSalary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fixedSalaryText, setFixedSalaryText] = useState(employee ? String(employee.fixedSalary) : '');
  const passwordRef = useRef<HTMLInputElement>(null);
  // The password field unmounts on the salary step. Retain it only in memory
  // until the credential has been derived; never put it in Employee or audit data.
  const pendingPassword = useRef('');
  const pendingEmployeeId = useRef<string | null>(null);
  const savingRef = useRef(false);
  const isSuper = session?.role === 'SUPER_ADMIN';
  const canModify = canManageEmployeeWithSession(data, session, employee?.role ?? 'EMPLOYEE', employee ? 'edit' : 'create');
  const update = <K extends keyof DraftEmployee>(field: K, value: DraftEmployee[K]) => setDraft(previous => ({ ...previous, [field]: value }));

  const validateStep = (current: number) => validateEmployeeStep(current, {
    draft, today, departments: data.departments, employees: data.employees, employee,
    systemUsername, password: pendingPassword.current, fixedSalaryText,
  });

  const save = async () => {
    if (savingRef.current) return;
    if (!canModify) { setError('إدارة حسابات المسؤولين متاحة للمشرف العام فقط.'); return; }
    if (!data.departments.some(item => item.id === draft.departmentId && (item.active || item.id === employee?.departmentId))) { setError('أضف قسماً نشطاً أولاً قبل إضافة الموظفين.'); setStep(2); return; }
    const newPassword = pendingPassword.current;
    const changesPassword = newPassword.length > 0;
    if ((!employee || changesPassword) && newPassword.length < 6) { setStep(3); setError('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const stamp = new Date().toISOString();
      const id = employee?.id ?? (pendingEmployeeId.current ??= `employee-${crypto.randomUUID()}`);
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
      await updateData(state => {
        const index = state.employees.findIndex(item => item.id === id);
        if (index >= 0) {
          // Profile fields do not manage grants. Preserve the latest canonical
          // permissions, including changes made after this form was opened.
          state.employees[index] = { ...updated, permissions: state.employees[index].permissions };
        } else state.employees.push(updated);
      }, (before, after) => ({
        action: employee ? 'تعديل بيانات موظف' : 'إضافة موظف وحساب دخول', entity: 'employee', entityId: id, employeeId: id,
        oldValues: before.employees.some(item => item.id === id) ? auditProfile(before.employees.find(item => item.id === id)!) : {},
        newValues: { ...auditProfile(after.employees.find(item => item.id === id)!), ...(employee && changesPassword ? { passwordChanged: true, sessionsInvalidated: true } : {}) },
      }), changesPassword ? { password: { employeeId: id, value: newPassword } } : undefined);
      pendingPassword.current = '';
      if (passwordRef.current) passwordRef.current.value = '';
      setConfirmSalary(false);
      toast(employee ? changesPassword ? 'تم تحديث بيانات الموظف وكلمة المرور وإنهاء الجلسات السابقة للحساب.' : 'تم تحديث بيانات الموظف.' : 'تمت إضافة الموظف وحساب الدخول بنجاح.');
      onClose();
    } catch (failure) {
      setError(backend === 'neon' && failure instanceof Error ? failure.message : 'تعذر حفظ حساب الدخول. حاول مرة أخرى.');
      setStep(3);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (step === 3 && passwordRef.current) pendingPassword.current = passwordRef.current.value;
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
    <Dialog open={open} onClose={() => { if (!savingRef.current) { pendingPassword.current = ''; onClose(); } }} title={employee ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'} description={employee ? `${employee.name} · ${employee.code}` : 'بيانات الموظف وحساب دخوله في خطوات واضحة.'} wide>
      <form onSubmit={submit} noValidate>
        <div className={styles.formSteps} aria-label="خطوات بيانات الموظف">{steps.map((label, index) => <button key={label} type="button" disabled={saving} className={styles.step} aria-current={index === step ? 'step' : undefined} onClick={() => { if (index < step || employee) { setStep(index); setError(''); } }}><span className={styles.stepNumber}>{index < step ? '✓' : index + 1}</span>{label}</button>)}</div>
        <div className={styles.formIntro}><h3>{steps[step]}</h3><p>{['ابدأ بالاسم والبيانات التي تظهر في الملف.', 'وسائل التواصل الخاصة بالموظف.', 'القسم ومعلومات المباشرة والحالة الوظيفية.', 'تسجيل الدخول يكون باسم المستخدم وكلمة المرور.', 'تطبق قوانين القسم تلقائياً ما لم تخصص راتب الموظف.'][step]}</p></div>
        {step === 0 && <EmployeePersonalFields draft={draft} update={update} today={today} uploadPhoto={uploadPhoto} />}
        {step === 1 && <EmployeeContactFields draft={draft} update={update} />}
        {step === 2 && <EmployeeWorkFields draft={draft} update={update} employee={employee} departments={data.departments} />}
        {step === 3 && <EmployeeAccountFields draft={draft} update={update} employee={employee} isSuper={isSuper} saving={saving} canModify={canModify} bindPasswordInput={node => { passwordRef.current = node; if (node) node.value = pendingPassword.current; }} changePassword={value => { pendingPassword.current = value; }} />}
        {step === 4 && <EmployeeSalaryFields draft={draft} update={update} departments={data.departments} isSuper={isSuper} fixedSalaryText={fixedSalaryText} setFixedSalaryText={setFixedSalaryText} />}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className="form-actions"><Button type="submit" loading={saving} disabled={!canModify}>{step < steps.length - 1 ? <>التالي<ArrowLeft size={16} /></> : <><Check size={16} />{employee ? 'حفظ التعديلات' : 'إضافة الموظف'}</>}</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => { if (step) { setStep(step - 1); setError(''); } else { pendingPassword.current = ''; onClose(); } }}>{step ? <><ArrowRight size={16} />السابق</> : 'إلغاء'}</Button></div>
      </form>
    </Dialog>
    <ConfirmDialog open={confirmSalary} onClose={() => { if (!savingRef.current) setConfirmSalary(false); }} onConfirm={save} title="تأكيد تعديل إعدادات الراتب" description="سيتم تطبيق هذا التعديل على الشهر المفتوح حالياً وإعادة احتساب الرواتب. الرواتب المؤرشفة تبقى محفوظة كما هي." confirmLabel="تأكيد وحفظ الإعدادات" />
  </>;
}

export { ResetPasswordDialog } from './reset-password-dialog';
