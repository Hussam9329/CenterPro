'use client';

import { useState } from 'react';
import { CalendarCheck, Clock3, UserRoundX } from 'lucide-react';
import { Badge, Card, EmptyState, Field, Input, PageHeader, Pagination, Select, Skeleton, StatCard } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import { monthSource } from '@/components/finance/finance-data';
import { DEMO_MONTH } from '@/lib/mock-data';
import { getMonthPayroll } from '@/lib/payroll';
import { statusLabel } from '@/lib/attendance';
import { date, duration, money, monthLabel, time } from '@/lib/format';
import type { AttendanceStatus } from '@/lib/types';

const statuses: AttendanceStatus[] = ['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT'];
const tone = (status: AttendanceStatus) => status === 'PRESENT' ? 'success' as const : status === 'UNEXCUSED' ? 'danger' as const : status === 'UNRESOLVED' ? 'warning' as const : 'neutral' as const;

export default function EmployeeAttendancePage() {
  const { data, session, ready } = useDemo();
  const [month, setMonth] = useState(DEMO_MONTH);
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  if (!ready || !session) return <div className="page-stack"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-card" /></div>;
  if (session.role !== 'EMPLOYEE') return null;
  const employee = data.employees.find(item => item.id === session.employeeId);
  if (!employee?.active) return <EmptyState title="حسابك غير فعال حالياً" description="يرجى مراجعة إدارة المركز." />;
  const source = monthSource(data, month);
  const result = getMonthPayroll(data, month).find(item => item.employeeId === session.employeeId);
  const period = data.months.find(item => item.month === month);
  const rows = source.attendance.filter(item => item.employeeId === session.employeeId).map(record => ({ record, workday: source.workdays.find(item => item.id === record.workdayId) })).filter(item => item.workday?.date.startsWith(month) && (status === 'ALL' || item.record.status === status)).sort((a, b) => b.workday!.date.localeCompare(a.workday!.date));
  const pageSize = 8;
  const visiblePage = Math.max(1, Math.min(page, Math.ceil(rows.length / pageSize)));
  const pageRows = rows.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const financialEffect = (recordStatus: AttendanceStatus) => recordStatus === 'EXCUSED' ? <bdi dir="ltr" className="amount">−{money(result?.dailyRate ?? 0)}</bdi> : recordStatus === 'UNEXCUSED' ? <bdi dir="ltr" className="amount">−{money(result?.salaryConfig.unexcusedRate ?? 0)}</bdi> : recordStatus === 'PRESENT' ? 'يُحتسب ضمن الحضور' : 'بدون خصم';
  return <div className="page-stack">
    <PageHeader eyebrow="مساحتك الشخصية" title="سجل حضوري" description="راجع أيام حضورك وغيابك ووقت الدخول والأثر المالي لكل غياب." actions={<Badge tone={period?.state === 'ARCHIVED' ? 'success' : 'brand'}>{period?.state === 'ARCHIVED' ? 'سجل مؤرشف' : monthLabel(month)}</Badge>} />
    <div className="grid-3"><StatCard label="الأيام المطلوبة" value={result?.requiredDays ?? 0} icon={<CalendarCheck size={20} />} /><StatCard label="أيام الحضور" value={result?.attendanceDays ?? 0} /><StatCard label="أيام الغياب" value={(result?.excusedDays ?? 0) + (result?.unexcusedDays ?? 0)} icon={<UserRoundX size={20} />} hint={`${result?.excusedDays ?? 0} بعذر · ${result?.unexcusedDays ?? 0} بدون عذر`} /><StatCard label="إجمالي التأخير" value={result?.latenessSeconds ? duration(result.latenessSeconds) : '0 ثانية'} icon={<Clock3 size={20} />} hint={`${result?.lateDays ?? 0} مرات · لا يوجد خصم تلقائي على التأخير`} /></div>
    <Card>
      <div className="filter-row"><Field label="الشهر"><Input type="month" aria-label="شهر سجل الحضور" value={month} onChange={event => { if (event.target.value) { setMonth(event.target.value); setPage(1); } }} /></Field><Field label="حالة الحضور"><Select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="ALL">كل الحالات</option>{statuses.map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}</Select></Field></div>
      {rows.length === 0 ? <EmptyState title={data.attendance.some(item => item.employeeId === session.employeeId) ? "لا توجد سجلات تطابق اختياراتك" : "لا توجد سجلات حضور حتى الآن."} description={data.attendance.some(item => item.employeeId === session.employeeId) ? "جرّب اختيار شهر آخر أو عرض جميع حالات الحضور." : "ستظهر أيام حضورك ووقت دخولك هنا بعد تسجيل أول حضور لك."} /> : <>
        <div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th scope="col">التاريخ</th><th scope="col">الحالة</th><th scope="col">وقت الدخول</th><th scope="col">التأخير</th><th scope="col">الأثر المالي</th><th scope="col">ملاحظات</th></tr></thead><tbody>{pageRows.map(({ record, workday }) => <tr key={record.id}><td><bdi>{date(workday!.date)}</bdi></td><td><Badge tone={tone(record.status)}>{statusLabel(record.status)}</Badge></td><td><bdi>{record.checkIn ? time(record.checkIn) : '—'}</bdi></td><td>{record.status === 'PRESENT' ? duration(record.latenessSeconds) : '—'}</td><td className={record.status === 'EXCUSED' || record.status === 'UNEXCUSED' ? 'amount text-danger' : 'muted'}>{financialEffect(record.status)}</td><td>{record.reason || '—'}</td></tr>)}</tbody></table></div>
        <div className="mobile-cards">{pageRows.map(({ record, workday }) => <article className="card" key={record.id}><div className="list-row"><strong><bdi>{date(workday!.date)}</bdi></strong><Badge tone={tone(record.status)}>{statusLabel(record.status)}</Badge></div><dl className="detail-grid"><div className="detail-item"><dt>وقت الدخول</dt><dd><bdi>{record.checkIn ? time(record.checkIn) : '—'}</bdi></dd></div><div className="detail-item"><dt>التأخير</dt><dd>{record.status === 'PRESENT' ? duration(record.latenessSeconds) : '—'}</dd></div><div className="detail-item"><dt>الأثر المالي</dt><dd className={record.status === 'EXCUSED' || record.status === 'UNEXCUSED' ? 'text-danger' : undefined}>{financialEffect(record.status)}</dd></div></dl>{record.reason && <p className="muted">{record.reason}</p>}</article>)}</div>
        <Pagination page={visiblePage} total={rows.length} pageSize={pageSize} onChange={setPage} />
      </>}
    </Card>
  </div>;
}
