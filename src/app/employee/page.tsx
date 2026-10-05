'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarCheck, CircleDollarSign, Clock3, Gift, QrCode, ReceiptText, UserRoundCheck, Wallet } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { RankBadge } from '@/components/evaluations/rank-badge';
import styles from '@/components/evaluations/evaluations.module.css';
import { useDemo } from '@/components/demo-provider';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import { getEmployeePayroll } from '@/lib/payroll';
import { getOpenWorkday, isExpected, statusLabel } from '@/lib/attendance';
import { date, money, monthLabel, time } from '@/lib/format';
import { formatAccuracy, formatAveragePapers, getLatestEvaluationSeason, getRankProgress, getSeasonLeaderboard, isCorrectionEmployee } from '@/lib/evaluations';

export default function EmployeeHomePage() {
  const { data, session, ready } = useDemo();
  if (!ready || !session) return <div className="page-stack"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-card" /></div>;
  const employee = data.employees.find(item => item.id === session.employeeId);
  if (!employee || session.role !== 'EMPLOYEE') return null;
  if (!employee.active) return <EmptyState title="حسابك غير فعال حالياً" description="يرجى مراجعة إدارة المركز بخصوص حالة حسابك." />;
  const result = getEmployeePayroll(data, employee.id, DEMO_MONTH);
  const today = getOpenWorkday(data.workdays);
  const todayAttendance = data.attendance.find(item => item.employeeId === employee.id && item.workdayId === today?.id);
  const expected = today ? isExpected(employee, today) : false;
  const registered = todayAttendance?.status === 'PRESENT';
  const department = data.departments.find(item => item.id === employee.departmentId);
  const season = isCorrectionEmployee(data, employee) ? getLatestEvaluationSeason(data) : undefined;
  const seasonRows = season ? getSeasonLeaderboard(data, season.id, { publishedOnly: true }) : [];
  const seasonRow = seasonRows.find(row => row.employeeId === employee.id);
  const seasonPosition = seasonRows.findIndex(row => row.employeeId === employee.id) + 1;
  const rankProgress = getRankProgress(seasonRow?.score ?? 0);
  const recentAttendance = data.attendance.filter(item => item.employeeId === employee.id).map(record => ({ record, workday: data.workdays.find(item => item.id === record.workdayId) })).filter(item => item.workday).sort((a, b) => b.workday!.date.localeCompare(a.workday!.date)).slice(0, 5);
  const movements = [
    ...data.deductions.filter(item => item.employeeId === employee.id && item.date.startsWith(DEMO_MONTH)).map(item => ({ ...item, kind: 'deduction' as const })),
    ...data.bonuses.filter(item => item.employeeId === employee.id && item.date.startsWith(DEMO_MONTH)).map(item => ({ ...item, kind: 'bonus' as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="page-stack">
    <PageHeader title={`مرحباً بك، ${employee.name.split(' ')[0]}`} actions={<Badge tone="brand">{monthLabel(DEMO_MONTH)}</Badge>} />
    {season && seasonRow && <section className={styles.employeeSeasonCard} aria-label="ملخص تقييم الموسم">
      <RankBadge score={seasonRow?.score ?? 0} size="lg" animated showLabel={false}/>
      <div className={styles.employeeSeasonMain}><span className="eyebrow">{season.name}</span><h2 dir="ltr">{rankProgress.rank.name}</h2><strong className={styles.seasonPoints} dir="ltr">{seasonRow?.score ?? 0} pts</strong>{rankProgress.rank.next !== null ? <><div className={styles.rankProgress} role="progressbar" aria-label="التقدم إلى الرتبة التالية" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rankProgress.progress} aria-valuetext={`متبقي ${rankProgress.pointsToNext} نقطة`}><span style={{ width:`${rankProgress.progress}%` }}/></div><small>متبقي <bdi dir="ltr">{rankProgress.pointsToNext}</bdi> نقطة إلى {getRankProgress(rankProgress.rank.next).rank.name}</small></> : <small>أعلى رتبة موسمية</small>}</div>
      <div className={styles.employeeSeasonStats}><div><span>الترتيب</span><strong dir="ltr">{seasonPosition ? `#${seasonPosition}` : '—'}</strong></div><div><span>الدورات</span><strong dir="ltr">{seasonRow?.cyclesEvaluated ?? 0}</strong></div><div><span>الامتحانات</span><strong dir="ltr">{seasonRow?.examsEvaluated ?? 0}</strong></div><div><span>أيام الحضور</span><strong dir="ltr">{seasonRow?.attendanceDays ?? 0}</strong></div><div><span>متوسط اليوم</span><strong dir="ltr">{formatAveragePapers(seasonRow?.averagePapersPerDay ?? null)}</strong></div><div><span>الدقة</span><strong dir="ltr">{formatAccuracy(seasonRow?.accuracy ?? null)}</strong></div></div>
      <Link href="/employee/evaluation" className="button-link">عرض التقييمات <ArrowLeft size={16}/></Link>
    </section>}
    <section className="employee-hero" aria-label="ملخص راتبك وحضورك">
      <div className="employee-hero-main"><div className="inline"><Avatar name={employee.name} src={employee.photo} size={52} /><div><strong>{employee.name}</strong><p>{department?.name} · <bdi>{employee.code}</bdi></p></div></div><div className="employee-salary"><span>صافي راتبك المتوقع</span><strong><bdi dir="ltr">{money(result.finalSalary)}</bdi></strong><span>بعد احتساب الغياب والخصومات والمكافآت</span></div><Link href="/employee/salary" className="button-link">عرض تفاصيل الراتب <ArrowLeft size={17} /></Link></div>
      <div className="employee-hero-scan"><div className="employee-scan-icon"><QrCode size={38} strokeWidth={1.5} /></div><h2>{registered ? 'تم تسجيل حضورك لهذا اليوم' : 'سجّل حضورك بسهولة'}</h2><p>{registered ? `وقت الدخول: ${time(todayAttendance.checkIn ?? '')}` : today?.state === 'OPEN' && expected ? `يبدأ الدوام المفتوح ${time(today.startTime)}` : !today ? 'لا يوجد يوم حضور مفتوح حالياً.' : !expected ? 'أنت مستثنى من دوام هذا اليوم.' : 'يوم الحضور مغلق حالياً.'}</p><Link href="/employee/scan" className="btn btn-primary"><QrCode size={18} />{registered ? 'عرض حالة تسجيل الحضور' : 'تسجيل الحضور'}</Link><span className="muted">{date(today?.date || DEMO_TODAY)} · بتوقيت بغداد</span></div>
    </section>
    {result.paymentStatus === 'REVIEW' && <div className="notice notice-warning" role="status"><strong>راتبك يحتاج إلى مراجعة بعد الصرف</strong><p>المصروف سابقاً <bdi dir="ltr">{money(result.paidAmount)}</bdi> · الفرق <bdi dir="ltr">{money(result.difference)}</bdi></p></div>}
    <div className="stats-grid">
      <StatCard label="الأيام المطلوبة" value={result.requiredDays} icon={<CalendarCheck size={20} />} /><StatCard label="أيام الحضور" value={result.attendanceDays} />
      <StatCard label="غياب بعذر" value={result.excusedDays} icon={<UserRoundCheck size={20} />} />
      <StatCard label="غياب بدون عذر" value={result.unexcusedDays} icon={<ReceiptText size={20} />} />
      <StatCard label="مرات التأخير" value={result.lateDays} icon={<Clock3 size={20} />} />
    </div>
    <div className="grid-3">
      <StatCard label="راتبك الأساسي" value={money(result.baseSalary)} icon={<Wallet size={20} />} />
      <StatCard label="الخصومات الأخرى" value={money(result.otherDeductions)} icon={<CircleDollarSign size={20} />} />
      <StatCard label="المكافآت" value={money(result.bonuses)} icon={<Gift size={20} />} />
    </div>
    <div className="grid-2">
      <Card title="حضورك الأخير" action={<Link href="/employee/attendance" className="button-link">عرض الكل <ArrowLeft size={16} /></Link>}>
        {recentAttendance.length ? <div className="stack">{recentAttendance.map(({ record, workday }) => <div className="list-row" key={record.id}><div><strong><bdi>{date(workday!.date)}</bdi></strong><p className="muted">{record.checkIn ? time(record.checkIn) : record.status === 'UNRESOLVED' ? 'بانتظار تحديد الحالة' : 'لا يوجد وقت دخول'}</p></div><Badge tone={record.status === 'PRESENT' ? 'success' : record.status === 'UNEXCUSED' ? 'danger' : record.status === 'UNRESOLVED' ? 'warning' : 'neutral'}>{statusLabel(record.status)}</Badge></div>)}</div> : <EmptyState title="لا توجد سجلات حضور" />}
      </Card>
      <Card title="حركاتك المالية" action={<Link href="/employee/salary" className="button-link">كشف الراتب <ArrowLeft size={16} /></Link>}>
        {movements.length ? <div className="stack">{movements.map(item => <div className="list-row" key={`${item.kind}-${item.id}`}><div><strong>{item.kind === 'bonus' ? 'مكافأة' : 'خصم'}</strong><p className="muted">{item.reason}</p><small className="muted"><bdi>{date(item.date)}</bdi></small></div><strong className={item.kind === 'deduction' ? 'amount text-danger' : 'amount'}><bdi dir="ltr">{item.kind === 'bonus' ? '+' : '−'}{money(item.amount)}</bdi></strong></div>)}</div> : <EmptyState title="لا توجد حركات مالية لهذا الشهر" />}
      </Card>
    </div>
  </div>;
}
