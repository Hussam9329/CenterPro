'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { Archive, ChevronLeft, ClipboardCheck, LockKeyhole, Plus, Trophy, UnlockKeyhole } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, StatCard, Textarea } from '@/components/ui';
import { buildEvaluationCycleSnapshot, getCycleLeaderboard, getOpenEvaluationCycle } from '@/lib/evaluations';
import { DEMO_TODAY } from '@/lib/mock-data';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationsAdminPage() {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const cycle = getOpenEvaluationCycle(data);
  const [examOpen, setExamOpen] = useState(false);
  const [closeCycleOpen, setCloseCycleOpen] = useState(false);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(DEMO_TODAY);
  const [examNote, setExamNote] = useState('');
  const [error, setError] = useState('');
  const exams = useMemo(() => cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => b.date.localeCompare(a.date)) : [], [cycle, data.evaluationExams]);
  const leaderboard = cycle ? getCycleLeaderboard(data, cycle.id) : [];
  const archived = [...data.evaluationCycles].filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));

  function openCycle() {
    if (!session || cycle) return;
    const id = crypto.randomUUID();
    const count = data.evaluationCycles.length + 1;
    const now = new Date().toISOString();
    try {
      updateData(draft => { draft.evaluationCycles.push({ id, name: `دورة التقييم ${count}`, state:'OPEN', openedAt:now, openedBy:session.name }); }, { action:'فتح دورة تقييم جديدة', entity:'evaluation-cycle', entityId:id, newValues:{ name:`دورة التقييم ${count}` } });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذر فتح الدورة. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    toast('تم فتح دورة تقييم جديدة. يمكنك الآن إضافة الامتحانات.');
  }

  function addExam(event: FormEvent) {
    event.preventDefault();
    if (!session || !cycle) return;
    if (!examName.trim()) { setError('اكتب اسم الامتحان.'); return; }
    if (!examDate) { setError('اختر تاريخ الامتحان.'); return; }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const exam = { id, cycleId:cycle.id, name:examName.trim(), date:examDate, note:examNote.trim(), state:'OPEN' as const, createdBy:session.name, createdAt:now };
    try {
      updateData(draft => { draft.evaluationExams.push(exam); }, { action:'إضافة امتحان للتدقيق', entity:'evaluation-exam', entityId:id, newValues:{ name:exam.name, date:exam.date, cycleId:cycle.id } });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر إضافة الامتحان. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    setExamOpen(false); setExamName(''); setExamNote(''); setExamDate(DEMO_TODAY); setError('');
    toast('تمت إضافة الامتحان وفتحه للتدقيق.');
  }

  function closeCycle() {
    if (!session || !cycle) return;
    const now = new Date().toISOString();
    try {
      updateData(draft => {
        const current = draft.evaluationCycles.find(item => item.id === cycle.id);
        if (!current) throw new Error('دورة التقييم غير موجودة. حدّث الصفحة وحاول مرة أخرى.');
        const snapshot = buildEvaluationCycleSnapshot(draft, cycle.id);
        current.state = 'ARCHIVED'; current.closedAt = now; current.closedBy = session.name; current.snapshot = snapshot;
        draft.evaluationExams.filter(item => item.cycleId === cycle.id).forEach(exam => { if (exam.state === 'OPEN') { exam.state='CLOSED'; exam.closedAt=now; exam.closedBy=session.name; } });
      }, (_before, after) => {
        const snapshot = after.evaluationCycles.find(item => item.id === cycle.id)?.snapshot;
        return { action:'إغلاق وأرشفة دورة التقييم', entity:'evaluation-cycle', entityId:cycle.id, oldValues:{ state:'OPEN' }, newValues:{ state:'ARCHIVED', rows:snapshot?.rows.length ?? 0, exams:snapshot?.exams.length ?? 0 } };
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'تعذرت أرشفة الدورة. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    setCloseCycleOpen(false);
    toast('تم إغلاق وأرشفة دورة التقييم. يمكنك فتح دورة جديدة متى شئت.');
  }

  const totalPapers = leaderboard.reduce((sum,row) => sum + row.papers, 0);
  const totalErrors = leaderboard.reduce((sum,row) => sum + row.correctionErrors + row.behaviorErrors, 0);

  return <div className="page-stack">
    <PageHeader eyebrow="الجودة والتدقيق" title="التدقيق والتقييم" description="إدارة الامتحانات، متابعة أخطاء التصحيح والسلوك، وترتيب المصححين." actions={cycle ? <><Button onClick={() => setExamOpen(true)}><Plus size={17}/>إضافة امتحان</Button><Button variant="secondary" onClick={() => setCloseCycleOpen(true)}><Archive size={17}/>إغلاق وأرشفة الدورة</Button></> : <Button onClick={openCycle}><Trophy size={17}/>فتح دورة تقييم جديدة</Button>} />

    {!cycle ? <Card title="لا توجد دورة تقييم مفتوحة" description="الـ Leaderboard مستقلة عن الأشهر والرواتب."><EmptyState title="ابدأ دورة تقييم جديدة" description="بعد فتح الدورة تستطيع إضافة الامتحانات، ويبدأ المصححون جميعاً من 0 نقطة." action={<Button onClick={openCycle}><Trophy size={17}/>فتح دورة تقييم</Button>}/></Card> : <>
      <div className={styles.heroGrid}><StatCard label="دورة التقييم" value={cycle.name} icon={<Trophy size={19}/>} hint={`فتحت بواسطة ${cycle.openedBy}`}/><StatCard label="الامتحانات" value={exams.length} icon={<ClipboardCheck size={19}/>} hint={`${exams.filter(item => item.state === 'OPEN').length} مفتوح للتدقيق`}/><StatCard label="إجمالي الأوراق" value={totalPapers} hint="في الدورة الحالية"/><StatCard label="إجمالي الأخطاء" value={totalErrors} hint="تصحيح + سلوك"/></div>
      <Card title="الامتحانات" description="افتح الامتحان لمشاهدة النتائج أو غيّر حالة التدقيق من صفحة التفاصيل.">
        {!exams.length ? <EmptyState title="لا توجد امتحانات حتى الآن" description="أضف أول امتحان ليظهر لموظفي التدقيق." action={<Button onClick={() => setExamOpen(true)}><Plus size={16}/>إضافة امتحان</Button>}/> : <div className={styles.examList}>{exams.map(exam => <article className={styles.examCard} key={exam.id}><div className={styles.examCardTop}><div><h3>{exam.name}</h3><p><span dir="ltr">{date(exam.date)}</span> · أضيف بواسطة {exam.createdBy}</p></div><Badge tone={exam.state === 'OPEN' ? 'success' : 'neutral'}>{exam.state === 'OPEN' ? <><UnlockKeyhole size={12}/>مفتوح</> : <><LockKeyhole size={12}/>مغلق</>}</Badge></div>{exam.note && <p>{exam.note}</p>}<div className={styles.examActions}><Link href={`/evaluations/${exam.id}`} className="button-link">تفاصيل الامتحان <ChevronLeft size={15}/></Link></div></article>)}</div>}
      </Card>
      <Card title="المحصلة النهائية الحالية" description="الترتيب يعتمد فقط على: الأوراق − (أخطاء التصحيح ×5) − (أخطاء السلوك ×3). عدد الامتحانات إحصائية فقط."><Leaderboard rows={leaderboard}/></Card>
    </>}

    <Card title="أرشيف دورات التقييم" description="كل دورة مغلقة تحفظ ترتيبها وتفاصيل امتحاناتها كما كانت لحظة الأرشفة.">
      {!archived.length ? <EmptyState title="لا يوجد أرشيف تقييمات بعد" description="ستظهر الدورات هنا بعد إغلاقها."/> : <div className={styles.archiveList}>{archived.map(item => <details className={styles.archiveDetails} key={item.id}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p>{item.closedAt ? `أغلقت ${date(item.closedAt)} بواسطة ${item.closedBy}` : 'دورة مؤرشفة'}</p></div><div className="inline"><Badge>{item.snapshot?.exams.length ?? 0} امتحان</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><Leaderboard rows={item.snapshot?.rows ?? []}/><div className={styles.examBreakdown}>{(item.snapshot?.exams ?? []).map(exam => <div className={styles.examBreakdownItem} key={exam.id}><h4>{exam.name}</h4><p><span dir="ltr">{date(exam.date)}</span> · {exam.rows.reduce((sum,row) => sum + row.papers,0)} ورقة</p><Link href={`/evaluations/${exam.id}`} className="button-link" aria-label={`عرض ترتيب ${exam.name}`}>عرض ترتيب الامتحان<ChevronLeft size={14}/></Link></div>)}</div></div></details>)}</div>}
    </Card>

    <Dialog open={examOpen} onClose={() => setExamOpen(false)} title="إضافة امتحان" description="الامتحان يظهر مباشرة لموظفي قسم التدقيق ضمن دورة التقييم الحالية."><form className="stack" onSubmit={addExam}><Field label="اسم الامتحان" required><Input value={examName} onChange={event => setExamName(event.target.value)} autoFocus placeholder="مثال: امتحان الفصل الثالث"/></Field><Field label="تاريخ الامتحان" required><Input type="date" value={examDate} onChange={event => setExamDate(event.target.value)}/></Field><Field label="ملاحظة" hint="اختياري"><Textarea rows={3} value={examNote} onChange={event => setExamNote(event.target.value)} placeholder="ملاحظة اختيارية عن الامتحان"/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setExamOpen(false)}>إلغاء</Button><Button type="submit">إضافة وفتح للتدقيق</Button></div></form></Dialog>
    <ConfirmDialog open={closeCycleOpen} onClose={() => setCloseCycleOpen(false)} onConfirm={closeCycle} title="إغلاق وأرشفة دورة التقييم؟" description="سيتم تثبيت ترتيب المصححين، الأوراق، الأخطاء ومعدل الدقة لهذه الدورة. ستُغلق امتحاناتها المفتوحة، وبعدها يمكنك فتح دورة جديدة فارغة." confirmLabel="إغلاق وأرشفة الدورة"/>
  </div>;
}
