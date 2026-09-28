'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, Clock3, LockKeyhole, Plus, QrCode, Users } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Skeleton, StatCard } from '@/components/ui';
import { getOpenWorkday } from '@/lib/attendance';
import { date, monthLabel, time } from '@/lib/format';
import { DEMO_MONTH } from '@/lib/mock-data';
import { getDaySummary } from '@/components/attendance/day-helpers';
import { WorkdayEditor } from '@/components/attendance/day-dialogs';
import styles from '@/components/attendance/attendance.module.css';

function AttendanceHub() {
  const { data, session } = useDemo();
  const query = useSearchParams();
  const router = useRouter();
  const [opening, setOpening] = useState(query.get('open') === 'new');
  const [month, setMonth] = useState(DEMO_MONTH);
  const [state, setState] = useState('');
  const currentOpen = getOpenWorkday(data.workdays);
  const monthDays = data.workdays.filter(day => day.date.startsWith(month));
  const days = monthDays.filter(day => !state || day.state === state).sort((a, b) => b.date.localeCompare(a.date));
  const unresolved = monthDays.reduce((sum, day) => sum + getDaySummary(data, day).unresolved, 0);
  const present = monthDays.reduce((sum, day) => sum + getDaySummary(data, day).present, 0);
  const hasDepartments = data.departments.some(dep => dep.active);
  const hasEmployees = data.employees.some(employee => employee.active);
  return <div className="page-stack">
    <PageHeader eyebrow="تنظيم الدوام ومتابعة الفريق" title="الحضور" description="كل يوم في مكان واحد؛ افتح الدوام، تابع فريقك، وأكمل المراجعة." actions={<><Link className="button-link" href="/attendance-display"><QrCode size={18} />شاشة الحضور</Link><Button onClick={() => setOpening(true)}><Plus size={18} />فتح يوم حضور جديد</Button></>} />
    <div className="stats-grid"><StatCard label="إجمالي أيام الحضور" value={monthDays.length} hint={monthLabel(month)} icon={<CalendarDays size={20} />} /><StatCard label="اليوم المفتوح" value={currentOpen ? date(currentOpen.date) : 'لا يوجد'} hint={currentOpen ? 'يوم واحد مفتوح في النظام' : 'ابدأ بعد تجهيز فريقك'} icon={<Clock3 size={20} />} /><StatCard label="حالات تحتاج المراجعة" value={unresolved} hint="تُحسم يدوياً قبل إغلاق اليوم" icon={<Users size={20} />} /><StatCard label="سجلات الحضور" value={present} hint={monthLabel(month)} /></div>
    {currentOpen && <div className={styles.currentDayBanner}><div><Badge tone="success">مفتوح الآن</Badge><strong>{date(currentOpen.date)}</strong><span className="muted">بدء الدوام <b dir="ltr">{time(currentOpen.startTime)}</b></span></div><Link href={`/attendance/${currentOpen.id}`} className="button-link">الذهاب إلى اليوم المفتوح<ChevronLeft size={16} /></Link></div>}
    <Card title="أيام الحضور" description="افتح أي يوم لمراجعة الحضور وتعديل إعداداته من صفحته." action={<div className="inline"><Input type="month" aria-label="شهر الحضور" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /><Select aria-label="حالة اليوم" value={state} onChange={event => setState(event.target.value)}><option value="">كل الأيام</option><option value="OPEN">مفتوح</option><option value="CLOSED">مغلق</option></Select></div>}>
      {!data.workdays.length ? <EmptyState title="لا توجد أيام حضور حتى الآن." description={!hasDepartments ? 'ابدأ بإضافة قسم، ثم أضف الموظفين لفتح أول يوم حضور.' : !hasEmployees ? 'أضف موظفاً نشطاً إلى أحد الأقسام لبدء تسجيل الحضور.' : 'فريقك جاهز. افتح أول يوم وحدد وقت الدوام والموظفين المشاركين.'} action={!hasDepartments ? session?.role === 'SUPER_ADMIN' ? <Link className="button-link" href="/departments">إضافة قسم</Link> : <span className="muted">راجع المدير العام لإضافة قسم.</span> : !hasEmployees ? <Link className="button-link" href="/employees">إضافة موظف</Link> : <Button onClick={() => setOpening(true)}>فتح أول يوم حضور</Button>} /> : !days.length ? <EmptyState title="لا توجد أيام مطابقة" description="غيّر الشهر أو حالة اليوم لعرض سجلات الحضور." action={<Button variant="secondary" onClick={() => { setState(''); setMonth(data.workdays.toSorted((a, b) => b.date.localeCompare(a.date))[0].date.slice(0, 7)); }}>عرض أحدث أيام الحضور</Button>} /> : <div className={styles.dayList}>{days.map(day => {
        const summary = getDaySummary(data, day);
        const archived = data.months.some(item => item.month === day.date.slice(0, 7) && item.state === 'ARCHIVED');
        return <article key={day.id}><Link href={`/attendance/${day.id}`} className={styles.dayCard} aria-label={`تفاصيل حضور ${date(day.date)}`}><div className={styles.dayCardTop}><div className={styles.calendarTile}><span>{day.date.slice(8)}</span><small>{monthLabel(day.date.slice(0, 7)).split(' ')[0]}</small></div><div className={styles.workdayInfo}><div className="inline"><h3>{date(day.date)}</h3><Badge tone={day.state === 'OPEN' ? 'success' : 'neutral'}>{day.state === 'OPEN' ? 'مفتوح' : 'مغلق'}</Badge>{archived && <Badge><LockKeyhole size={12} />مؤرشف</Badge>}</div><p>بدء الدوام <b dir="ltr">{time(day.startTime)}</b></p><span className="muted">{day.departmentIds.map(id => data.departments.find(dep => dep.id === id)?.name).filter(Boolean).join('، ') || 'اختيارات فردية'}</span></div><ChevronLeft size={19} className={styles.dayCardArrow} /></div><div className={styles.dayCardMetrics}><span><b>{summary.expected}</b>متوقع</span><span><b>{summary.present}</b>حاضر</span><span><b>{summary.excused}</b>غياب بعذر</span><span><b>{summary.unexcused}</b>غياب بدون عذر</span><span><b>{summary.late}</b>متأخر</span><span className={summary.unresolved ? 'text-brand' : ''}><b>{summary.unresolved}</b>غير محسوم</span></div></Link></article>;
      })}</div>}
    </Card>
    {opening && <WorkdayEditor onClose={() => setOpening(false)} onSaved={day => router.push(`/attendance/${day.id}`)} />}
  </div>;
}

export default function AttendancePage() { return <Suspense fallback={<div className="page-stack"><Skeleton /><Skeleton /></div>}><AttendanceHub /></Suspense>; }
