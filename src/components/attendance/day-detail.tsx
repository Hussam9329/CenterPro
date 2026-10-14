'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock3, QrCode, Settings2, SlidersHorizontal, Users } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from '@/components/ui';
import { getLatenessSeconds, statusLabel } from '@/lib/attendance';
import { getQuickPresentTime, getQuickReviewAction, QUICK_PRESENT_NOTE } from '@/lib/attendance-quick-review';
import { date, duration, time } from '@/lib/format';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import styles from '@/components/attendance/attendance.module.css';

import { canEditDay, getDayRows, getDaySummary, type AttendanceRow as Row } from './day-helpers';
import { DayStateDialog, WorkdayEditor } from './day-dialogs';
const statuses: AttendanceStatus[] = ['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT'];
const statusTone = (status: AttendanceStatus) => status === 'PRESENT' ? 'success' : status === 'UNRESOLVED' || status === 'EXCUSED' ? 'warning' : status === 'UNEXCUSED' ? 'danger' : 'neutral';

export function AttendanceDayDetail({ dayId }: { dayId: string }) {
  const query = useSearchParams();
  const router = useRouter();
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const day = data.workdays.find(item => item.id === dayId);
  const month = day?.date.slice(0, 7) || '';
  const [editDay, setEditDay] = useState(false);
  const [transition, setTransition] = useState(false);
  const [status, setStatus] = useState(query.get('status') || '');
  const [department, setDepartment] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = useState('14:00:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [remove, setRemove] = useState(false);
  const [quickPendingEmployeeId, setQuickPendingEmployeeId] = useState<string | null>(null);
  const monthRecord = data.months.find(item => item.month === month);
  const locked = !day || !canEditDay(data, session, day);
  const rows = useMemo(() => day ? getDayRows(data, day) : [], [data, day]);
  const filtered = rows.filter(row => (!department || row.employee.departmentId === department) && (!employeeFilter || row.employee.id === employeeFilter) && (!status || row.record.status === status) && (!lateOnly || row.record.latenessSeconds > 0) && (!search || `${row.employee.name} ${row.employee.code}`.toLowerCase().includes(search.toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const pageRows = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  function openEdit(row: Row, target: AttendanceStatus = row.record.status) {
    if (pending) return;
    setEditing(row);
    setEditStatus(target);
    setReason('');
    setError('');
    setRemove(false);
    setCheckIn(getQuickPresentTime(row.record, row.day));
  }

  // Both the full review dialog and the quick dropdown use exactly the same
  // server-validated mutation, audit trail, monthly protection and salary rules.
  async function persistRecord(
    row: Row,
    target: AttendanceStatus,
    entered: string,
    note: string,
    removing = false,
    quick = false,
  ): Promise<boolean> {
    return mutate(async () => {
      if (locked) throw new Error('هذا اليوم محمي ولا يمكن تعديل سجلاته.');
      if (monthRecord?.state === 'REOPENED' && !monthRecord.snapshots?.[row.employee.id]) {
        throw new Error('لا توجد نسخة راتب مؤرشفة لهذا الموظف في الشهر المحدد. راجع بيانات الشهر قبل التعديل.');
      }
      if (target === 'PRESENT' && !/^\d{2}:\d{2}(:\d{2})?$/.test(entered)) {
        throw new Error('حدد وقت الحضور بالدقائق والثواني.');
      }
      const enteredTime = entered.length === 5 ? `${entered}:00` : entered;
      if (target === 'PRESENT' && !Number.isFinite(Date.parse(`${row.day.date}T${enteredTime}+03:00`))) {
        throw new Error('حدد وقت حضور صالحاً.');
      }
      const timestamp = target === 'PRESENT' ? new Date(`${row.day.date}T${enteredTime}+03:00`).toISOString() : null;
      const changed: AttendanceRecord = {
        id: row.record.id || crypto.randomUUID(),
        employeeId: row.employee.id,
        workdayId: row.day.id,
        status: target,
        checkIn: timestamp,
        latenessSeconds: timestamp ? getLatenessSeconds(timestamp, row.day.date, row.day.startTime) : 0,
        source: target === 'PRESENT' ? 'MANUAL' : null,
        reason: note.trim(),
        updatedAt: new Date().toISOString(),
      };
      await updateData(draft => {
        const index = draft.attendance.findIndex(record => record.workdayId === changed.workdayId && record.employeeId === changed.employeeId);
        if (index >= 0) draft.attendance[index] = changed;
        else draft.attendance.push(changed);
        const storedDay = draft.workdays.find(item => item.id === changed.workdayId);
        if (storedDay) {
          if (target === 'EXEMPT') storedDay.overrides[changed.employeeId] = 'EXCLUDE';
          else if (storedDay.overrides[changed.employeeId] === 'EXCLUDE') storedDay.overrides[changed.employeeId] = 'INCLUDE';
        }
      }, {
        action: removing ? 'إزالة تسجيل حضور' : quick ? 'تغيير سريع لحالة الحضور' : 'تعديل حالة الحضور',
        entity: 'الحضور',
        entityId: changed.id,
        employeeId: changed.employeeId,
        oldValues: { status: row.record.status, checkIn: row.record.checkIn, latenessSeconds: row.record.latenessSeconds },
        newValues: { status: changed.status, checkIn: changed.checkIn, latenessSeconds: changed.latenessSeconds, reason: changed.reason },
      });
    }, quick ? toast : setError);
  }

  async function save(target: AttendanceStatus = editStatus) {
    if (!editing) return;
    if (!await persistRecord(editing, target, checkIn, reason, remove)) {
      // Reveal the retained review draft and its inline error if a failed
      // removal was covered by the confirmation dialog.
      if (remove) setRemove(false);
      return;
    }
    setEditing(null);
    setRemove(false);
    toast('تم تحديث سجل الحضور.');
  }

  async function quickReview(row: Row, target: AttendanceStatus) {
    if (locked || pending) return;
    const action = getQuickReviewAction(row.record.status, target);
    if (action === 'NO_CHANGE') return;
    if (action === 'DETAILS') {
      // Absences and exemptions need the existing review dialog for their
      // classification, notes and optional reasons. Nothing is saved yet.
      openEdit(row, target);
      return;
    }
    if (action === 'CONFIRM_REMOVAL') {
      openEdit(row);
      setRemove(true);
      return;
    }
    setQuickPendingEmployeeId(row.employee.id);
    try {
      const firstManualCheckIn = target === 'PRESENT' && !row.record.checkIn;
      const saved = await persistRecord(
        row, target, getQuickPresentTime(row.record, row.day),
        firstManualCheckIn ? QUICK_PRESENT_NOTE : '', false, true,
      );
      if (saved) toast(firstManualCheckIn
        ? 'تم تسجيل الحضور بوقت بدء الدوام. يمكن تغيير الوقت من «مراجعة».'
        : 'تم تحديث حالة الحضور.');
    } finally {
      setQuickPendingEmployeeId(null);
    }
  }

  function quickStatusField(row: Row) {
    if (locked) return <Badge tone={statusTone(row.record.status)}>{statusLabel(row.record.status)}</Badge>;
    return <Select
      className={styles.quickStatusSelect}
      aria-label={`تغيير حالة ${row.employee.name}`}
      title="الحضور يحفظ مباشرة بوقت بدء الدوام عند عدم وجود تسجيل سابق. الغياب والاستثناء يفتحان نافذة المراجعة."
      value={row.record.status}
      disabled={pending}
      aria-busy={pending && quickPendingEmployeeId === row.employee.id}
      onChange={event => { void quickReview(row, event.target.value as AttendanceStatus); }}
    >{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</Select>;
  }

  const resetFilters = () => { setStatus(''); setDepartment(''); setEmployeeFilter(''); setSearch(''); setLateOnly(false); setPage(1); };
  if (!day) return <div className="page-stack"><PageHeader title="يوم الحضور غير موجود" /><EmptyState title="لم يتم العثور على يوم الحضور" description="قد يكون الرابط قديماً. راجع قائمة أيام الحضور." action={<Link className="button-link" href="/attendance">العودة إلى الحضور</Link>} /></div>;
  const summary = getDaySummary(data, day);
  const openedBy = day.createdBy || data.audit.find(entry => entry.entityId === day.id && entry.action === 'فتح يوم حضور')?.actor;
  const namesFor = (mode: 'INCLUDE' | 'EXCLUDE') => Object.entries(day.overrides).filter(([, value]) => value === mode).map(([id]) => data.employees.find(employee => employee.id === id)?.name).filter(Boolean).join('، ') || 'لا يوجد';
  return <div className={`page-stack ${styles.dayDetail}`}>
    <PageHeader title={`حضور ${date(day.date)}`} actions={<><Link className="button-link" href="/attendance">الحضور</Link>{day.state === 'OPEN' && <Link className="button-link" href="/attendance-display"><QrCode size={17} />شاشة الحضور</Link>}<SafeDeleteButton collection="workdays" id={day.id} label={`يوم ${date(day.date)}`} onDeleted={() => router.replace('/attendance')} /><Button variant="secondary" disabled={locked || pending} onClick={() => setEditDay(true)}><Settings2 size={17} />تعديل اليوم</Button><Button disabled={locked || pending} onClick={() => setTransition(true)}>{day.state === 'OPEN' ? 'إغلاق اليوم' : 'إعادة فتح اليوم'}</Button></>} />
    {monthRecord?.state === 'ARCHIVED' && <div className="notice notice-warning">هذا الشهر مؤرشف وسجلاته للقراءة فقط. إعادة الفتح متاحة للمدير الأعلى من الرواتب.</div>}
    {monthRecord?.state === 'REOPENED' && <div className="notice notice-warning">هذا الشهر مؤرشف سابقاً وتمت إعادة فتحه للتعديل. تحفظ تغييرات الحضور للمراجعة، وتبقى الرواتب والتقارير على النسخة السابقة حتى إعادة الاحتساب الصريحة من صفحة الرواتب.</div>}
    <Card title="معلومات اليوم" action={<Badge tone={day.state === 'OPEN' ? 'success' : 'neutral'}>{day.state === 'OPEN' ? 'مفتوح' : 'مغلق'}</Badge>}><div className={styles.dayInformation}><div><span>بدء الدوام</span><strong dir="ltr">{time(day.startTime)}</strong></div><div><span>الأقسام المشاركة</span><strong>{day.departmentIds.map(id => data.departments.find(dep => dep.id === id)?.name).filter(Boolean).join('، ') || 'اختيارات فردية'}</strong></div>{openedBy && <div><span>فتح اليوم بواسطة</span><strong>{openedBy}</strong></div>}{day.createdAt && <div><span>تاريخ إنشاء اليوم</span><strong>{date(day.createdAt)}</strong></div>}<div><span>موظفون مدرجون بشكل فردي</span><strong>{namesFor('INCLUDE')}</strong></div><div><span>موظفون مستثنون بشكل فردي</span><strong>{namesFor('EXCLUDE')}</strong></div></div></Card>
    <div className="stats-grid"><StatCard label="الحاضرون" value={summary.present} icon={<CheckCircle2 size={20} />} /><StatCard label="غير محسوم" value={summary.unresolved} icon={<Users size={20} />} /><StatCard label="المتأخرون" value={summary.late} icon={<Clock3 size={20} />} /><StatCard label="إجمالي التأخير" value={summary.latenessSeconds ? duration(summary.latenessSeconds) : '0 ثانية'} /></div>
    <div className={styles.dayStatusStrip}><span><b>{summary.expected}</b>متوقع</span><span><b>{summary.excused}</b>غياب بعذر</span><span><b>{summary.unexcused}</b>غياب بدون عذر</span><span><b>{summary.exempt}</b>مستثنى / لا يوجد دوام</span></div>
    <Card title="حضور الموظفين" description={`${filtered.length} سجل مطابق للفلاتر`}>
      {!locked && <p className={styles.quickStatusHint}>غيّر الحالة مباشرة من القائمة. الحضور السريع يعتمد وقت بدء الدوام، والغياب يفتح المراجعة لإضافة التفاصيل.</p>}
      <div className="filter-row"><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="ابحث باسم الموظف أو رقمه" /><Select aria-label="حالة الحضور" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">كل الحالات</option>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</Select></div>
      <details className={styles.filters}><summary><SlidersHorizontal size={16} />فلاتر إضافية{(department || employeeFilter || lateOnly) && <Badge tone="brand">مفعّلة</Badge>}</summary><div className="filter-row"><Select aria-label="القسم" value={department} onChange={event => { setDepartment(event.target.value); setPage(1); }}><option value="">جميع الأقسام</option>{data.departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}</Select><Select aria-label="الموظف" value={employeeFilter} onChange={event => { setEmployeeFilter(event.target.value); setPage(1); }}><option value="">جميع الموظفين</option>{data.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select><label className={styles.checkChoice}><input type="checkbox" checked={lateOnly} onChange={event => { setLateOnly(event.target.checked); setPage(1); }} />المتأخرون فقط</label></div></details>
      {(department || employeeFilter || lateOnly) && <div className={styles.activeFilters}>{department && <Badge>{data.departments.find(dep => dep.id === department)?.name}</Badge>}{employeeFilter && <Badge>{data.employees.find(employee => employee.id === employeeFilter)?.name}</Badge>}{lateOnly && <Badge tone="warning">المتأخرون فقط</Badge>}<Button variant="ghost" onClick={resetFilters}>مسح الفلاتر</Button></div>}
      {!filtered.length ? <EmptyState title="لا توجد سجلات مطابقة" description="أزل الفلاتر لاستعراض جميع سجلات هذا اليوم." action={<Button variant="secondary" onClick={resetFilters}>مسح الفلاتر</Button>} /> : <><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>الحالة</th><th>وقت الحضور</th><th>التأخير</th><th>المصدر / آخر ملاحظة</th><th>الإجراء</th></tr></thead><tbody>{pageRows.map(row => <tr key={`${row.day.id}-${row.employee.id}`}><td><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><div className="muted">{row.employee.code} · {data.departments.find(dep => dep.id === row.employee.departmentId)?.name}</div></div></div></td><td>{quickStatusField(row)}</td><td dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</td><td>{row.record.latenessSeconds ? <span className="text-brand">{duration(row.record.latenessSeconds)}</span> : '—'}</td><td><span>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'يدوي' : '—'}</span>{row.record.reason && <p className={styles.recordNote}>{row.record.reason}</p>}</td><td><div className="inline"><Button variant="ghost" disabled={pending} onClick={() => openEdit(row)}>{locked ? 'التفاصيل' : 'مراجعة'}</Button>{row.record.id && <SafeDeleteButton collection="attendance" id={row.record.id} label={`حضور ${row.employee.name}`} compact />}</div></td></tr>)}</tbody></table></div><div className="mobile-cards">{pageRows.map(row => <article className={styles.attendanceCard} key={`${row.day.id}-${row.employee.id}`}><div className={styles.cardHeading}><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><small className="muted">{row.employee.code} · {date(row.day.date)}</small></div></div>{quickStatusField(row)}</div><div className={styles.cardMetrics}><span>الحضور <b dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</b></span><span>التأخير <b>{row.record.latenessSeconds ? duration(row.record.latenessSeconds) : '—'}</b></span></div><p className={styles.recordNote}>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'إدخال يدوي' : 'لم يسجل حضور'}{row.record.reason ? ` · ${row.record.reason}` : ''}</p><div className="inline"><Button variant="secondary" disabled={pending} onClick={() => openEdit(row)}>{locked ? 'عرض التفاصيل' : 'مراجعة الحالة'}</Button>{row.record.id && <SafeDeleteButton collection="attendance" id={row.record.id} label={`حضور ${row.employee.name}`} compact />}</div></article>)}</div><Pagination page={currentPage} total={filtered.length} pageSize={12} onChange={setPage} /></>}
    </Card>
    {editDay && <WorkdayEditor day={day} onClose={() => setEditDay(false)} />}
    {transition && <DayStateDialog day={day} onClose={() => setTransition(false)} onReview={() => { setStatus('UNRESOLVED'); setPage(1); }} />}
    <Dialog open={Boolean(editing)} onClose={() => { if (!pending) { if (remove) setRemove(false); else setEditing(null); } }} title={remove ? 'إزالة تسجيل الحضور؟' : 'مراجعة سجل الحضور'} description={remove ? 'سيُحذف وقت الحضور وتعود الحالة إلى غير محسوم. يتغير سجل الحضور ويُحفظ التعديل في سجل العمليات.' : editing ? `${editing.employee.name} · ${date(editing.day.date)}` : ''}>
      {/* One persistent dialog keeps focus and stale-form conflict protection
          intact while the confirmation temporarily hides the review draft. */}
      {remove && <div className="form-actions"><Button variant="danger" loading={pending} onClick={() => save('UNRESOLVED')}>إزالة الحضور</Button><Button variant="secondary" autoFocus disabled={pending} onClick={() => setRemove(false)}>إلغاء</Button></div>}
      {editing && <form hidden={remove} style={remove ? { display: 'none' } : undefined} className="stack" onSubmit={event => { event.preventDefault(); if (!remove) save(); }}>
        <div className="detail-grid"><div className="detail-item"><span className="muted">الحالة الحالية</span><Badge tone={statusTone(editing.record.status)}>{statusLabel(editing.record.status)}</Badge></div><div className="detail-item"><span className="muted">بدء الدوام</span><b dir="ltr">{time(editing.day.startTime)}</b></div></div>
        {editing.record.reason && <div className="notice">سبب آخر تعديل: {editing.record.reason}</div>}
        {locked ? <div className="notice notice-warning">هذا السجل محمي ضمن الشهر المؤرشف. لا يمكن تعديله قبل إعادة فتح الشهر.</div> : <>
          {editing.day.state === 'CLOSED' && <div className="notice notice-warning">هذا اليوم مغلق. سيُسجل التعديل التاريخي في سجل العمليات، ويمكنك إضافة ملاحظة اختيارية.</div>}
          <label className={styles.checkChoice}><input type="checkbox" checked={editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED'} onChange={event => setEditStatus(event.target.checked ? 'EXCUSED' : 'UNRESOLVED')} />غائب</label>
          {editStatus !== 'EXCUSED' && editStatus !== 'UNEXCUSED' && <Field label="الحالة الجديدة"><Select value={editStatus} onChange={event => setEditStatus(event.target.value as AttendanceStatus)}><option value="PRESENT">حاضر</option><option value="UNRESOLVED">غير محسوم</option><option value="EXEMPT">مستثنى / لا يوجد دوام</option></Select></Field>}
          {(editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED') && <fieldset className={styles.fieldset}><legend>نوع الغياب</legend><div className={styles.departmentChoices}><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'EXCUSED'} onChange={() => setEditStatus('EXCUSED')} />غياب بعذر</label><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'UNEXCUSED'} onChange={() => setEditStatus('UNEXCUSED')} />غياب بدون عذر</label></div></fieldset>}
          {editStatus === 'PRESENT' && <Field label="وقت الحضور" required hint="توقيت بغداد. يُعاد احتساب التأخير بالثواني دون خصم تلقائي."><Input type="time" step="1" required value={checkIn} onChange={event => setCheckIn(event.target.value)} /></Field>}
          <Field label="ملاحظة / سبب" hint="اختياري"><Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="يمكن إضافة ملاحظة توضيحية (اختياري)" /></Field>
          {monthRecord?.state === 'REOPENED' && <div className="notice notice-warning">الحفظ يعدّل سجل الحضور فقط. تطبيق التعديل على الرواتب والتقارير يتطلب إعادة الاحتساب الصريحة من صفحة الرواتب بالقواعد المؤرشفة.</div>}
          {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button loading={pending} type="submit">حفظ التعديل</Button><Button disabled={pending} variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button></div>
          {editing.record.status === 'PRESENT' && <Button variant="danger" disabled={pending} onClick={() => setRemove(true)}>إزالة تسجيل الحضور</Button>}
        </>}
      </form>}
    </Dialog>
  </div>;
}
