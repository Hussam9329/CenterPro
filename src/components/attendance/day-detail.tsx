'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock3, QrCode, Settings2, SlidersHorizontal, Users } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui';
import { statusLabel } from '@/lib/attendance';
import { date, duration, time } from '@/lib/format';
import styles from '@/components/attendance/attendance.module.css';

import { attendanceStatuses as statuses, getDayRows, getDaySummary } from './day-helpers';
import { useAttendanceReview } from './use-attendance-review';
import { AttendanceReviewDialog } from './attendance-review-dialog';
import { AttendanceRecords } from './attendance-records';
import { DayStateDialog, WorkdayEditor } from './day-dialogs';

export function AttendanceDayDetail({ dayId }: { dayId: string }) {
  const query = useSearchParams();
  const router = useRouter();
  const { data } = useDemo();
  const review = useAttendanceReview(dayId);
  const { day, monthRecord, locked, pending } = review;
  const [editDay, setEditDay] = useState(false);
  const [transition, setTransition] = useState(false);
  const [status, setStatus] = useState(query.get('status') || '');
  const [department, setDepartment] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [page, setPage] = useState(1);
  const rows = useMemo(() => day ? getDayRows(data, day) : [], [data, day]);
  const filtered = rows.filter(row => (!department || row.employee.departmentId === department) && (!employeeFilter || row.employee.id === employeeFilter) && (!status || row.record.status === status) && (!lateOnly || row.record.latenessSeconds > 0) && (!search || `${row.employee.name} ${row.employee.code}`.toLowerCase().includes(search.toLowerCase())));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const pageRows = filtered.slice((currentPage - 1) * 12, currentPage * 12);
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
      {!filtered.length ? <EmptyState title="لا توجد سجلات مطابقة" description="أزل الفلاتر لاستعراض جميع سجلات هذا اليوم." action={<Button variant="secondary" onClick={resetFilters}>مسح الفلاتر</Button>} /> : <><AttendanceRecords rows={pageRows} departments={data.departments} review={review} /><Pagination page={currentPage} total={filtered.length} pageSize={12} onChange={setPage} /></>}
    </Card>
    {editDay && <WorkdayEditor day={day} onClose={() => setEditDay(false)} />}
    {transition && <DayStateDialog day={day} onClose={() => setTransition(false)} onReview={() => { setStatus('UNRESOLVED'); setPage(1); }} />}
    <AttendanceReviewDialog review={review} />
  </div>;
}
