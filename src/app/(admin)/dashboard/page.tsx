'use client';
import Link from 'next/link';
import { UsersRound, CalendarCheck2, Wallet, Clock3, Plus, ArrowLeft, CalendarPlus, Receipt, Gift, FileChartColumnIncreasing, UserRoundPlus, ClipboardCheck, ShieldCheck, ChevronLeft, Building2, CheckCircle2 } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, StatCard, Avatar, EmptyState } from '@/components/ui';
import { AttendanceBars, AttendanceGauge, PayrollTrend } from '@/components/dashboard/charts';
import { getMonthPayroll } from '@/lib/payroll';
import { money, number, time, duration, monthLabel, attendanceDateLabel } from '@/lib/format';
import { getOpenWorkday, statusLabel } from '@/lib/attendance';
import { hasSessionAccountPermission } from '@/lib/permissions';
import type { AccountPermissionFeature } from '@/lib/types';

function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { data, session, today, month: currentMonth } = useDemo();
  const day = getOpenWorkday(data.workdays);
  const activeDepartments = data.departments.filter(item => item.active);
  const activeEmployees = data.employees.filter(item => item.active);
  const canView = (feature: AccountPermissionFeature) => hasSessionAccountPermission(data, session, feature, 'view');
  const canCreate = (feature: AccountPermissionFeature) => hasSessionAccountPermission(data, session, feature, 'create');
  const setupSteps = [
    { title: 'إضافة قسم', href: '/departments', done: activeDepartments.length > 0, available: canCreate('DEPARTMENTS'), icon: Building2 },
    { title: 'إضافة موظف', href: '/employees?add=1', done: activeEmployees.length > 0, available: activeDepartments.length > 0 && canCreate('EMPLOYEES'), icon: UserRoundPlus },
    { title: 'فتح يوم حضور', href: '/attendance?open=new', done: data.workdays.length > 0, available: activeDepartments.length > 0 && activeEmployees.length > 0 && canCreate('ATTENDANCE'), icon: CalendarPlus },
  ];
  const records = data.attendance.filter(item => item.workdayId === day?.id);
  const present = records.filter(item => item.status === 'PRESENT');
  const unresolved = records.filter(item => item.status === 'UNRESOLVED');
  const absent = records.filter(item => item.status === 'EXCUSED' || item.status === 'UNEXCUSED');
  const expected = records.filter(item => item.status !== 'EXEMPT').length;
  const payroll = getMonthPayroll(data, currentMonth);
  const total = payroll.reduce((sum,item) => sum + item.finalSalary,0);
  const unpaid = payroll.filter(item => item.paymentStatus !== 'PAID');
  const adjustments = payroll.reduce((sum,item) => sum + item.otherDeductions,0);
  const bonuses = payroll.reduce((sum,item) => sum + item.bonuses,0);
  const actions = [
    {label:'فتح يوم حضور',href:'/attendance?open=new',icon:CalendarPlus, available: canCreate('ATTENDANCE')},
    {label:'إضافة موظف',href:'/employees?add=1',icon:UserRoundPlus, available: canCreate('EMPLOYEES')},
    {label:'إضافة خصم',href:'/deductions?add=1',icon:Receipt, available: canCreate('DEDUCTIONS')},
    {label:'إضافة مكافأة',href:'/bonuses?add=1',icon:Gift, available: canCreate('BONUSES')},
  ].filter(action => action.available);
  // Read-only chart inputs derived from the same records the rest of the page uses.
  const recentDays = [...data.workdays].sort((a,b) => a.date.localeCompare(b.date)).slice(-7).map(workday => {
    const dayRecords = data.attendance.filter(item => item.workdayId === workday.id);
    const dayExpected = dayRecords.filter(item => item.status !== 'EXEMPT').length;
    const dayPresent = dayRecords.filter(item => item.status === 'PRESENT').length;
    return { key: workday.id, label: `${workday.date.slice(8,10)}/${workday.date.slice(5,7)}`, value: dayExpected ? Math.round(dayPresent / dayExpected * 100) : 0, hint: `${dayPresent} من ${dayExpected}` };
  });
  const knownMonths = new Set([...data.workdays.map(item => item.date.slice(0,7)), ...data.months.map(item => item.month)]);
  const trend = currentMonth ? [-5,-4,-3,-2,-1,0].map(offset => shiftMonth(currentMonth, offset)).filter(item => item === currentMonth || knownMonths.has(item)).map(item => ({ key: item, label: monthLabel(item).replace(/ \d{4}$/, ''), value: item === currentMonth ? total : getMonthPayroll(data, item).reduce((sum,row) => sum + row.finalSalary,0) })) : [];
  const paid = payroll.length - unpaid.length;
  return <div className="page-stack dashboard-page"><header className="page-header"><div><div className="welcome-line"><span className="line"/>{attendanceDateLabel(today)}</div><h1>{data.employees.length ? `مرحباً، ${session?.name.split(' ')[0]}.` : 'مرحباً بك في CenterPro.'}</h1></div><div className="page-actions">{canView('REPORTS') && <Link className="btn btn-secondary" href="/reports"><FileChartColumnIncreasing size={17}/>عرض التقارير</Link>}{canCreate('ATTENDANCE') && <Link className="btn btn-primary" href="/attendance?open=new"><Plus size={17}/>فتح يوم حضور</Link>}</div></header>
    <div className="stats-grid"><StatCard label="الموظفون الفعّالون" value={number(data.employees.filter(e=>e.active).length)} icon={<UsersRound/>}/><StatCard label="الحاضرون اليوم" value={present.length} icon={<CalendarCheck2/>}/><StatCard label="غير محسوم" value={unresolved.length} icon={<Clock3/>}/><StatCard label="صافي رواتب الشهر" value={<>{number(total)} <small style={{fontSize:11,letterSpacing:0}}>د.ع</small></>} icon={<Wallet/>} accent/></div>
    {data.workdays.length === 0 && <Card title="البدء"><ol className="setup-guide">{setupSteps.map((step, index) => <li key={step.title} className={step.done ? 'setup-step completed' : 'setup-step'}><div className="setup-step-top"><span className="setup-step-number">{step.done ? <CheckCircle2 size={20}/> : `0${index + 1}`}</span><step.icon size={22}/></div><h3>{step.title}</h3>{step.done ? <Badge tone="success">مكتمل</Badge> : step.available ? <Link href={step.href} className="button-link">{step.title}<ArrowLeft size={15}/></Link> : <span className="muted">{index === 0 ? 'تحتاج صلاحية إضافة الأقسام' : 'أكمل الخطوة السابقة أو اطلب الصلاحية المطلوبة'}</span>}</li>)}</ol></Card>}
    <div className="dashboard-overview">
      <Card title="الحضور خلال آخر أيام الدوام" className="dashboard-chart-card" action={canView('ATTENDANCE') ? <Link className="button-link" href="/attendance">سجل الحضور<ArrowLeft size={14}/></Link> : undefined}>{recentDays.length ? <AttendanceBars points={recentDays}/> : <EmptyState title="لا توجد أيام حضور بعد."/>}</Card>
      <Card title="يوم الحضور المفتوح" action={<Badge tone={day?.state === 'OPEN' ? 'success':'neutral'}>{day?.state === 'OPEN' ? 'اليوم مفتوح' : day ? 'اليوم مغلق':'لم يُفتح اليوم'}</Badge>}>{day ? <><AttendanceGauge rate={expected ? Math.round(present.length / expected * 100) : 0} present={present.length} unresolved={unresolved.length} absent={absent.length}/><div className="card-bottom"><span className="inline">بداية الدوام <strong dir="ltr">{time(day.startTime)}</strong></span>{canView('ATTENDANCE') && <Link className="button-link" href={`/attendance/${day.id}`}>مراجعة حضور اليوم<ArrowLeft size={14}/></Link>}</div></> : <EmptyState title="لا يوجد يوم حضور مفتوح حالياً." action={canCreate('ATTENDANCE') ? <Link className="btn btn-primary" href="/attendance?open=new">فتح يوم حضور</Link> : undefined}/>}</Card>
    </div>
    <div className="dashboard-middle">
      <Card title="آخر تسجيلات الحضور" action={canView('ATTENDANCE') ? <Link className="button-link" href="/attendance">كل السجل<ArrowLeft size={14}/></Link> : undefined}><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>القسم</th><th>وقت الحضور</th><th>التأخير</th><th>الحالة</th></tr></thead><tbody>{[...present].sort((a,b)=>(b.checkIn||'').localeCompare(a.checkIn||'')).slice(0,4).map(record=>{const employee=data.employees.find(e=>e.id===record.employeeId)!;return <tr key={record.id}><td><Link href={`/employees/${employee.id}`} className="employee-cell"><Avatar name={employee.name}/><div><strong>{employee.name}</strong><span className="subtext" dir="ltr">{employee.code}</span></div></Link></td><td>{data.departments.find(d=>d.id===employee.departmentId)?.name}</td><td dir="ltr">{time(record.checkIn||'')}</td><td className={record.latenessSeconds ? 'text-brand':'muted'}>{duration(record.latenessSeconds)}</td><td><Badge tone="success">{statusLabel(record.status)}</Badge></td></tr>})}</tbody></table></div><div className="mobile-cards">{present.slice(0,4).map(record=>{const employee=data.employees.find(e=>e.id===record.employeeId)!;return <Link className="list-row" key={record.id} href={`/employees/${employee.id}`}><div className="inline"><Avatar name={employee.name}/><div><strong>{employee.name}</strong><p>{duration(record.latenessSeconds)}</p></div></div><span dir="ltr" style={{fontSize:10}}>{time(record.checkIn||'')}</span></Link>})}</div>{!present.length && <EmptyState title="لا توجد تسجيلات حضور بعد"/>}</Card>
      <Card title="اختصارات يومك"><div className="quick-actions">{actions.map(action=><Link key={action.href} className="quick-action" href={action.href}><action.icon/><span>{action.label}</span></Link>)}</div>{canView('PAYROLL') && <><div className="payroll-progress"><div className="payroll-progress-top"><span>رواتب الشهر المدفوعة</span><strong dir="ltr">{paid} / {payroll.length}</strong></div><div className="payroll-progress-track" role="img" aria-label={`تم دفع ${paid} من ${payroll.length}`}><span style={{width:`${payroll.length ? paid / payroll.length * 100 : 0}%`}}/></div></div><div className="card-bottom"><span>الرواتب</span><Link className="button-link" href="/payroll">{unpaid.length} موظفين<ChevronLeft size={14}/></Link></div></>}</Card>
    </div>
    <div className="dashboard-lower"><Card title="صافي الرواتب حسب الأشهر" action={canView('PAYROLL') ? <Link className="button-link" href="/payroll">الرواتب<ChevronLeft size={14}/></Link> : undefined}>{trend.length > 1 ? <PayrollTrend points={trend} format={money}/> : <EmptyState title="ستظهر المقارنة بعد أكثر من شهر رواتب."/>}</Card><Card title="الفريق حسب الأقسام" action={canView('DEPARTMENTS') ? <Link className="button-link" href="/departments">إدارة الأقسام<ChevronLeft size={14}/></Link>:undefined}>{!activeDepartments.length && <EmptyState title="لا توجد أقسام حتى الآن" action={canCreate('DEPARTMENTS') ? <Link href="/departments" className="button-link">إضافة قسم<ArrowLeft size={15}/></Link> : undefined}/>}<div className="department-bars">{data.departments.filter(d=>d.active).map(department=>{const count=data.employees.filter(e=>e.departmentId===department.id&&e.active).length;return <div key={department.id}><div className="department-bar-top"><span>{department.name}</span><span>{count} موظفين</span></div><div className="department-bar-track"><span style={{width:`${count / Math.max(...data.departments.map(d=>data.employees.filter(e=>e.departmentId===d.id&&e.active).length),1) * 100}%`}}/></div></div>})}</div></Card><Card title="آخر العمليات" action={canView('AUDIT_LOG') ? <Link className="button-link" href="/audit">سجل العمليات<ChevronLeft size={14}/></Link>:undefined}>{!data.audit.length && <EmptyState title="لا توجد عمليات مسجلة حتى الآن."/>}{data.audit.slice(0,4).map(item=><div className="activity-row" key={item.id}><span className="activity-dot"><ClipboardCheck size={15}/></span><div><p>{item.action}</p><small>{item.actor}</small></div><time dir="ltr">{time(item.timestamp)}</time></div>)}<div className="card-bottom"><span className="inline"><ShieldCheck size={14}/>الخصومات: <bdi dir="ltr">{money(adjustments)}</bdi></span><span>المكافآت: <bdi dir="ltr">{money(bonuses)}</bdi></span></div></Card></div>
  </div>;
}
