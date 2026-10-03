'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, FileText, Target, Trophy } from 'lucide-react';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, EmptyState, PageHeader, Select, StatCard } from '@/components/ui';
import { formatAccuracy, getCycleLeaderboard, getExamLeaderboard, getExamEvaluation, getOpenEvaluationCycle, isCorrectionEmployee } from '@/lib/evaluations';
import { date } from '@/lib/format';

export default function EmployeeEvaluationPage() {
  const { data, session } = useDemo();
  const employee = data.employees.find(item => item.id === session?.employeeId);
  const openCycle = getOpenEvaluationCycle(data);
  const cycles = useMemo(() => [
    ...(openCycle ? [openCycle] : []),
    ...data.evaluationCycles.filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || '')),
  ], [data.evaluationCycles, openCycle]);
  const [cycleId, setCycleId] = useState(openCycle?.id || cycles[0]?.id || '');
  const cycle = cycles.find(item => item.id === cycleId) || cycles[0];
  const currentRows = cycle ? getCycleLeaderboard(data, cycle.id) : [];
  const own = currentRows.find(row => row.employeeId === employee?.id);
  const currentExams = cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => a.date.localeCompare(b.date)) : [];
  const snapshotExams = cycle?.state === 'ARCHIVED' ? cycle.snapshot?.exams || [] : [];
  const examOptions = cycle?.state === 'ARCHIVED' ? snapshotExams.map(exam => ({ id:exam.id, name:exam.name, date:exam.date })) : currentExams;
  const [examId, setExamId] = useState('');
  const effectiveExamId = examOptions.some(item => item.id === examId) ? examId : examOptions[0]?.id || '';
  const examRows = !cycle || !effectiveExamId ? [] : cycle.state === 'ARCHIVED' ? snapshotExams.find(exam => exam.id === effectiveExamId)?.rows || [] : getExamLeaderboard(data, effectiveExamId);

  if (!employee || !isCorrectionEmployee(data, employee)) return <EmptyState title="واجهة التقييم مخصصة لموظفي قسم التصحيح" description="هذا الحساب لا يملك ملف تقييم مصحح."/>;
  if (!cycle) return <div className="page-stack"><PageHeader eyebrow="أداؤك" title="التقييمات" description="تفاصيل أدائك وLeaderboard المصححين."/><EmptyState title="لا توجد دورة تقييم حتى الآن" description="ستظهر بياناتك هنا بعد فتح أول دورة تقييم وإضافة الامتحانات."/></div>;

  const ownExamItems = (cycle.state === 'ARCHIVED' ? snapshotExams.map(exam => ({ exam, row:exam.rows.find(row => row.employeeId === employee.id) })) : currentExams.map(exam => ({ exam, row:getExamLeaderboard(data, exam.id).find(row => row.employeeId === employee.id) }))).map(item => ({
    id:item.exam.id,
    name:item.exam.name,
    date:item.exam.date,
    papers:item.row?.papers ?? 0,
    correctionErrors:item.row?.correctionErrors ?? 0,
    behaviorErrors:item.row?.behaviorErrors ?? 0,
    score:item.row?.score ?? 0,
    evaluated: cycle.state === 'ARCHIVED' ? Boolean(item.row && item.row.examsEvaluated > 0) : Boolean(getExamEvaluation(data, item.exam.id, employee.id)),
  }));
  const rank = currentRows.findIndex(row => row.employeeId === employee.id) + 1;

  return <div className="page-stack">
    <PageHeader eyebrow="أداؤك" title="التقييمات" description="نتيجتك، تفاصيل كل امتحان، وLeaderboard كاملة للمصححين." actions={<div className="inline"><Select value={cycle.id} onChange={event => { setCycleId(event.target.value); setExamId(''); }} aria-label="اختيار دورة التقييم">{cycles.map(item => <option key={item.id} value={item.id}>{item.name}{item.state === 'ARCHIVED' ? ' — مؤرشفة' : ' — الحالية'}</option>)}</Select><Badge tone={cycle.state === 'OPEN' ? 'success' : 'neutral'}>{cycle.state === 'OPEN' ? 'الدورة الحالية' : 'أرشيف'}</Badge></div>}/>
    <section className={styles.ownHero}><div><div className="eyebrow">ترتيبك في الدورة</div><h2 style={{fontSize:24,marginTop:6}}>{own?.employeeName ?? employee.name}</h2><p className="muted">التقييم يعتمد على الأوراق والأخطاء فقط. عدد الامتحانات يظهر كمعلومة ولا يدخل بالمعادلة.</p><div className={styles.heroGrid} style={{marginTop:18}}><StatCard label="الترتيب" value={rank ? `#${rank}` : '—'} icon={<Trophy size={18}/>}/><StatCard label="الأوراق" value={own?.papers ?? 0} icon={<FileText size={18}/>}/><StatCard label="الامتحانات" value={own?.examsEvaluated ?? 0} icon={<ClipboardCheck size={18}/>}/><StatCard label="معدل الدقة" value={formatAccuracy(own?.accuracy ?? null)} icon={<Target size={18}/>}/></div></div><div className={styles.ownScore}><span>التقييم النهائي</span><strong dir="ltr">{own?.score ?? 0}</strong><span>{own?.correctionErrors ?? 0} خطأ تصحيح · {own?.behaviorErrors ?? 0} خطأ سلوك</span></div></section>
    <Card title="تفاصيلك حسب الامتحان" description="الامتحانات التي لا يوجد لك إدخال فيها تبقى ظاهرة بدون احتسابها ضمن عدد الامتحانات التي تم تقييمك فيها.">{!ownExamItems.length ? <EmptyState title="لا توجد امتحانات"/> : <div className={styles.examBreakdown}>{ownExamItems.map(item => <div className={styles.examBreakdownItem} key={item.id}><div className="inline" style={{justifyContent:'space-between'}}><h4>{item.name}</h4><Badge tone={item.evaluated ? 'brand' : 'neutral'}>{item.evaluated ? 'تم التقييم' : 'بدون تقييم'}</Badge></div><p><span dir="ltr">{date(item.date)}</span></p><p>{item.papers} ورقة · {item.correctionErrors} تصحيح · {item.behaviorErrors} سلوك · <strong>{item.score} نقطة</strong></p></div>)}</div>}</Card>
    <Card title="Leaderboard الدورة" description="كل موظفي التصحيح الفعالين يظهرون حتى لو كانت نقاطهم 0."><Leaderboard rows={currentRows}/></Card>
    <Card title="Leaderboard لكل امتحان" description="اختر امتحاناً لمشاهدة ترتيب المصححين داخله.">{!examOptions.length ? <EmptyState title="لا توجد امتحانات في هذه الدورة"/> : <div className="stack"><Select aria-label="اختيار امتحان التقييم" value={effectiveExamId} onChange={event => setExamId(event.target.value)}>{examOptions.map(exam => <option key={exam.id} value={exam.id}>{exam.name} — {date(exam.date)}</option>)}</Select><Leaderboard rows={examRows}/></div>}</Card>
  </div>;
}
