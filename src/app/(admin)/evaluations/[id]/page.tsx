'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Pencil, UnlockKeyhole } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { AuditorWorkspace } from '@/components/evaluations/auditor-workspace';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Textarea } from '@/components/ui';
import { getExamLeaderboard } from '@/lib/evaluations';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';

export default function EvaluationExamAdminPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState('');
  const foundExam = data.evaluationExams.find(item => item.id === params.id);
  if (!foundExam) return <div className="page-stack"><EmptyState title="الامتحان غير موجود" action={<Button variant="secondary" onClick={() => router.push('/evaluations/exams')}>العودة إلى الامتحانات</Button>}/></div>;
  const exam = foundExam;
  const cycle = data.evaluationCycles.find(item => item.id === exam.cycleId);
  const archivedExam = cycle?.state === 'ARCHIVED' ? cycle.snapshot?.exams.find(item => item.id === exam.id) : undefined;
  const rows = cycle?.state === 'ARCHIVED' ? archivedExam?.rows ?? [] : getExamLeaderboard(data, exam.id);
  const evaluations = data.examEvaluations.filter(item => item.examId === exam.id);
  const canToggle = cycle?.state === 'OPEN' && (session?.role === 'SUPER_ADMIN' || session?.role === 'ADMIN');
  const superControl = cycle?.state === 'OPEN' && session?.role === 'SUPER_ADMIN';

  async function toggle() {
    if (!session || !canToggle) return;
    const nextState = exam.state === 'OPEN' ? 'CLOSED' : 'OPEN';
    const now = new Date().toISOString();
    try {
      if (!await mutate(() => updateData(draft => {
        const target = draft.evaluationExams.find(item => item.id === exam.id);
        if (!target) throw new Error('الامتحان غير موجود. حدّث الصفحة وحاول مرة أخرى.');
        target.state = nextState;
        if (nextState === 'CLOSED') { target.closedAt = now; target.closedBy = session.name; }
        else { delete target.closedAt; delete target.closedBy; }
      }, { action: nextState === 'CLOSED' ? 'إغلاق امتحان للتدقيق' : 'إعادة فتح امتحان للتدقيق', entity:'evaluation-exam', entityId:exam.id, oldValues:{ state:exam.state }, newValues:{ state:nextState } }))) return;
    } catch (error) { toast(error instanceof Error ? error.message : 'تعذر تغيير حالة الامتحان.'); return; }
    toast(nextState === 'CLOSED' ? 'تم إغلاق الامتحان للتدقيق.' : 'تمت إعادة فتح الامتحان للتدقيق.');
  }

  function beginEdit() {
    setEditName(exam.name); setEditDate(exam.date); setEditNote(exam.note); setEditError(''); setEditOpen(true);
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!superControl) return;
    const name = editName.trim(); const note = editNote.trim();
    if (!name) { setEditError('اكتب اسم الامتحان.'); return; }
    if (!editDate) { setEditError('اختر تاريخ الامتحان.'); return; }
    if (!await mutate(() => updateData(draft => {
      const target = draft.evaluationExams.find(item => item.id === exam.id);
      if (!target) throw new Error('الامتحان غير موجود.');
      target.name = name; target.date = editDate; target.note = note;
    }, { action: 'تعديل تفاصيل امتحان التدقيق', entity: 'evaluation-exam', entityId: exam.id, oldValues: { name: exam.name, date: exam.date, note: exam.note }, newValues: { name, date: editDate, note } }), setEditError)) return;
    setEditOpen(false); toast('تم تعديل تفاصيل الامتحان.');
  }

  return <div className="page-stack">
    <Link href={{ pathname:'/evaluations/exams', query:{cycle:exam.cycleId} }} className="button-link"><ArrowRight size={15}/>العودة إلى الامتحانات</Link>
    <PageHeader eyebrow={cycle?.name || 'التدقيق'} title={archivedExam?.name ?? exam.name} actions={<div className="inline" style={{ flexWrap: 'wrap' }}><Badge tone={exam.state === 'OPEN' ? 'success' : 'neutral'}>{exam.state === 'OPEN' ? 'مفتوح للتدقيق' : 'مغلق'}</Badge>{superControl && <Button variant="ghost" onClick={beginEdit}><Pencil size={16}/>تعديل التفاصيل</Button>}{canToggle && <Button loading={pending} variant="secondary" onClick={toggle}>{exam.state === 'OPEN' ? <><LockKeyhole size={16}/>إغلاق التدقيق</> : <><UnlockKeyhole size={16}/>إعادة الفتح</>}</Button>}</div>}/>
    {exam.note && <Card title="ملاحظة الامتحان"><p className="muted">{exam.note}</p></Card>}
    {session?.role === 'SUPER_ADMIN' && cycle?.state === 'OPEN' && <Card title="إدخال ومراجعة بيانات التدقيق"><AuditorWorkspace examId={exam.id}/></Card>}
    <Card title="Leaderboard الامتحان"><Leaderboard rows={rows}/></Card>
    <Card title="سجل إدخالات المدققين">{!evaluations.length ? <EmptyState title="لم تُدخل بيانات تدقيق بعد"/> : <div className="stack">{evaluations.map(item => { const employee = data.employees.find(employee => employee.id === item.employeeId); const archivedName = archivedExam?.rows.find(row => row.employeeId === item.employeeId)?.employeeName; const name = archivedName ?? employee?.name ?? 'موظف'; return <div className="list-row" key={item.id}><div><strong>{name}</strong><p className="muted">{item.papers ?? '—'} ورقة · {item.correctionErrors ?? '—'} خطأ تصحيح · {item.behaviorErrors ?? '—'} خطأ سلوك</p></div><div className="inline"><div className="muted">آخر تعديل: {item.updatedBy} · <span dir="ltr">{date(item.updatedAt)}</span></div><SafeDeleteButton collection="examEvaluations" id={item.id} label={`تقييم ${name}`} compact /></div></div>; })}</div>}</Card>
    <Dialog open={editOpen} onClose={() => { if (!pending) setEditOpen(false); }} title="تعديل تفاصيل الامتحان"><form className="stack" onSubmit={saveDetails}><Field label="اسم الامتحان" required><Input value={editName} onChange={event => setEditName(event.target.value)} autoFocus/></Field><Field label="تاريخ الامتحان" required><Input type="date" value={editDate} onChange={event => setEditDate(event.target.value)}/></Field><Field label="ملاحظة"><Textarea rows={3} value={editNote} onChange={event => setEditNote(event.target.value)}/></Field>{editError && <p className="text-danger" role="alert">{editError}</p>}<div className="form-actions"><Button type="button" variant="secondary" disabled={pending} onClick={() => setEditOpen(false)}>إلغاء</Button><Button type="submit" loading={pending}>حفظ التعديل</Button></div></form></Dialog>
  </div>;
}
