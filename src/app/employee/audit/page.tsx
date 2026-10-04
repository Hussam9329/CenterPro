'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { AuditorWorkspace } from '@/components/evaluations/auditor-workspace';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, EmptyState, Field, PageHeader, Select, StatCard } from '@/components/ui';
import { getCycleLeaderboard, getExamLeaderboard, getOpenEvaluationCycle, isAuditEmployee } from '@/lib/evaluations';
import { date } from '@/lib/format';

export default function AuditorPage() {
  const { data, session } = useDemo();
  const employee = data.employees.find(item => item.id === session?.employeeId);
  const cycle = getOpenEvaluationCycle(data);
  const exams = useMemo(() => cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => b.date.localeCompare(a.date)) : [], [cycle, data.evaluationExams]);
  const [examId, setExamId] = useState('');

  if (!employee || !isAuditEmployee(data, employee)) return <EmptyState title="واجهة التدقيق مخصصة لموظفي قسم التدقيق"/>;
  if (!cycle) return <div className="page-stack"><PageHeader eyebrow="الجودة" title="التدقيق"/><EmptyState title="لا توجد دورة تقييم مفتوحة"/></div>;
  if (!exams.length) return <div className="page-stack"><PageHeader eyebrow={cycle.name} title="التدقيق"/><EmptyState title="لا توجد امتحانات في الدورة الحالية"/></div>;

  const selectedExam = exams.find(item => item.id === examId) || exams[0];
  const examLeaderboard = selectedExam ? getExamLeaderboard(data, selectedExam.id) : [];
  const cycleLeaderboard = getCycleLeaderboard(data, cycle.id);
  const totalPapers = examLeaderboard.reduce((sum,row) => sum + row.papers, 0);
  const totalErrors = examLeaderboard.reduce((sum,row) => sum + row.correctionErrors + row.behaviorErrors, 0);

  return <div className="page-stack">
    <PageHeader eyebrow={cycle.name} title="التدقيق" actions={<Badge tone="brand"><ClipboardCheck size={14}/>حساب مدقق</Badge>}/>
    <div className={styles.heroGrid}><StatCard label="الأوراق في الامتحان" value={totalPapers}/><StatCard label="أخطاء التصحيح" value={examLeaderboard.reduce((sum,row) => sum + row.correctionErrors,0)}/><StatCard label="أخطاء السلوك" value={examLeaderboard.reduce((sum,row) => sum + row.behaviorErrors,0)}/><StatCard label="مجموع الأخطاء" value={totalErrors} icon={<ClipboardCheck size={18}/>}/></div>
    <Card title="إدخال بيانات التدقيق">
      <AuditorWorkspace key={cycle.id} examId={selectedExam.id} examControl={<Field label="اختيار الامتحان"><Select value={selectedExam.id} onChange={event => setExamId(event.target.value)}>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.name} — {date(exam.date)}{exam.state === 'CLOSED' ? ' (مغلق)' : ''}</option>)}</Select></Field>}/>
    </Card>
    <Card title="Leaderboard الامتحان"><Leaderboard rows={examLeaderboard}/></Card>
    <Card title="المحصلة النهائية للدورة"><Leaderboard rows={cycleLeaderboard}/></Card>
  </div>;
}
