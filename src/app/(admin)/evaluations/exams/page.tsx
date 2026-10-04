'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ChevronLeft, ClipboardCheck, LockKeyhole, Plus, UnlockKeyhole } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { getOpenEvaluationCycle } from '@/lib/evaluations';
import { DEMO_TODAY } from '@/lib/mock-data';
import { date } from '@/lib/format';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationExamsPage() {
  const { data, session, updateData } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const cycles = [...data.evaluationCycles].sort((a,b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN') || (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt));
  const requestedCycle = params.get('cycle');
  const cycle = requestedCycle ? cycles.find(item => item.id === requestedCycle) : getOpenEvaluationCycle(data) ?? cycles[0];
  const canAdd = cycle?.state === 'OPEN';
  const [examOpen, setExamOpen] = useState(false);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(DEMO_TODAY);
  const [examNote, setExamNote] = useState('');
  const [error, setError] = useState('');
  const exams = !cycle ? [] : (cycle.state === 'ARCHIVED' ? (cycle.snapshot?.exams ?? []).map(item => ({ ...item, state:'CLOSED' as const })) : data.evaluationExams.filter(item => item.cycleId === cycle.id)).sort((a,b) => b.date.localeCompare(a.date));

  function addExam(event: FormEvent) {
    event.preventDefault();
    if (!session || !cycle || !canAdd) return;
    if (!examName.trim()) { setError('اكتب اسم الامتحان.'); return; }
    if (!examDate) { setError('اختر تاريخ الامتحان.'); return; }
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const exam = { id, cycleId:cycle.id, name:examName.trim(), date:examDate, note:examNote.trim(), state:'OPEN' as const, createdBy:session.name, createdAt:now };
    try { updateData(draft => { draft.evaluationExams.push(exam); }, { action:'إضافة امتحان للتدقيق', entity:'evaluation-exam', entityId:id, newValues:{ name:exam.name, date:exam.date, cycleId:cycle.id } }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر إضافة الامتحان.'); return; }
    setExamOpen(false); setExamName(''); setExamNote(''); setExamDate(DEMO_TODAY); setError(''); toast('تمت إضافة الامتحان.');
  }

  return <div className="page-stack">
    <PageHeader title="الامتحانات" actions={<div className="inline"><Link href="/evaluations" className="button-link">التدقيق</Link>{canAdd && <Button onClick={() => setExamOpen(true)}><Plus size={17}/>إضافة امتحان</Button>}</div>} />
    {!!cycles.length && <Select aria-label="اختيار دورة التقييم" value={cycle?.id ?? ''} onChange={event => router.replace(`/evaluations/exams?cycle=${encodeURIComponent(event.target.value)}`)}>{!cycle && <option value="" disabled>اختر دورة التقييم</option>}{cycles.map(item => <option key={item.id} value={item.id}>{data.evaluationSeasons.find(season => season.id === item.seasonId)?.name ?? 'دورات سابقة بلا موسم'} — {item.name}{item.state === 'ARCHIVED' ? ' — مؤرشفة' : ' — الحالية'}</option>)}</Select>}
    {!cycle ? <Card><EmptyState title={requestedCycle ? 'دورة التقييم غير موجودة' : 'لا توجد دورة تقييم مفتوحة'} action={<Link className="button-link" href="/evaluations/cycles">دورات التقييم</Link>}/></Card> : <>
      <div className={styles.adminSectionBar}><div><span>{cycle.state === 'ARCHIVED' ? 'الدورة المؤرشفة' : cycle.seasonId ? 'الدورة الحالية' : 'دورة سابقة بلا موسم'}</span><strong>{cycle.name}</strong></div><Badge tone="brand">{cycle.state === 'ARCHIVED' ? 'مؤرشفة' : `${exams.filter(item => item.state === 'OPEN').length} مفتوح`}</Badge></div>
      <Card title="الامتحانات">{!exams.length ? <EmptyState title="لا توجد امتحانات" action={canAdd ? <Button onClick={() => setExamOpen(true)}><Plus size={16}/>إضافة امتحان</Button> : undefined}/> : <div className={styles.examList}>{exams.map(exam => <article className={styles.examCard} key={exam.id}><div className={styles.examCardTop}><div><h3>{exam.name}</h3><p dir="ltr">{date(exam.date)}</p></div><Badge tone={exam.state === 'OPEN' ? 'success' : 'neutral'}>{exam.state === 'OPEN' ? <><UnlockKeyhole size={12}/>مفتوح</> : <><LockKeyhole size={12}/>مغلق</>}</Badge></div><div className={styles.examActions}><Link href={`/evaluations/${exam.id}`} className="button-link">التفاصيل <ChevronLeft size={15}/></Link></div></article>)}</div>}</Card>
    </>}
    <Dialog open={examOpen} onClose={() => setExamOpen(false)} title="إضافة امتحان"><form className="stack" onSubmit={addExam}><Field label="اسم الامتحان" required><Input value={examName} onChange={event => setExamName(event.target.value)} autoFocus/></Field><Field label="تاريخ الامتحان" required><Input type="date" value={examDate} onChange={event => setExamDate(event.target.value)}/></Field><Field label="ملاحظة"><Textarea rows={3} value={examNote} onChange={event => setExamNote(event.target.value)} placeholder="اختياري"/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setExamOpen(false)}>إلغاء</Button><Button type="submit"><ClipboardCheck size={16}/>إضافة الامتحان</Button></div></form></Dialog>
  </div>;
}
