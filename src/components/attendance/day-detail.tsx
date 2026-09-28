'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock3, QrCode, Settings2, SlidersHorizontal, Users } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Avatar, Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select, StatCard, Textarea } from '@/components/ui';
import { getLatenessSeconds, statusLabel } from '@/lib/attendance';
import { date, duration, time } from '@/lib/format';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import styles from '@/components/attendance/attendance.module.css';

import { canEditDay, getDayRows, getDaySummary, type AttendanceRow as Row } from './day-helpers';
import { DayStateDialog, WorkdayEditor } from './day-dialogs';
const statuses: AttendanceStatus[] = ['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT'];
const statusTone = (status: AttendanceStatus) => status === 'PRESENT' ? 'success' : status === 'UNRESOLVED' || status === 'EXCUSED' ? 'warning' : status === 'UNEXCUSED' ? 'danger' : 'neutral';

export function AttendanceDayDetail({ dayId }: { dayId: string }) {
  const query = useSearchParams();
  const { data, session, updateData } = useDemo();
  const toast = useToast();
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
  const monthRecord = data.months.find(item => item.month === month);
  const locked = !day || !canEditDay(data, session, day);
  const rows = useMemo(() => day ? getDayRows(data, day) : [], [data, day]);
  const filtered = rows.filter(row => (!department || row.employee.departmentId === department) && (!employeeFilter || row.employee.id === employeeFilter) && (!status || row.record.status === status) && (!lateOnly || row.record.latenessSeconds > 0) && (!search || `${row.employee.name} ${row.employee.code}`.toLowerCase().includes(search.toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const pageRows = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  function openEdit(row: Row) {
    setEditing(row); setEditStatus(row.record.status); setReason(''); setError('');
    setCheckIn(row.record.checkIn ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(row.record.checkIn)) : row.day.startTime);
  }

  function save(target: AttendanceStatus = editStatus) {
    if (!editing || locked) return;
    if (monthRecord?.state === 'REOPENED' && !monthRecord.snapshots[editing.employee.id]) { setError('لا توجد نسخة راتب مؤرشفة لهذا الموظف في الشهر المحدد. راجع بيانات الشهر قبل التعديل.'); return; }
    if (!reason.trim()) { setError('اكتب سبب تعديل الحضور ليظهر في سجل العمليات.'); return; }
    if (target === 'PRESENT' && !/^\d{2}:\d{2}(:\d{2})?$/.test(checkIn)) { setError('حدد وقت الحضور بالدقائق والثواني.'); return; }
    const enteredTime = checkIn.length === 5 ? `${checkIn}:00` : checkIn;
    const timestamp = target === 'PRESENT' ? new Date(`${editing.day.date}T${enteredTime}+03:00`).toISOString() : null;
    const changed: AttendanceRecord = { id: editing.record.id || crypto.randomUUID(), employeeId: editing.employee.id, workdayId: editing.day.id, status: target, checkIn: timestamp, latenessSeconds: timestamp ? getLatenessSeconds(timestamp, editing.day.date, editing.day.startTime) : 0, source: target === 'PRESENT' ? 'MANUAL' : null, reason: reason.trim(), updatedAt: new Date().toISOString() };
    updateData(draft => {
      const index = draft.attendance.findIndex(record => record.workdayId === changed.workdayId && record.employeeId === changed.employeeId);
      if (index >= 0) draft.attendance[index] = changed; else draft.attendance.push(changed);
      const day = draft.workdays.find(item => item.id === changed.workdayId);
      if (day) {
        if (target === 'EXEMPT') day.overrides[changed.employeeId] = 'EXCLUDE';
        else if (day.overrides[changed.employeeId] === 'EXCLUDE') day.overrides[changed.employeeId] = 'INCLUDE';
      }
    }, { action: remove ? 'إزالة تسجيل حضور' : 'تعديل حالة الحضور', entity: 'الحضور', entityId: changed.id, employeeId: changed.employeeId, oldValues: { status: editing.record.status, checkIn: editing.record.checkIn, latenessSeconds: editing.record.latenessSeconds }, newValues: { status: changed.status, checkIn: changed.checkIn, latenessSeconds: changed.latenessSeconds, reason: changed.reason } });
    setEditing(null); setRemove(false); toast('تم تحديث سجل الحضور التجريبي وتسجيل سبب التعديل.');
  }

  const resetFilters = () => { setStatus(''); setDepartment(''); setEmployeeFilter(''); setSearch(''); setLateOnly(false); setPage(1); };
  if (!day) return <div className="page-stack"><PageHeader title="يوم الحضور غير موجود" /><EmptyState title="لم يتم العثور على يوم الحضور" description="قد يكون الرابط قديماً أو تمت إعادة ضبط بيانات المعاينة." action={<Link className="button-link" href="/attendance">العودة إلى الحضور</Link>} /></div>;
  const summary = getDaySummary(data, day);
  const openedBy = day.createdBy || data.audit.find(entry => entry.entityId === day.id && entry.action === 'فتح يوم حضور')?.actor;
  const namesFor = (mode: 'INCLUDE' | 'EXCLUDE') => Object.entries(day.overrides).filter(([, value]) => value === mode).map(([id]) => data.employees.find(employee => employee.id === id)?.name).filter(Boolean).join('، ') || 'لا يوجد';
  return <div className="page-stack">
    <PageHeader eyebrow="تفاصيل يوم الحضور" title={`حضور ${date(day.date)}`} description="إعدادات اليوم، حالات الفريق والمراجعة في مكان واحد." actions={<><Link className="button-link" href="/attendance">الحضور</Link>{day.state === 'OPEN' && <Link className="button-link" href="/attendance-display"><QrCode size={17} />شاشة الحضور</Link>}<Button variant="secondary" disabled={locked} onClick={() => setEditDay(true)}><Settings2 size={17} />تعديل اليوم</Button><Button disabled={locked} onClick={() => setTransition(true)}>{day.state === 'OPEN' ? 'إغلاق اليوم' : 'إعادة فتح اليوم'}</Button></>} />
    {monthRecord?.state === 'ARCHIVED' && <div className="notice notice-warning">هذا الشهر مؤرشف وسجلاته للقراءة فقط. إعادة الفتح متاحة للمدير الأعلى من الرواتب.</div>}
    {monthRecord?.state === 'REOPENED' && <div className="notice notice-warning">هذا الشهر مؤرشف سابقاً وتمت إعادة فتحه للتعديل. تحفظ تغييرات الحضور للمراجعة، وتبقى الرواتب والتقارير على النسخة السابقة حتى إعادة الاحتساب الصريحة من صفحة الرواتب.</div>}
    <Card title="معلومات اليوم" action={<Badge tone={day.state === 'OPEN' ? 'success' : 'neutral'}>{day.state === 'OPEN' ? 'مفتوح' : 'مغلق'}</Badge>}><div className={styles.dayInformation}><div><span>بدء الدوام</span><strong dir="ltr">{time(day.startTime)}</strong></div><div><span>الأقسام المشاركة</span><strong>{day.departmentIds.map(id => data.departments.find(dep => dep.id === id)?.name).filter(Boolean).join('، ') || 'اختيارات فردية'}</strong></div>{openedBy && <div><span>فتح اليوم بواسطة</span><strong>{openedBy}</strong></div>}{day.createdAt && <div><span>تاريخ إنشاء اليوم</span><strong>{date(day.createdAt)}</strong></div>}<div><span>موظفون مدرجون بشكل فردي</span><strong>{namesFor('INCLUDE')}</strong></div><div><span>موظفون مستثنون بشكل فردي</span><strong>{namesFor('EXCLUDE')}</strong></div></div></Card>
    <div className="stats-grid"><StatCard label="الحاضرون" value={summary.present} hint={`من ${summary.expected} موظفاً متوقعاً`} icon={<CheckCircle2 size={20} />} /><StatCard label="غير محسوم" value={summary.unresolved} hint="تحتاج المراجعة قبل إغلاق اليوم" icon={<Users size={20} />} /><StatCard label="المتأخرون" value={summary.late} hint="لا يوجد خصم تلقائي" icon={<Clock3 size={20} />} /><StatCard label="إجمالي التأخير" value={summary.latenessSeconds ? duration(summary.latenessSeconds) : '0 ثانية'} /></div>
    <div className={styles.dayStatusStrip}><span><b>{summary.expected}</b>متوقع</span><span><b>{summary.excused}</b>غياب بعذر</span><span><b>{summary.unexcused}</b>غياب بدون عذر</span><span><b>{summary.exempt}</b>مستثنى / لا يوجد دوام</span></div>
    <Card title="حضور الموظفين" description={`${filtered.length} سجل مطابق للفلاتر`}>
      <div className="filter-row"><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="ابحث باسم الموظف أو رقمه" /><Select aria-label="حالة الحضور" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">كل الحالات</option>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</Select></div>
      <details className={styles.filters}><summary><SlidersHorizontal size={16} />فلاتر إضافية{(department || employeeFilter || lateOnly) && <Badge tone="brand">مفعّلة</Badge>}</summary><div className="filter-row"><Select aria-label="القسم" value={department} onChange={event => { setDepartment(event.target.value); setPage(1); }}><option value="">جميع الأقسام</option>{data.departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}</Select><Select aria-label="الموظف" value={employeeFilter} onChange={event => { setEmployeeFilter(event.target.value); setPage(1); }}><option value="">جميع الموظفين</option>{data.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</Select><label className={styles.checkChoice}><input type="checkbox" checked={lateOnly} onChange={event => { setLateOnly(event.target.checked); setPage(1); }} />المتأخرون فقط</label></div></details>
      {(department || employeeFilter || lateOnly) && <div className={styles.activeFilters}>{department && <Badge>{data.departments.find(dep => dep.id === department)?.name}</Badge>}{employeeFilter && <Badge>{data.employees.find(employee => employee.id === employeeFilter)?.name}</Badge>}{lateOnly && <Badge tone="warning">المتأخرون فقط</Badge>}<Button variant="ghost" onClick={resetFilters}>مسح الفلاتر</Button></div>}
      {!filtered.length ? <EmptyState title="لا توجد سجلات مطابقة" description="أزل الفلاتر لاستعراض جميع سجلات هذا اليوم." action={<Button variant="secondary" onClick={resetFilters}>مسح الفلاتر</Button>} /> : <><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>الحالة</th><th>وقت الحضور</th><th>التأخير</th><th>المصدر / آخر ملاحظة</th><th>الإجراء</th></tr></thead><tbody>{pageRows.map(row => <tr key={`${row.day.id}-${row.employee.id}`}><td><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><div className="muted">{row.employee.code} · {data.departments.find(dep => dep.id === row.employee.departmentId)?.name}</div></div></div></td><td><Badge tone={statusTone(row.record.status)}>{statusLabel(row.record.status)}</Badge></td><td dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</td><td>{row.record.latenessSeconds ? <span className="text-brand">{duration(row.record.latenessSeconds)}</span> : '—'}</td><td><span>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'يدوي' : '—'}</span>{row.record.reason && <p className={styles.recordNote}>{row.record.reason}</p>}</td><td><Button variant="ghost" onClick={() => openEdit(row)}>{locked ? 'التفاصيل' : 'مراجعة'}</Button></td></tr>)}</tbody></table></div><div className="mobile-cards">{pageRows.map(row => <article className={styles.attendanceCard} key={`${row.day.id}-${row.employee.id}`}><div className={styles.cardHeading}><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><small className="muted">{row.employee.code} · {date(row.day.date)}</small></div></div><Badge tone={statusTone(row.record.status)}>{statusLabel(row.record.status)}</Badge></div><div className={styles.cardMetrics}><span>الحضور <b dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</b></span><span>التأخير <b>{row.record.latenessSeconds ? duration(row.record.latenessSeconds) : '—'}</b></span></div><p className={styles.recordNote}>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'إدخال يدوي' : 'لم يسجل حضور'}{row.record.reason ? ` · ${row.record.reason}` : ''}</p><Button variant="secondary" onClick={() => openEdit(row)}>{locked ? 'عرض التفاصيل' : 'مراجعة الحالة'}</Button></article>)}</div><Pagination page={currentPage} total={filtered.length} pageSize={12} onChange={setPage} /></>}
    </Card>
    {editDay && <WorkdayEditor day={day} onClose={() => setEditDay(false)} />}
    {transition && <DayStateDialog day={day} onClose={() => setTransition(false)} onReview={() => { setStatus('UNRESOLVED'); setPage(1); }} />}
    <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="مراجعة سجل الحضور" description={editing ? `${editing.employee.name} · ${date(editing.day.date)}` : ''}>
      {editing && <form className="stack" onSubmit={event => { event.preventDefault(); save(); }}>
        <div className="detail-grid"><div className="detail-item"><span className="muted">الحالة الحالية</span><Badge tone={statusTone(editing.record.status)}>{statusLabel(editing.record.status)}</Badge></div><div className="detail-item"><span className="muted">بدء الدوام</span><b dir="ltr">{time(editing.day.startTime)}</b></div></div>
        {editing.record.reason && <div className="notice">سبب آخر تعديل: {editing.record.reason}</div>}
        {locked ? <div className="notice notice-warning">هذا السجل محمي ضمن الشهر المؤرشف. لا يمكن تعديله قبل إعادة فتح الشهر.</div> : <>
          {editing.day.state === 'CLOSED' && <div className="notice notice-warning">هذا اليوم مغلق. سيُسجل هذا التعديل التاريخي وسببه في سجل العمليات.</div>}
          <label className={styles.checkChoice}><input type="checkbox" checked={editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED'} onChange={event => setEditStatus(event.target.checked ? 'EXCUSED' : 'UNRESOLVED')} />غائب</label>
          {editStatus !== 'EXCUSED' && editStatus !== 'UNEXCUSED' && <Field label="الحالة الجديدة"><Select value={editStatus} onChange={event => setEditStatus(event.target.value as AttendanceStatus)}><option value="PRESENT">حاضر</option><option value="UNRESOLVED">غير محسوم</option><option value="EXEMPT">مستثنى / لا يوجد دوام</option></Select></Field>}
          {(editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED') && <fieldset className={styles.fieldset}><legend>نوع الغياب</legend><div className={styles.departmentChoices}><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'EXCUSED'} onChange={() => setEditStatus('EXCUSED')} />غياب بعذر</label><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'UNEXCUSED'} onChange={() => setEditStatus('UNEXCUSED')} />غياب بدون عذر</label></div></fieldset>}
          {editStatus === 'PRESENT' && <Field label="وقت الحضور" required hint="توقيت بغداد. يُعاد احتساب التأخير بالثواني دون خصم تلقائي."><Input type="time" step="1" required value={checkIn} onChange={event => setCheckIn(event.target.value)} /></Field>}
          <Field label="سبب التعديل" required><Textarea required value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: تصحيح وقت الدخول بعد المراجعة" /></Field>
          {monthRecord?.state === 'REOPENED' && <div className="notice notice-warning">الحفظ يعدّل سجل الحضور فقط. تطبيق التعديل على الرواتب والتقارير يتطلب إعادة الاحتساب الصريحة من صفحة الرواتب بالقواعد المؤرشفة.</div>}
          {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button type="submit">حفظ التعديل</Button><Button variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button></div>
          {editing.record.status === 'PRESENT' && <Button variant="danger" onClick={() => { if (!reason.trim()) { setError('اكتب سبب إزالة الحضور أولاً.'); return; } setRemove(true); }}>إزالة تسجيل الحضور</Button>}
        </>}
      </form>}
    </Dialog>
    <ConfirmDialog open={remove} onClose={() => setRemove(false)} onConfirm={() => save('UNRESOLVED')} title="إزالة تسجيل الحضور؟" description="سيُحذف وقت الحضور وتعود الحالة إلى غير محسوم. يتغير عدد أيام الحضور في الراتب ويُحفظ سبب الإزالة في سجل العمليات." confirmLabel="إزالة الحضور" danger />
  </div>;
}
