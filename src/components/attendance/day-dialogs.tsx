'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { assertCanOpenWorkday, getOpenWorkday, getLatenessSeconds, isExpected } from '@/lib/attendance';
import { date } from '@/lib/format';
import { DEMO_TODAY } from '@/lib/mock-data';
import type { Workday } from '@/lib/types';
import { canEditDay, getDaySummary } from './day-helpers';
import styles from './attendance.module.css';

const emptyForm = (): Workday => ({ id: '', date: DEMO_TODAY, startTime: '14:00:00', departmentIds: [], overrides: {}, state: 'OPEN' });

export function OpenDayBlock({ day, reopening = false, onClose }: { day: Workday; reopening?: boolean; onClose: () => void }) {
  return <div className={styles.openDayBlock}><CalendarClock size={30} /><h3>يوجد يوم حضور مفتوح حالياً.</h3><p>{reopening ? 'أغلق اليوم المفتوح قبل إعادة فتح يوم آخر.' : 'يجب إغلاقه قبل فتح يوم حضور جديد.'}</p><Badge tone="success">{date(day.date)}</Badge><Link className="button-link" href={`/attendance/${day.id}`} onClick={onClose}>الذهاب إلى اليوم المفتوح</Link></div>;
}

export function WorkdayEditor({ day, onClose, onSaved }: { day?: Workday; onClose: () => void; onSaved?: (day: Workday) => void }) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const [form, setForm] = useState<Workday>(() => day ? structuredClone(day) : emptyForm());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const currentOpen = getOpenWorkday(data.workdays);
  const monthState = data.months.find(item => item.month === form.date.slice(0, 7))?.state;
  const activeDepartments = data.departments.filter(dep => dep.active || form.departmentIds.includes(dep.id));
  const employees = data.employees.filter(employee => (employee.active || Boolean(day && data.attendance.some(record => record.employeeId === employee.id && record.workdayId === day.id))) && employee.startDate <= form.date && (!employee.endDate || employee.endDate >= form.date));
  const needsDepartment = !day && !activeDepartments.length;
  const needsEmployee = !day && !data.employees.some(employee => employee.active);
  const needsReason = Boolean(day || form.date < DEMO_TODAY || monthState === 'REOPENED');

  function save() {
    setError('');
    try {
      if (!day) assertCanOpenWorkday(data.workdays);
      if (!form.date || !form.startTime) throw new Error('حدد تاريخ يوم الحضور ووقت بدء الدوام.');
      if (data.workdays.some(item => item.date === form.date && item.id !== form.id)) throw new Error('يوجد يوم حضور بهذا التاريخ. افتحه من سجل الحضور لتعديله.');
      if (!canEditDay(data, session, form)) throw new Error('يجب إعادة فتح الشهر المؤرشف بواسطة المدير الأعلى أولاً.');
      if (needsReason && !reason.trim()) throw new Error('اكتب سبب التعديل لحفظه في سجل العمليات.');
      if (!day && !data.employees.some(employee => isExpected(employee, form))) throw new Error('لا يوجد موظفون مؤهلون ضمن الاختيارات. اختر قسماً يضم موظفين نشطين أو أدرج موظفاً مناسباً للتاريخ.');
      if (!form.departmentIds.length && !Object.values(form.overrides).includes('INCLUDE')) throw new Error('اختر قسماً مشاركاً أو أدرج موظفاً واحداً على الأقل.');
      const updated: Workday = { ...form, id: form.id || crypto.randomUUID(), startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime, createdBy: day ? day.createdBy : session?.name, createdAt: day ? day.createdAt : new Date().toISOString() };
      updateData(draft => {
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
      }, { action: day ? 'تعديل يوم حضور' : 'فتح يوم حضور', entity: 'يوم حضور', entityId: updated.id, oldValues: day ? { date: day.date, startTime: day.startTime, departmentIds: day.departmentIds, overrides: day.overrides } : {}, newValues: { date: updated.date, startTime: updated.startTime, departmentIds: updated.departmentIds, overrides: updated.overrides, reason } });
      toast(day ? 'تم تعديل يوم الحضور وتحديث سجلات المعاينة المرتبطة.' : 'تم فتح يوم الحضور في المعاينة.'); onClose(); onSaved?.(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ يوم الحضور.'); }
  }

  return <Dialog open onClose={onClose} title={day ? 'تعديل يوم الحضور' : 'فتح يوم حضور جديد'} description="وقت بدء الدوام يطبق على جميع المشاركين في هذا اليوم." wide>
    {!day && currentOpen ? <OpenDayBlock day={currentOpen} onClose={onClose} /> : needsDepartment ? <EmptyState title="أضف قسماً أولاً" description={session?.role === 'SUPER_ADMIN' ? 'أنشئ أول قسم ثم أضف الموظفين لبدء تسجيل الحضور.' : 'اطلب من المدير العام إنشاء قسم قبل فتح يوم حضور.'} action={session?.role === 'SUPER_ADMIN' ? <Link className="button-link" href="/departments" onClick={onClose}>الأقسام</Link> : undefined} /> : needsEmployee ? <EmptyState title="لا يوجد موظفون مؤهلون للحضور" description="أضف موظفاً نشطاً إلى أحد الأقسام أولاً، ثم افتح يوم حضور." action={<Link className="button-link" href="/employees" onClick={onClose}>إضافة موظف</Link>} /> : <form onSubmit={event => { event.preventDefault(); save(); }} className="stack">
      <div className="form-grid"><Field label="التاريخ" required><Input type="date" required value={form.date} readOnly={Boolean(day)} onChange={event => setForm({ ...form, date: event.target.value })} /></Field><Field label="وقت بدء الدوام" required hint="دون فترة سماح. التأخير إحصائي فقط ولا ينتج عنه خصم تلقائي."><Input type="time" step="1" required value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} /></Field></div>
      {!employees.length && <div className="notice notice-warning">لا يوجد موظفون مؤهلون في هذا التاريخ. راجع تاريخ المباشرة أو اختر تاريخاً آخر.</div>}
      <fieldset className={styles.fieldset}><legend>الأقسام المشاركة</legend><div className={styles.departmentChoices}>{activeDepartments.map(dep => <label key={dep.id} className={styles.checkChoice}><input type="checkbox" checked={form.departmentIds.includes(dep.id)} onChange={event => setForm({ ...form, departmentIds: event.target.checked ? [...form.departmentIds, dep.id] : form.departmentIds.filter(id => id !== dep.id) })} /><span>{dep.name}</span></label>)}</div></fieldset>
      <details className={styles.overrides}><summary>تخصيص مشاركة الموظفين <span className="muted">({Object.keys(form.overrides).length} تخصيص)</span></summary><p className="muted">اختيار الموظف يتقدم على اختيار القسم. المستثنى لا يحتسب غائباً.</p><div className={styles.overrideList}>{employees.map(employee => <div className={styles.overrideRow} key={employee.id}><div><strong>{employee.name}</strong><small className="muted">{data.departments.find(dep => dep.id === employee.departmentId)?.name}</small></div><Select aria-label={`مشاركة ${employee.name}`} value={form.overrides[employee.id] ?? ''} onChange={event => { const overrides = { ...form.overrides }; if (event.target.value) overrides[employee.id] = event.target.value as 'INCLUDE' | 'EXCLUDE'; else delete overrides[employee.id]; setForm({ ...form, overrides }); }}><option value="">حسب القسم</option><option value="INCLUDE">إدراج في الدوام</option><option value="EXCLUDE">مستثنى / لا يوجد دوام</option></Select></div>)}</div></details>
      {day && <div className="notice notice-warning">تغيير المشاركين يحدث حالات الحضور المرتبطة. تغيير وقت البدء يعيد احتساب التأخير، وتحفظ العملية وسببها في سجل العمليات.</div>}
      {needsReason && <Field label="سبب التعديل" required><Textarea required value={reason} onChange={event => setReason(event.target.value)} placeholder="وضح سبب تعديل اليوم أو فتح تاريخ سابق" /></Field>}
      {monthState === 'REOPENED' && <div className="notice notice-warning">هذا الشهر مؤرشف سابقاً. يحفظ التعديل على السجلات، وتبقى الرواتب والتقارير على نسختها السابقة حتى إعادة الاحتساب الصريحة من صفحة الرواتب بالقواعد المؤرشفة.</div>}
      {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button type="submit" disabled={!day && !employees.length}>{day ? 'حفظ التعديل' : 'فتح يوم الحضور'}</Button><Button variant="secondary" onClick={onClose}>إلغاء</Button></div>
    </form>}
  </Dialog>;
}

export function DayStateDialog({ day, onClose, onReview }: { day: Workday; onClose: () => void; onReview: () => void }) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const currentOpen = getOpenWorkday(data.workdays);
  const blockedByOther = day.state === 'CLOSED' && currentOpen && currentOpen.id !== day.id;
  const summary = getDaySummary(data, day);
  function changeState() {
    if (!canEditDay(data, session, day)) { setError('هذا اليوم محمي ضمن الشهر المؤرشف.'); return; }
    if (day.state === 'OPEN' && summary.unresolved) return;
    if (day.state === 'CLOSED' && !reason.trim()) { setError('اكتب سبب إعادة فتح اليوم.'); return; }
    try {
      if (day.state === 'CLOSED') assertCanOpenWorkday(data.workdays, day.id);
      const state = day.state === 'OPEN' ? 'CLOSED' : 'OPEN';
      updateData(draft => { if (state === 'OPEN') assertCanOpenWorkday(draft.workdays, day.id); const item = draft.workdays.find(item => item.id === day.id); if (item) item.state = state; }, { action: state === 'CLOSED' ? 'إغلاق يوم حضور' : 'إعادة فتح يوم حضور', entity: 'يوم حضور', entityId: day.id, oldValues: { state: day.state }, newValues: { state, reason } });
      onClose(); toast(state === 'CLOSED' ? 'تم إغلاق يوم الحضور في المعاينة.' : 'تمت إعادة فتح يوم الحضور في المعاينة.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة اليوم.'); }
  }
  return <Dialog open onClose={onClose} title={day.state === 'OPEN' ? 'إغلاق يوم الحضور' : 'إعادة فتح يوم الحضور'}>
    {blockedByOther && currentOpen ? <OpenDayBlock day={currentOpen} reopening onClose={onClose} /> : day.state === 'OPEN' && summary.unresolved > 0 ? <div className="stack"><div className="notice notice-warning">لا يمكن إغلاق يوم الحضور. يوجد {summary.unresolved} موظفين لم يتم تحديد حالتهم بعد.</div><Button onClick={() => { onClose(); onReview(); }}>مراجعة الحالات غير المحسومة</Button></div> : <div className="stack"><p>{day.state === 'OPEN' ? 'اكتملت مراجعة الحالات. سيغلق استقبال الحضور لهذا اليوم، وتبقى التعديلات الإدارية متاحة مع حفظ أسبابها.' : 'سيعاد فتح هذا اليوم للمراجعة واستقبال الحضور.'}</p>{day.state === 'CLOSED' && <Field label="سبب إعادة الفتح" required><Textarea value={reason} onChange={event => setReason(event.target.value)} /></Field>}{error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button onClick={changeState}>{day.state === 'OPEN' ? 'تأكيد إغلاق اليوم' : 'إعادة فتح اليوم'}</Button><Button variant="secondary" onClick={onClose}>إلغاء</Button></div></div>}
  </Dialog>;
}
