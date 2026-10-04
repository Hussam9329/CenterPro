'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { getExamLeaderboard } from '@/lib/evaluations';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';

export default function EvaluationExamAdminPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const exam = data.evaluationExams.find(item => item.id === params.id);
  if (!exam) return <div className="page-stack"><EmptyState title="الامتحان غير موجود" action={<Button variant="secondary" onClick={() => router.push('/evaluations/exams')}>العودة إلى الامتحانات</Button>}/></div>;
  const cycle = data.evaluationCycles.find(item => item.id === exam.cycleId);
  const archivedExam = cycle?.state === 'ARCHIVED' ? cycle.snapshot?.exams.find(item => item.id === exam.id) : undefined;
  const rows = cycle?.state === 'ARCHIVED'
    ? archivedExam?.rows ?? []
    : getExamLeaderboard(data, exam.id);
  const evaluations = data.examEvaluations.filter(item => item.examId === exam.id);
  const canToggle = cycle?.state === 'OPEN' && (session?.role === 'SUPER_ADMIN' || session?.role === 'ADMIN');
  function toggle() {
    if (!exam || !session || !canToggle) return;
    const nextState = exam.state === 'OPEN' ? 'CLOSED' : 'OPEN';
    const now = new Date().toISOString();
    try {
      updateData(draft => { const target = draft.evaluationExams.find(item => item.id === exam.id); if (!target) throw new Error('الامتحان غير موجود. حدّث الصفحة وحاول مرة أخرى.'); target.state = nextState; if (nextState === 'CLOSED') { target.closedAt = now; target.closedBy = session.name; } else { delete target.closedAt; delete target.closedBy; } }, { action: nextState === 'CLOSED' ? 'إغلاق امتحان للتدقيق' : 'إعادة فتح امتحان للتدقيق', entity:'evaluation-exam', entityId:exam.id, oldValues:{ state:exam.state }, newValues:{ state:nextState } });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذر تغيير حالة الامتحان. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    toast(nextState === 'CLOSED' ? 'تم إغلاق الامتحان للتدقيق.' : 'تمت إعادة فتح الامتحان للتدقيق.');
  }
  return <div className="page-stack">
    <Link href={{ pathname:'/evaluations/exams', query:{cycle:exam.cycleId} }} className="button-link"><ArrowRight size={15}/>العودة إلى الامتحانات</Link>
    <PageHeader eyebrow={cycle?.name || 'التدقيق'} title={archivedExam?.name ?? exam.name} actions={<div className="inline"><Badge tone={exam.state === 'OPEN' ? 'success' : 'neutral'}>{exam.state === 'OPEN' ? 'مفتوح للتدقيق' : 'مغلق'}</Badge>{canToggle && <Button variant="secondary" onClick={toggle}>{exam.state === 'OPEN' ? <><LockKeyhole size={16}/>إغلاق التدقيق</> : <><UnlockKeyhole size={16}/>إعادة الفتح</>}</Button>}</div>}/>
    <Card title="Leaderboard الامتحان"><Leaderboard rows={rows}/></Card>
    <Card title="سجل إدخالات المدققين">{!evaluations.length ? <EmptyState title="لم تُدخل بيانات تدقيق بعد"/> : <div className="stack">{evaluations.map(item => { const employee = data.employees.find(employee => employee.id === item.employeeId); const archivedName = archivedExam?.rows.find(row => row.employeeId === item.employeeId)?.employeeName; return <div className="list-row" key={item.id}><div><strong>{archivedName ?? employee?.name ?? 'موظف'}</strong><p className="muted">{item.papers ?? '—'} ورقة · {item.correctionErrors ?? '—'} خطأ تصحيح · {item.behaviorErrors ?? '—'} خطأ سلوك</p></div><div className="muted">آخر تعديل: {item.updatedBy} · <span dir="ltr">{date(item.updatedAt)}</span></div></div>; })}</div>}</Card>
  </div>;
}
