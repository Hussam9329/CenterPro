'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Pencil, UserCheck, UserX } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Select, Tabs } from '@/components/ui';
import { EmployeeForm, ResetPasswordDialog } from '@/components/people/employee-form';
import { monthLabel } from '@/lib/format';
import { getEmployeePayroll } from '@/lib/payroll';
import { getLatestEvaluationSeason, getRankProgress, getSeasonLeaderboard, isCorrectionDepartmentName } from '@/lib/evaluations';
import { RankBadge } from '@/components/evaluations/rank-badge';
import evalStyles from '@/components/evaluations/evaluations.module.css';
import { EmployeeProfileDetails, EmployeeProfileAttendance, EmployeeProfilePayroll, EmployeeProfileAccount } from '@/components/people/employee-profile-tabs';
import styles from '@/components/people/people.module.css';

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const { data, session, updateData, today, month: currentMonth } = useDemo();
  const toast = useToast();
  const { mutate } = useAsyncMutation(toast);
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const employee = data.employees.find(item => item.id === params.id);
  if (!employee) return <div className="page-stack"><PageHeader title="ملف الموظف" /><Card><EmptyState title="ملف الموظف غير موجود" description="تحقق من الرابط أو عد إلى قائمة الموظفين." action={<Link className="button-link" href="/employees">العودة إلى الموظفين</Link>} /></Card></div>;
  const department = data.departments.find(item => item.id === employee.departmentId);
  const evaluationSeason = getLatestEvaluationSeason(data);
  const evaluationRows = evaluationSeason && department && isCorrectionDepartmentName(department.name) ? getSeasonLeaderboard(data, evaluationSeason.id) : [];
  const evaluationRow = evaluationRows.find(item => item.employeeId === employee.id);
  const evaluationPosition = evaluationRows.findIndex(item => item.employeeId === employee.id) + 1;
  const rankProgress = evaluationRow ? getRankProgress(evaluationRow.score) : undefined;
  const payrollMonth = data.months.find(item => item.month === month);
  const payroll = payrollMonth && payrollMonth.state !== 'OPEN' && !payrollMonth.snapshots[employee.id] ? null : getEmployeePayroll(data, employee.id, month);
  const historical = payrollMonth && payrollMonth.state !== 'OPEN' && payrollMonth.sourceSnapshot ? { ...data, ...payrollMonth.sourceSnapshot, payments: data.payments } : data;
  const attendance = historical.attendance.filter(item => item.employeeId === employee.id && historical.workdays.some(day => day.id === item.workdayId && day.date.startsWith(month))).sort((a, b) => (historical.workdays.find(day => day.id === b.workdayId)?.date ?? '').localeCompare(historical.workdays.find(day => day.id === a.workdayId)?.date ?? ''));
  const canModify = session?.role === 'SUPER_ADMIN' || employee.role === 'EMPLOYEE';
  const months = Array.from(new Set([currentMonth, ...data.months.map(item => item.month)])).sort().reverse();
  const toggle = async () => {
    if (!canModify) return;
    if (!await mutate(() => updateData(draft => { const item = draft.employees.find(person => person.id === employee.id); if (item) { const nextActive = !item.active; item.active = nextActive; item.endDate = nextActive ? undefined : today; item.updatedAt = new Date().toISOString(); } }, { action: employee.active ? 'إيقاف موظف' : 'تفعيل موظف', entity: 'employee', entityId: employee.id, employeeId: employee.id, oldValues: { active: employee.active, endDate: employee.endDate }, newValues: { active: !employee.active, endDate: employee.active ? today : undefined } }))) return;
    toast(employee.active ? 'تم إيقاف الموظف مع حفظ سجلاته.' : 'تم تفعيل الموظف.');
    setConfirmToggle(false);
  };
  return <div className="page-stack">
    <PageHeader eyebrow="الموظفون / ملف الموظف" title="ملف الموظف" actions={<Link href="/employees" className="button-link"><ArrowRight size={16} />العودة للموظفين</Link>} />
    <Card><div className={styles.profileHero}><div className={styles.person}><Avatar name={employee.name} src={employee.photo} size={76} /><div><h2 className={styles.profileName}>{employee.name}</h2><div className={styles.profileMeta}><span dir="ltr">{employee.code}</span><span>{department?.name}</span><Badge tone={employee.active ? 'success' : 'neutral'}>{employee.active ? 'نشط' : 'غير نشط'}</Badge></div></div></div><div className={styles.heroActions}><Button variant="secondary" onClick={() => setEditing(true)} disabled={!canModify}><Pencil size={16} />تعديل الملف</Button><Button variant="ghost" onClick={() => setConfirmToggle(true)} disabled={!canModify}>{employee.active ? <UserX size={16} /> : <UserCheck size={16} />}{employee.active ? 'إيقاف الموظف' : 'تفعيل الموظف'}</Button></div></div></Card>
    {evaluationRow && evaluationSeason && rankProgress && <Card title="التقييم الموسمي"><div className={evalStyles.profileRankCard}>
      <RankBadge score={evaluationRow.score} size="lg" animated showLabel={false}/>
      <div className={evalStyles.profileRankMain}><div className="inline"><strong className={evalStyles.profileRankName} dir="ltr">{rankProgress.rank.name}</strong><Badge tone="brand">{evaluationSeason.name}</Badge></div><strong className={evalStyles.profileRankPoints} dir="ltr">{evaluationRow.score} pts</strong>{rankProgress.rank.next !== null && <><div className={evalStyles.rankProgress} role="progressbar" aria-label="التقدم إلى الرتبة التالية" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rankProgress.progress} aria-valuetext={`متبقي ${rankProgress.pointsToNext} نقطة`}><span style={{width:`${rankProgress.progress}%`}}/></div><small>متبقي <bdi dir="ltr">{rankProgress.pointsToNext}</bdi> نقطة للترقية</small></>}</div>
      <div className={evalStyles.profileRankStats}><div><span>الترتيب</span><strong dir="ltr">#{evaluationPosition}</strong></div><div><span>الأوراق</span><strong dir="ltr">{evaluationRow.papers}</strong></div><div><span>الامتحانات</span><strong dir="ltr">{evaluationRow.examsEvaluated}</strong></div><div><span>الدورات</span><strong dir="ltr">{evaluationRow.cyclesEvaluated}</strong></div><div><span>أيام الحضور</span><strong dir="ltr">{evaluationRow.attendanceDays}</strong></div><div><span>متوسط اليوم</span><strong dir="ltr">{evaluationRow.averagePapersPerDay === null ? '—' : evaluationRow.averagePapersPerDay.toFixed(1)}</strong></div><div><span>أخطاء التصحيح</span><strong dir="ltr">{evaluationRow.correctionErrors}</strong></div><div><span>أخطاء السلوك</span><strong dir="ltr">{evaluationRow.behaviorErrors}</strong></div><div><span>معدل الدقة</span><strong dir="ltr">{evaluationRow.accuracy === null ? '—' : `${evaluationRow.accuracy.toFixed(2)} / 100`}</strong></div></div>
      <Link className="button-link" href={evaluationSeason.state === 'ARCHIVED' ? `/evaluations/seasons?season=${encodeURIComponent(evaluationSeason.id)}#season-${encodeURIComponent(evaluationSeason.id)}` : '/evaluations/seasons'}>Leaderboard الموسم</Link>
    </div></Card>}
    <Tabs value={tab} onChange={setTab} items={[{ value: 'profile', label: 'البيانات الشخصية' }, { value: 'attendance', label: 'سجل الحضور' }, { value: 'payroll', label: 'الراتب والمستحقات' }, { value: 'account', label: 'حساب الدخول' }]} />
    {tab === 'profile' && <EmployeeProfileDetails employee={employee} department={department} />}
    {(tab === 'attendance' || tab === 'payroll') && <div className="toolbar"><h2 style={{ fontSize: 18, margin: 0 }}>{tab === 'attendance' ? 'حضور الموظف' : 'تفاصيل الراتب'}</h2><Select aria-label="الشهر" value={month} onChange={event => setMonth(event.target.value)} style={{ maxWidth: 220 }}>{months.map(item => <option key={item} value={item}>{monthLabel(item)}</option>)}</Select></div>}
    {tab === 'attendance' && <EmployeeProfileAttendance payroll={payroll} attendance={attendance} workdays={historical.workdays} />}
    {tab === 'payroll' && <EmployeeProfilePayroll payroll={payroll} historical={historical} payments={data.payments} employee={employee} month={month} />}
    {tab === 'account' && <EmployeeProfileAccount employee={employee} canModify={canModify} onPassword={() => setPassword(true)} />}
    {editing && <EmployeeForm key={employee.id} employee={employee} open onClose={() => setEditing(false)} />}
    <ResetPasswordDialog employee={password ? employee : null} onClose={() => setPassword(false)} />
    <ConfirmDialog open={confirmToggle} onClose={() => setConfirmToggle(false)} onConfirm={toggle} title={employee.active ? 'تأكيد إيقاف الموظف' : 'تفعيل الموظف'} description={employee.active ? 'سيتم إيقاف الموظف وتسجيل تاريخ انتهاء العمل بتاريخ اليوم، مع الاحتفاظ بملفه وسجلاته السابقة كاملة.' : 'سيتم تفعيل الموظف وإلغاء تاريخ انتهاء العمل الحالي مع الاحتفاظ برقمه الوظيفي وسجلاته السابقة.'} confirmLabel={employee.active ? 'إيقاف الموظف' : 'تفعيل الموظف'} danger={employee.active} />
  </div>;
}
