'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Clock3, LockKeyhole, Plus, QrCode, Users } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, StatCard, Textarea } from '@/components/ui';
import { isExpected, getLatenessSeconds } from '@/lib/attendance';
import { recalculateReopenedPayroll } from '@/lib/payroll';
import { date, monthLabel, time } from '@/lib/format';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import type { Workday } from '@/lib/types';
import styles from '@/components/attendance/attendance.module.css';

const emptyForm = (): Workday => ({ id: '', date: DEMO_TODAY, startTime: '14:00:00', departmentIds: [], overrides: {}, state: 'OPEN' });

export default function WorkdaysPage() {
  const { data, session, updateData } = useDemo();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [month, setMonth] = useState(DEMO_MONTH);
  const [form, setForm] = useState<Workday | null>(() => searchParams.get('open') === 'new' ? emptyForm() : null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [transition, setTransition] = useState<Workday | null>(null);
  const workdays = data.workdays.filter(day => day.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const monthState = (day: Workday) => data.months.find(item => item.month === day.date.slice(0, 7))?.state;
  const canEdit = (day: Workday) => monthState(day) !== 'ARCHIVED' && (monthState(day) !== 'REOPENED' || session?.role === 'SUPER_ADMIN');
  const counts = (day: Workday) => {
    const expected = data.employees.filter(employee => isExpected(employee, day));
    const records = data.attendance.filter(record => record.workdayId === day.id);
    const missing = expected.filter(employee => !records.some(record => record.employeeId === employee.id));
    const historicalExpected = new Set([...expected.map(employee => employee.id), ...records.filter(record => record.status !== 'EXEMPT').map(record => record.employeeId)]);
    return { expected: historicalExpected.size, present: records.filter(record => record.status === 'PRESENT').length, unresolved: records.filter(record => record.status === 'UNRESOLVED').length + missing.length };
  };
  const edit = (day?: Workday) => { setForm(day ? { ...day, departmentIds: [...day.departmentIds], overrides: { ...day.overrides } } : emptyForm()); setError(''); setReason(''); };

  function save() {
    if (!form) return;
    if (!form.date || !form.startTime) { setError('حدد تاريخ يوم الحضور ووقت بدء الدوام.'); return; }
    if (data.workdays.some(day => day.date === form.date && day.id !== form.id)) { setError('يوجد يوم حضور مفتوح أو مغلق بهذا التاريخ. افتحه من القائمة لتعديله.'); return; }
    if (!canEdit(form)) { setError('يجب إعادة فتح الشهر المؤرشف بواسطة المدير الأعلى أولاً.'); return; }
    if ((form.id || form.date < DEMO_TODAY || monthState(form) === 'REOPENED') && !reason.trim()) { setError('اكتب سبب تعديل يوم الحضور لحفظه في سجل العمليات.'); return; }
    if (!form.departmentIds.length && !Object.values(form.overrides).includes('INCLUDE')) { setError('اختر قسماً مشاركاً أو أدرج موظفاً واحداً على الأقل.'); return; }
    const updated = { ...form, id: form.id || crypto.randomUUID(), startTime: form.startTime.length === 5 ? `${form.startTime}:00` : form.startTime };
    const previous = data.workdays.find(day => day.id === form.id);
    updateData(draft => {
      const index = draft.workdays.findIndex(day => day.id === updated.id);
      if (index >= 0) draft.workdays[index] = updated; else draft.workdays.push(updated);
      for (const employee of draft.employees) {
        const record = draft.attendance.find(item => item.employeeId === employee.id && item.workdayId === updated.id);
        const eligibleDate = employee.startDate <= updated.date && (!employee.endDate || employee.endDate >= updated.date);
        const included = isExpected(employee, updated);
        const related = updated.departmentIds.includes(employee.departmentId) || Boolean(updated.overrides[employee.id]);
        if (!record && employee.active && eligibleDate && related) {
          draft.attendance.push({ id: crypto.randomUUID(), employeeId: employee.id, workdayId: updated.id, status: included ? 'UNRESOLVED' : 'EXEMPT', checkIn: null, latenessSeconds: 0, source: null, reason: reason.trim(), updatedAt: new Date().toISOString() });
        } else if (record) {
          // Current deactivation must not erase historical attendance on a time edit.
          const historyEmployee = { ...employee, active: true };
          const wasIncluded = previous ? isExpected(historyEmployee, previous) : false;
          const nowIncluded = isExpected(historyEmployee, updated);
          if (wasIncluded && !nowIncluded && record.status !== 'EXEMPT') { record.status = 'EXEMPT'; record.checkIn = null; record.latenessSeconds = 0; record.source = null; record.reason = reason.trim(); }
          else if (!wasIncluded && nowIncluded && record.status === 'EXEMPT') { record.status = 'UNRESOLVED'; record.reason = reason.trim(); }
          if (record.status === 'PRESENT' && record.checkIn) record.latenessSeconds = getLatenessSeconds(record.checkIn, updated.date, updated.startTime);
          record.updatedAt = new Date().toISOString();
        }
      }
      const reopened = draft.months.find(item => item.month === updated.date.slice(0, 7) && item.state === 'REOPENED');
      if (reopened && session?.role === 'SUPER_ADMIN') {
        for (const employeeId of Object.keys(reopened.snapshots)) reopened.snapshots[employeeId] = recalculateReopenedPayroll(draft, employeeId, reopened.month);
      }
    }, { action: previous ? 'تعديل يوم حضور' : 'فتح يوم حضور', entity: 'يوم حضور', entityId: updated.id, oldValues: previous ? { date: previous.date, startTime: previous.startTime, departmentIds: previous.departmentIds, overrides: previous.overrides } : {}, newValues: { date: updated.date, startTime: updated.startTime, departmentIds: updated.departmentIds, overrides: updated.overrides, reason } });
    setForm(null); setMonth(updated.date.slice(0, 7)); toast(previous ? 'تم تعديل يوم الحضور التجريبي وتحديث السجلات المرتبطة.' : 'تم فتح يوم الحضور التجريبي.');
  }

  function changeState() {
    if (!transition || !canEdit(transition)) return;
    if (transition.state === 'OPEN' && counts(transition).unresolved) return;
    if (transition.state === 'CLOSED' && !reason.trim()) { setError('اكتب سبب إعادة فتح اليوم.'); return; }
    const state = transition.state === 'OPEN' ? 'CLOSED' : 'OPEN';
    updateData(draft => { const item = draft.workdays.find(day => day.id === transition.id); if (item) item.state = state; }, { action: state === 'CLOSED' ? 'إغلاق يوم حضور' : 'إعادة فتح يوم حضور', entity: 'يوم حضور', entityId: transition.id, oldValues: { state: transition.state }, newValues: { state, reason } });
    setTransition(null); toast(state === 'CLOSED' ? 'تم إغلاق يوم الحضور التجريبي.' : 'تمت إعادة فتح يوم الحضور التجريبي.');
  }

  return <div className="page-stack">
    <PageHeader eyebrow="تنظيم الدوام" title="أيام العمل" description="حدد المشاركين ووقت بدء الدوام، وراجع الحالات قبل إغلاق اليوم." actions={<><Link className="button-link" href="/attendance-display"><QrCode size={18} />شاشة الحضور</Link><Button onClick={() => edit()}><Plus size={18} />فتح يوم حضور</Button></>} />
    <div className="stats-grid"><StatCard label="أيام العمل" value={workdays.length} hint={monthLabel(month)} icon={<CalendarDays size={20} />} /><StatCard label="أيام مفتوحة" value={workdays.filter(day => day.state === 'OPEN').length} icon={<Clock3 size={20} />} /><StatCard label="حالات تحتاج المراجعة" value={workdays.reduce((sum, day) => sum + counts(day).unresolved, 0)} hint="تُحسم الحالات يدوياً قبل الإغلاق" icon={<Users size={20} />} /></div>
    <Card title="سجل أيام العمل" action={<Input type="month" aria-label="شهر أيام العمل" value={month} onChange={event => setMonth(event.target.value)} />}>
      {!workdays.length ? <EmptyState title="لا توجد أيام عمل لهذا الشهر" description="افتح يوم حضور وحدد الأقسام أو الموظفين المشاركين." action={<Button onClick={() => edit()}>فتح يوم حضور</Button>} /> : <div className={styles.workdayList}>{workdays.map(day => { const stat = counts(day); const locked = !canEdit(day); return <article key={day.id} className={styles.workdayRow}>
        <div className={styles.calendarTile}><span>{day.date.slice(8)}</span><small>{monthLabel(day.date.slice(0, 7)).split(' ')[0]}</small></div>
        <div className={styles.workdayInfo}><div className="inline"><h3>{date(day.date)}</h3><Badge tone={day.state === 'OPEN' ? 'success' : 'neutral'}>{day.state === 'OPEN' ? 'مفتوح' : 'مغلق'}</Badge>{locked && <Badge><LockKeyhole size={12} />مؤرشف</Badge>}</div><p className="muted">بدء الدوام <b dir="ltr">{time(day.startTime)}</b> · {day.departmentIds.map(id => data.departments.find(dep => dep.id === id)?.name).filter(Boolean).join('، ') || 'اختيارات فردية'}</p><div className="inline"><span>{stat.present} حاضر من {stat.expected} موظف</span>{stat.unresolved > 0 && <Badge tone="warning">{stat.unresolved} غير محسوم</Badge>}</div></div>
        <div className={styles.rowActions}><Link className="button-link" href={`/attendance?date=${day.date}`}>مراجعة الحضور</Link><Button variant="ghost" disabled={locked} onClick={() => edit(day)}>تعديل</Button><Button variant="secondary" disabled={locked} onClick={() => { setTransition(day); setReason(''); setError(''); }}>{day.state === 'OPEN' ? 'إغلاق اليوم' : 'إعادة فتح'}</Button></div>
      </article>; })}</div>}
    </Card>
    <Dialog open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'تعديل يوم الحضور' : 'فتح يوم حضور'} description="يُطبق وقت بدء الدوام على جميع الموظفين المشاركين في هذا اليوم." wide>
      {form && <form onSubmit={event => { event.preventDefault(); save(); }} className="stack"><div className="form-grid"><Field label="التاريخ" required><Input type="date" required value={form.date} readOnly={Boolean(form.id)} onChange={event => setForm({ ...form, date: event.target.value })} /></Field><Field label="وقت بدء الدوام" required hint="لا توجد فترة سماح. التأخير إحصائي فقط ولا ينتج عنه خصم تلقائي."><Input type="time" step="1" required value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} /></Field></div>
        <fieldset className={styles.fieldset}><legend>الأقسام المشاركة</legend><div className={styles.departmentChoices}>{data.departments.filter(dep => dep.active || form.departmentIds.includes(dep.id)).map(dep => <label key={dep.id} className={styles.checkChoice}><input type="checkbox" checked={form.departmentIds.includes(dep.id)} onChange={event => setForm({ ...form, departmentIds: event.target.checked ? [...form.departmentIds, dep.id] : form.departmentIds.filter(id => id !== dep.id) })} /><span>{dep.name}</span></label>)}</div></fieldset>
        <details className={styles.overrides}><summary>تخصيص مشاركة الموظفين <span className="muted">({Object.keys(form.overrides).length} تخصيص)</span></summary><p className="muted">اختيار الموظف يتقدم على اختيار القسم. المستثنى لا يُحتسب غائباً.</p><div className={styles.overrideList}>{data.employees.filter(employee => employee.active && employee.startDate <= form.date && (!employee.endDate || employee.endDate >= form.date)).map(employee => <div className={styles.overrideRow} key={employee.id}><div><strong>{employee.name}</strong><small className="muted">{data.departments.find(dep => dep.id === employee.departmentId)?.name}</small></div><Select aria-label={`مشاركة ${employee.name}`} value={form.overrides[employee.id] ?? ''} onChange={event => { const overrides = { ...form.overrides }; if (event.target.value) overrides[employee.id] = event.target.value as 'INCLUDE' | 'EXCLUDE'; else delete overrides[employee.id]; setForm({ ...form, overrides }); }}><option value="">حسب القسم</option><option value="INCLUDE">إدراج في الدوام</option><option value="EXCLUDE">مستثنى / لا يوجد دوام</option></Select></div>)}</div></details>
        {form.id && <div className="notice notice-warning">تغيير المشاركين يحدّث حالات الحضور المرتبطة. تغيير وقت البدء يعيد احتساب التأخير، وتُسجل العملية للمراجعة.</div>}
        {(form.id || form.date < DEMO_TODAY || monthState(form) === 'REOPENED') && <Field label="سبب التعديل" required><Textarea required value={reason} onChange={event => setReason(event.target.value)} placeholder="وضح سبب تعديل اليوم أو فتح تاريخ سابق" /></Field>}
        {monthState(form) === 'REOPENED' && <div className="notice notice-warning">هذا الشهر مؤرشف سابقاً. حفظ التعديل إجراء صريح يؤثر في الحساب الحالي مع الاحتفاظ بالنسخة المؤرشفة.</div>}
        {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button type="submit">{form.id ? 'حفظ التعديل' : 'فتح يوم الحضور'}</Button><Button variant="secondary" onClick={() => setForm(null)}>إلغاء</Button></div>
      </form>}
    </Dialog>
    <Dialog open={Boolean(transition)} onClose={() => setTransition(null)} title={transition?.state === 'OPEN' ? 'إغلاق يوم الحضور' : 'إعادة فتح يوم الحضور'}>
      {transition && <div className="stack">{transition.state === 'OPEN' && counts(transition).unresolved > 0 ? <><div className="notice notice-warning">باقي {counts(transition).unresolved} موظفين لم يتم تحديد حالتهم. راجعهم قبل إغلاق اليوم.</div><Link className="button-link" href={`/attendance?date=${transition.date}&status=UNRESOLVED`} onClick={() => setTransition(null)}>مراجعة الحالات غير المحسومة</Link></> : <><p>{transition.state === 'OPEN' ? 'اكتملت مراجعة الحالات. سيُغلق استقبال الحضور لهذا اليوم، وتبقى التعديلات الإدارية متاحة مع سجل العمليات.' : 'سيُفتح اليوم مجدداً للمراجعة والتعديل.'}</p>{transition.state === 'CLOSED' && <Field label="سبب إعادة الفتح" required><Textarea value={reason} onChange={event => setReason(event.target.value)} /></Field>}{error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button onClick={changeState}>{transition.state === 'OPEN' ? 'تأكيد إغلاق اليوم' : 'إعادة فتح اليوم'}</Button><Button variant="secondary" onClick={() => setTransition(null)}>إلغاء</Button></div></>}</div>}
    </Dialog>
  </div>;
}
