'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Button, Dialog, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { assertCanOpenWorkday, getOpenWorkday, getLatenessSeconds, isExpected } from '@/lib/attendance';
import type { Workday } from '@/lib/types';
import { canEditDay } from './day-helpers';
import { OpenDayBlock } from './open-day-block';
import styles from './attendance.module.css';

const normalizedTime = (value: string) => value.length === 5 ? `${value}:00` : value;

const emptyForm = (today: string): Workday => ({ id: '', date: today, startTime: '15:00:00', departmentIds: [], overrides: {}, state: 'OPEN' });

export function WorkdayEditor({ day, onClose, onSaved }: { day?: Workday; onClose: () => void; onSaved?: (day: Workday) => void }) {
  const { data, session, updateData, today } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const [form, setForm] = useState<Workday>(() => day ? structuredClone(day) : emptyForm(today));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const currentOpen = getOpenWorkday(data.workdays);
  const monthState = data.months.find(item => item.month === form.date.slice(0, 7))?.state;
  const activeDepartments = data.departments.filter(dep => dep.active || form.departmentIds.includes(dep.id));
  const employees = data.employees.filter(employee => (employee.active || Boolean(day && data.attendance.some(record => record.employeeId === employee.id && record.workdayId === day.id))) && employee.startDate <= form.date && (!employee.endDate || employee.endDate >= form.date));
  const needsDepartment = !day && !activeDepartments.length;
  const needsEmployee = !day && !data.employees.some(employee => employee.active);
  // Draft changes on first creation never count as an edit. An already-saved
  // day only requires an explanation when its configuration actually changes.
  const dayChanged = Boolean(day && (
    normalizedTime(form.startTime) !== normalizedTime(day.startTime)
    || form.date !== day.date
    || JSON.stringify([...form.departmentIds].sort()) !== JSON.stringify([...day.departmentIds].sort())
    || JSON.stringify(Object.entries(form.overrides).sort()) !== JSON.stringify(Object.entries(day.overrides).sort())
  ));
  const needsReason = dayChanged;

  async function save() {
    setError('');
    try {
      if (day && !dayChanged) return;
      if (!day) assertCanOpenWorkday(data.workdays);
      if (!form.date || !form.startTime) throw new Error('حدد تاريخ يوم الحضور ووقت بدء الدوام.');
      if (data.workdays.some(item => item.date === form.date && item.id !== form.id)) throw new Error('يوجد يوم حضور بهذا التاريخ. افتحه من سجل الحضور لتعديله.');
      if (!canEditDay(data, session, form)) throw new Error('يجب إعادة فتح الشهر المؤرشف بواسطة المدير الأعلى أولاً.');
      if (needsReason && !reason.trim()) throw new Error('اكتب سبب التعديل لحفظه في سجل العمليات.');
      if (!day && !data.employees.some(employee => isExpected(employee, form))) throw new Error('لا يوجد موظفون مؤهلون ضمن الاختيارات. اختر قسماً يضم موظفين نشطين أو أدرج موظفاً مناسباً للتاريخ.');
      if (!form.departmentIds.length && !Object.values(form.overrides).includes('INCLUDE')) throw new Error('اختر قسماً مشاركاً أو أدرج موظفاً واحداً على الأقل.');
      const updated: Workday = { ...form, id: form.id || crypto.randomUUID(), startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime, createdBy: day ? day.createdBy : session?.name, createdAt: day ? day.createdAt : new Date().toISOString() };
      if (!await mutate(() => updateData(draft => {
        if (!day) assertCanOpenWorkday(draft.workdays);
        const index = draft.workdays.findIndex(item => item.id === updated.id);
        if (index >= 0) draft.workdays[index] = updated; else draft.workdays.push(updated);
        for (const employee of draft.employees) {
          const record = draft.attendance.find(item => item.employeeId === employee.id && item.workdayId === updated.id);
          const eligibleDate = employee.startDate <= updated.date && (!employee.endDate || employee.endDate >= updated.date);
          const included = isExpected(employee, updated);
          const related = updated.departmentIds.includes(employee.departmentId) || Boolean(updated.overrides[employee.id]);
          if (!record && employee.active && eligibleDate && related) {
            draft.attendance.push({ id: crypto.randomUUID(), employeeId: employee.id, workdayId: updated.id, status: included ? 'UNRESOLVED' : 'EXEMPT', checkIn: null, latenessSeconds: 0, source: null, reason: reason.trim(), updatedAt: new Date().toISOString() });
          } else if (record) {
            const historyEmployee = { ...employee, active: true };
            const wasIncluded = day ? isExpected(historyEmployee, day) : false;
            const nowIncluded = isExpected(historyEmployee, updated);
            if (wasIncluded && !nowIncluded && record.status !== 'EXEMPT') { record.status = 'EXEMPT'; record.checkIn = null; record.latenessSeconds = 0; record.source = null; record.reason = reason.trim(); }
            else if (!wasIncluded && nowIncluded && record.status === 'EXEMPT') { record.status = 'UNRESOLVED'; record.reason = reason.trim(); }
            if (record.status === 'PRESENT' && record.checkIn) record.latenessSeconds = getLatenessSeconds(record.checkIn, updated.date, updated.startTime);
            record.updatedAt = new Date().toISOString();
          }
        }
      }, { action: day ? 'تعديل يوم حضور' : 'فتح يوم حضور', entity: 'يوم حضور', entityId: updated.id, oldValues: day ? { date: day.date, startTime: day.startTime, departmentIds: day.departmentIds, overrides: day.overrides } : {}, newValues: { date: updated.date, startTime: updated.startTime, departmentIds: updated.departmentIds, overrides: updated.overrides, reason } }), setError)) return;
      toast(day ? 'تم تعديل يوم الحضور وتحديث السجلات المرتبطة.' : 'تم فتح يوم الحضور.'); onClose(); onSaved?.(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ يوم الحضور.'); }
  }

  return <Dialog open onClose={() => { if (!pending) onClose(); }} title={day ? 'تعديل يوم الحضور' : 'فتح يوم حضور جديد'} description="وقت بدء الدوام يطبق على جميع المشاركين في هذا اليوم." wide>
    {!day && currentOpen ? <OpenDayBlock day={currentOpen} onClose={onClose} /> : needsDepartment ? <EmptyState title="أضف قسماً أولاً" description={session?.role === 'SUPER_ADMIN' ? 'أنشئ أول قسم ثم أضف الموظفين لبدء تسجيل الحضور.' : 'اطلب من المدير العام إنشاء قسم قبل فتح يوم حضور.'} action={session?.role === 'SUPER_ADMIN' ? <Link className="button-link" href="/departments" onClick={onClose}>الأقسام</Link> : undefined} /> : needsEmployee ? <EmptyState title="لا يوجد موظفون مؤهلون للحضور" description="أضف موظفاً نشطاً إلى أحد الأقسام أولاً، ثم افتح يوم حضور." action={<Link className="button-link" href="/employees" onClick={onClose}>إضافة موظف</Link>} /> : <form onSubmit={event => { event.preventDefault(); save(); }} className="stack">
      <div className="form-grid"><Field label="التاريخ" required><Input type="date" required value={form.date} readOnly={Boolean(day)} onChange={event => setForm({ ...form, date: event.target.value })} /></Field><Field label="وقت بدء الدوام" required hint="دون فترة سماح. التأخير إحصائي فقط ولا ينتج عنه خصم تلقائي."><Input type="time" step="1" required value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} /></Field></div>
      {!employees.length && <div className="notice notice-warning">لا يوجد موظفون مؤهلون في هذا التاريخ. راجع تاريخ المباشرة أو اختر تاريخاً آخر.</div>}
      <fieldset className={styles.fieldset}><legend>الأقسام المشاركة</legend><div className={styles.departmentChoices}>{activeDepartments.map(dep => <label key={dep.id} className={styles.checkChoice}><input type="checkbox" checked={form.departmentIds.includes(dep.id)} onChange={event => setForm({ ...form, departmentIds: event.target.checked ? [...form.departmentIds, dep.id] : form.departmentIds.filter(id => id !== dep.id) })} /><span>{dep.name}</span></label>)}</div></fieldset>
      <details className={styles.overrides}><summary>تخصيص مشاركة الموظفين <span className="muted">({Object.keys(form.overrides).length} تخصيص)</span></summary><p className="muted">اختيار الموظف يتقدم على اختيار القسم. المستثنى لا يحتسب غائباً.</p><div className={styles.overrideList}>{employees.map(employee => <div className={styles.overrideRow} key={employee.id}><div><strong>{employee.name}</strong><small className="muted">{data.departments.find(dep => dep.id === employee.departmentId)?.name}</small></div><Select aria-label={`مشاركة ${employee.name}`} value={form.overrides[employee.id] ?? ''} onChange={event => { const overrides = { ...form.overrides }; if (event.target.value) overrides[employee.id] = event.target.value as 'INCLUDE' | 'EXCLUDE'; else delete overrides[employee.id]; setForm({ ...form, overrides }); }}><option value="">حسب القسم</option><option value="INCLUDE">إدراج في الدوام</option><option value="EXCLUDE">مستثنى / لا يوجد دوام</option></Select></div>)}</div></details>
      {day && <div className="notice notice-warning">تغيير المشاركين يحدث حالات الحضور المرتبطة. تغيير وقت البدء يعيد احتساب التأخير، وتحفظ العملية وسببها في سجل العمليات.</div>}
      {needsReason && <Field label="سبب التعديل" required><Textarea required value={reason} onChange={event => setReason(event.target.value)} placeholder="وضح سبب تعديل يوم الحضور المحفوظ" /></Field>}
      {monthState === 'REOPENED' && <div className="notice notice-warning">هذا الشهر مؤرشف سابقاً. يحفظ التعديل على السجلات، وتبقى الرواتب والتقارير على نسختها السابقة حتى إعادة الاحتساب الصريحة من صفحة الرواتب بالقواعد المؤرشفة.</div>}
      {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button loading={pending} type="submit" disabled={Boolean(day && !dayChanged) || (!day && !employees.length)}>{day ? 'حفظ التعديل' : 'فتح يوم الحضور'}</Button><Button disabled={pending} variant="secondary" onClick={onClose}>إلغاء</Button></div>
    </form>}
  </Dialog>;
}
