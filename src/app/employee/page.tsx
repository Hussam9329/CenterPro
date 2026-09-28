'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarCheck, CircleDollarSign, Clock3, Gift, QrCode, ReceiptText, UserRoundCheck, Wallet } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import { getEmployeePayroll } from '@/lib/payroll';
import { isExpected, statusLabel } from '@/lib/attendance';
import { date, duration, money, monthLabel, time } from '@/lib/format';

export default function EmployeeHomePage() {
  const { data, session, ready } = useDemo();
  if (!ready || !session) return <div className="page-stack"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-card" /></div>;
  const employee = data.employees.find(item => item.id === session.employeeId);
  if (!employee || session.role !== 'EMPLOYEE') return null;
  if (!employee.active) return <EmptyState title="حسابك غير فعال حالياً" description="يرجى مراجعة إدارة المركز بخصوص حالة حسابك." />;
  const result = getEmployeePayroll(data, employee.id, DEMO_MONTH);
  const today = data.workdays.find(item => item.date === DEMO_TODAY);
  const todayAttendance = data.attendance.find(item => item.employeeId === employee.id && item.workdayId === today?.id);
  const expected = today ? isExpected(employee, today) : false;
  const registered = todayAttendance?.status === 'PRESENT';
  const department = data.departments.find(item => item.id === employee.departmentId);
  const recentAttendance = data.attendance.filter(item => item.employeeId === employee.id).map(record => ({ record, workday: data.workdays.find(item => item.id === record.workdayId) })).filter(item => item.workday).sort((a, b) => b.workday!.date.localeCompare(a.workday!.date)).slice(0, 5);
  const movements = [
    ...data.deductions.filter(item => item.employeeId === employee.id && item.date.startsWith(DEMO_MONTH)).map(item => ({ ...item, kind: 'deduction' as const })),
    ...data.bonuses.filter(item => item.employeeId === employee.id && item.date.startsWith(DEMO_MONTH)).map(item => ({ ...item, kind: 'bonus' as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="page-stack">
    <PageHeader eyebrow="مساحتك الشخصية" title={`مرحباً بك، ${employee.name.split(' ')[0]}`} description="موظفنا المميز في CenterPro" actions={<Badge tone="brand">{monthLabel(DEMO_MONTH)}</Badge>} />
    <section className="employee-hero" aria-label="ملخص راتبك وحضورك">
      <div className="employee-hero-main"><div className="inline"><Avatar name={employee.name} src={employee.photo} size={52} /><div><strong>{employee.name}</strong><p>{department?.name} · <bdi>{employee.code}</bdi></p></div></div><div className="employee-salary"><span>صافي راتبك المتوقع</span><strong><bdi dir="ltr">{money(result.finalSalary)}</bdi></strong><span>بعد احتساب الغياب والخصومات والمكافآت</span></div><Link href="/employee/salary" className="button-link">عرض تفاصيل الراتب <ArrowLeft size={17} /></Link></div>
      <div className="employee-hero-scan"><div className="employee-scan-icon"><QrCode size={38} strokeWidth={1.5} /></div><h2>{registered ? 'تم تسجيل حضورك اليوم' : 'سجّل حضورك بسهولة'}</h2><p>{registered ? `وقت الدخول: ${time(todayAttendance.checkIn ?? '')}` : today?.state === 'OPEN' && expected ? `دوام اليوم يبدأ ${time(today.startTime)}` : !today ? 'لم يتم فتح يوم حضور اليوم بعد.' : !expected ? 'أنت مستثنى من دوام هذا اليوم.' : 'يوم الحضور مغلق حالياً.'}</p><Link href="/employee/scan" className="btn btn-primary"><QrCode size={18} />{registered ? 'عرض حالة تسجيل الحضور' : 'تسجيل الحضور'}</Link><span className="muted">{date(DEMO_TODAY)} · بتوقيت بغداد</span></div>
    </section>
    {result.paymentStatus === 'REVIEW' && <div className="notice notice-warning" role="status"><strong>راتبك يحتاج إلى مراجعة بعد الصرف</strong><p>المصروف سابقاً <bdi dir="ltr">{money(result.paidAmount)}</bdi> · الفرق <bdi dir="ltr">{money(result.difference)}</bdi></p></div>}
    <div className="stats-grid">
      <StatCard label="أيام الحضور" value={result.attendanceDays} icon={<CalendarCheck size={20} />} hint="الحضور المسجّل هذا الشهر" />
      <StatCard label="غياب بعذر" value={result.excusedDays} icon={<UserRoundCheck size={20} />} hint={`الأثر المالي ${money(result.excusedDeduction)}`} />
      <StatCard label="غياب بدون عذر" value={result.unexcusedDays} icon={<ReceiptText size={20} />} hint={`الأثر المالي ${money(result.unexcusedDeduction)}`} />
      <StatCard label="مرات التأخير" value={result.lateDays} icon={<Clock3 size={20} />} hint={`إجمالي التأخير: ${result.latenessSeconds ? duration(result.latenessSeconds) : '0 ثانية'}`} />
    </div>
    <div className="grid-3">
      <StatCard label="راتبك الأساسي" value={money(result.baseSalary)} icon={<Wallet size={20} />} hint={result.salaryMode === 'FIXED' ? result.partialMonth ? 'راتب قطعي · شهر عمل جزئي' : 'راتب قطعي' : 'حسب شرائح قسمك'} />
      <StatCard label="الخصومات الأخرى" value={money(result.otherDeductions)} icon={<CircleDollarSign size={20} />} hint="أسباب جميع الخصومات متاحة في كشفك" />
      <StatCard label="المكافآت" value={money(result.bonuses)} icon={<Gift size={20} />} hint="تُضاف إلى صافي راتبك" />
    </div>
    <div className="grid-2">
      <Card title="حضورك الأخير" description="آخر سجلات الحضور الخاصة بك" action={<Link href="/employee/attendance" className="button-link">عرض الكل <ArrowLeft size={16} /></Link>}>
        {recentAttendance.length ? <div className="stack">{recentAttendance.map(({ record, workday }) => <div className="list-row" key={record.id}><div><strong><bdi>{date(workday!.date)}</bdi></strong><p className="muted">{record.checkIn ? time(record.checkIn) : record.status === 'UNRESOLVED' ? 'بانتظار تحديد الحالة' : 'لا يوجد وقت دخول'}</p></div><Badge tone={record.status === 'PRESENT' ? 'success' : record.status === 'UNEXCUSED' ? 'danger' : record.status === 'UNRESOLVED' ? 'warning' : 'neutral'}>{statusLabel(record.status)}</Badge></div>)}</div> : <EmptyState title="لا توجد سجلات حضور" description="سيظهر حضورك هنا بعد تسجيله." />}
      </Card>
      <Card title="حركاتك المالية" description="الخصومات والمكافآت لهذا الشهر" action={<Link href="/employee/salary" className="button-link">كشف الراتب <ArrowLeft size={16} /></Link>}>
        {movements.length ? <div className="stack">{movements.map(item => <div className="list-row" key={`${item.kind}-${item.id}`}><div><strong>{item.kind === 'bonus' ? 'مكافأة' : 'خصم'}</strong><p className="muted">{item.reason}</p><small className="muted"><bdi>{date(item.date)}</bdi></small></div><strong className={item.kind === 'deduction' ? 'amount text-danger' : 'amount'}><bdi dir="ltr">{item.kind === 'bonus' ? '+' : '−'}{money(item.amount)}</bdi></strong></div>)}</div> : <EmptyState title="لا توجد حركات مالية لهذا الشهر" description="ستظهر هنا أسباب أي مكافآت أو خصومات تُضاف إلى حسابك." />}
      </Card>
    </div>
  </div>;
}
