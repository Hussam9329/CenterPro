'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { Archive, ChevronLeft, ClipboardCheck, Flag, LockKeyhole, Plus, Trophy, UnlockKeyhole } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader, StatCard, Textarea } from '@/components/ui';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot, getCycleLeaderboard, getOpenEvaluationCycle, getOpenEvaluationSeason, getSeasonLeaderboard } from '@/lib/evaluations';
import { DEMO_MONTH, DEMO_TODAY } from '@/lib/mock-data';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import { SeasonLeaderboard } from '@/components/evaluations/season-leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationsAdminPage() {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [seasonStartDate, setSeasonStartDate] = useState(`${DEMO_MONTH}-01`);
  const [examOpen, setExamOpen] = useState(false);
  const [closeCycleOpen, setCloseCycleOpen] = useState(false);
  const [closeSeasonOpen, setCloseSeasonOpen] = useState(false);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(DEMO_TODAY);
  const [examNote, setExamNote] = useState('');
  const [error, setError] = useState('');
  const exams = useMemo(() => cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => b.date.localeCompare(a.date)) : [], [cycle, data.evaluationExams]);
  const leaderboard = cycle ? getCycleLeaderboard(data, cycle.id) : [];
  const seasonRows = season ? getSeasonLeaderboard(data, season.id) : [];
  const archivedCycles = [...data.evaluationCycles].filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const archivedSeasons = [...data.evaluationSeasons].filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));

  function createSeason(event: FormEvent) {
    event.preventDefault();
    if (!session || season) return;
    const id = crypto.randomUUID();
    const count = data.evaluationSeasons.length + 1;
    const name = seasonName.trim() || `الموسم ${count}`;
    const now = new Date().toISOString();
    try {
      updateData(draft => { draft.evaluationSeasons.push({ id, name, startDate: seasonStartDate, state:'OPEN', openedAt:now, openedBy:session.name }); }, { action:'فتح موسم تقييم جديد', entity:'evaluation-season', entityId:id, newValues:{ name, startDate:seasonStartDate } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر فتح الموسم.');
      return;
    }
    setSeasonOpen(false); setSeasonName(''); setError('');
    toast('تم فتح الموسم. يمكنك الآن فتح دورة تقييم.');
  }

  function openCycle() {
    if (!session || cycle) return;
    if (!season) { toast('افتح موسماً أولاً قبل بدء دورة تقييم.'); return; }
    const id = crypto.randomUUID();
    const count = data.evaluationCycles.filter(item => item.seasonId === season.id).length + 1;
    const now = new Date().toISOString();
    try {
      updateData(draft => { draft.evaluationCycles.push({ id, seasonId:season.id, name: `دورة التقييم ${count}`, state:'OPEN', openedAt:now, openedBy:session.name }); }, { action:'فتح دورة تقييم جديدة', entity:'evaluation-cycle', entityId:id, newValues:{ name:`دورة التقييم ${count}`, seasonId:season.id } });
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'تعذر فتح الدورة.');
      return;
    }
    toast('تم فتح دورة تقييم جديدة.');
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر إضافة الامتحان.');
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
        if (!current) throw new Error('دورة التقييم غير موجودة.');
        const snapshot = buildEvaluationCycleSnapshot(draft, cycle.id);
        current.state = 'ARCHIVED'; current.closedAt = now; current.closedBy = session.name; current.snapshot = snapshot;
        draft.evaluationExams.filter(item => item.cycleId === cycle.id).forEach(exam => { if (exam.state === 'OPEN') { exam.state='CLOSED'; exam.closedAt=now; exam.closedBy=session.name; } });
      }, (_before, after) => {
        const snapshot = after.evaluationCycles.find(item => item.id === cycle.id)?.snapshot;
        return { action:'إغلاق وأرشفة دورة التقييم', entity:'evaluation-cycle', entityId:cycle.id, oldValues:{ state:'OPEN' }, newValues:{ state:'ARCHIVED', rows:snapshot?.rows.length ?? 0, exams:snapshot?.exams.length ?? 0 } };
      });
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الدورة.');
      return;
    }
    setCloseCycleOpen(false);
    toast('تم إغلاق وأرشفة دورة التقييم.');
  }

  function closeSeason() {
    if (!session || !season) return;
    if (cycle) { toast('أغلق دورة التقييم الحالية قبل أرشفة الموسم.'); setCloseSeasonOpen(false); return; }
    const now = new Date().toISOString();
    try {
      updateData(draft => {
        const current = draft.evaluationSeasons.find(item => item.id === season.id);
        if (!current) throw new Error('الموسم غير موجود.');
        current.endDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
        current.snapshot = buildEvaluationSeasonSnapshot(draft, season.id);
        current.state = 'ARCHIVED'; current.closedAt = now; current.closedBy = session.name;
      }, (_before, after) => {
        const snapshot = after.evaluationSeasons.find(item => item.id === season.id)?.snapshot;
        return { action:'إغلاق وأرشفة الموسم', entity:'evaluation-season', entityId:season.id, oldValues:{ state:'OPEN' }, newValues:{ state:'ARCHIVED', rows:snapshot?.rows.length ?? 0, cycles:snapshot?.cycleIds.length ?? 0 } };
      });
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الموسم.');
      return;
    }
    setCloseSeasonOpen(false);
    toast('تم أرشفة الموسم. يمكنك فتح موسم جديد.');
  }

  const totalPapers = leaderboard.reduce((sum,row) => sum + row.papers, 0);
  const totalErrors = leaderboard.reduce((sum,row) => sum + row.correctionErrors + row.behaviorErrors, 0);

  const actions = cycle
    ? <><Button onClick={() => setExamOpen(true)}><Plus size={17}/>إضافة امتحان</Button><Button variant="secondary" onClick={() => setCloseCycleOpen(true)}><Archive size={17}/>إغلاق الدورة</Button></>
    : !season
      ? <Button onClick={() => setSeasonOpen(true)}><Flag size={17}/>فتح موسم جديد</Button>
      : <><Button onClick={openCycle}><Trophy size={17}/>فتح دورة تقييم</Button><Button variant="secondary" onClick={() => setCloseSeasonOpen(true)}><Archive size={17}/>إغلاق الموسم</Button></>;

  return <div className="page-stack">
    <PageHeader eyebrow="الجودة والتدقيق" title="التدقيق والتقييم" actions={actions} />

    {!season ? !cycle && <Card><EmptyState title="لا يوجد موسم مفتوح" action={<Button onClick={() => setSeasonOpen(true)}><Flag size={17}/>فتح موسم جديد</Button>}/></Card> : <>
      <section className={styles.seasonAdminHero}><div><span className="eyebrow">الموسم الحالي</span><h2>{season.name}</h2><div className="inline"><Badge tone="brand">مفتوح</Badge><span className="muted" dir="ltr">{date(season.startDate)}</span></div></div><div className={styles.seasonHeroMetric}><span>المصححون</span><strong dir="ltr">{seasonRows.length}</strong></div><div className={styles.seasonHeroMetric}><span>الدورات</span><strong dir="ltr">{data.evaluationCycles.filter(item => item.seasonId === season.id).length}</strong></div></section>
      <Card title="Leaderboard الموسم"><SeasonLeaderboard rows={seasonRows}/></Card>
    </>}

      {!cycle ? season && <Card><EmptyState title="لا توجد دورة تقييم مفتوحة" action={<Button onClick={openCycle}><Trophy size={17}/>فتح دورة تقييم</Button>}/></Card> : <>
        <div className={styles.heroGrid}><StatCard label="دورة التقييم" value={cycle.name} icon={<Trophy size={19}/>} hint={!cycle.seasonId ? 'دورة سابقة بلا موسم' : undefined}/><StatCard label="الامتحانات" value={exams.length} icon={<ClipboardCheck size={19}/>} hint={`${exams.filter(item => item.state === 'OPEN').length} مفتوح`}/><StatCard label="إجمالي الأوراق" value={totalPapers}/><StatCard label="إجمالي الأخطاء" value={totalErrors}/></div>
        <Card title="الامتحانات">
          {!exams.length ? <EmptyState title="لا توجد امتحانات حتى الآن" action={<Button onClick={() => setExamOpen(true)}><Plus size={16}/>إضافة امتحان</Button>}/> : <div className={styles.examList}>{exams.map(exam => <article className={styles.examCard} key={exam.id}><div className={styles.examCardTop}><div><h3>{exam.name}</h3><p><span dir="ltr">{date(exam.date)}</span> · {exam.createdBy}</p></div><Badge tone={exam.state === 'OPEN' ? 'success' : 'neutral'}>{exam.state === 'OPEN' ? <><UnlockKeyhole size={12}/>مفتوح</> : <><LockKeyhole size={12}/>مغلق</>}</Badge></div>{exam.note && <p>{exam.note}</p>}<div className={styles.examActions}><Link href={`/evaluations/${exam.id}`} className="button-link">تفاصيل الامتحان <ChevronLeft size={15}/></Link></div></article>)}</div>}
        </Card>
        <Card title="Leaderboard الدورة"><Leaderboard rows={leaderboard}/></Card>
      </>}

    {!!archivedSeasons.length && <Card title="أرشيف المواسم"><div className={styles.archiveList}>{archivedSeasons.map(item => <details className={styles.archiveDetails} key={item.id}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p><span dir="ltr">{date(item.startDate)}</span>{item.endDate ? ` — ${date(item.endDate)}` : ''}</p></div><div className="inline"><Badge>{item.snapshot?.cycleIds.length ?? 0} دورة</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><SeasonLeaderboard rows={item.snapshot?.rows ?? []}/></div></details>)}</div></Card>}

    {!!archivedCycles.length && <Card title="أرشيف الدورات"><div className={styles.archiveList}>{archivedCycles.map(item => <details className={styles.archiveDetails} key={item.id}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p>{data.evaluationSeasons.find(season => season.id === item.seasonId)?.name ?? 'دورات سابقة بلا موسم'}</p><p>{item.closedAt ? <><span dir="ltr">{date(item.closedAt)}</span> · {item.closedBy}</> : 'دورة مؤرشفة'}</p></div><div className="inline"><Badge>{item.snapshot?.exams.length ?? 0} امتحان</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><Leaderboard rows={item.snapshot?.rows ?? []}/><div className={styles.examBreakdown}>{(item.snapshot?.exams ?? []).map(exam => <div className={styles.examBreakdownItem} key={exam.id}><h4>{exam.name}</h4><p dir="ltr">{date(exam.date)}</p><Link href={`/evaluations/${exam.id}`} className="button-link" aria-label={`عرض ترتيب ${exam.name}`}>عرض ترتيب الامتحان<ChevronLeft size={14}/></Link></div>)}</div></div></details>)}</div></Card>}

    <Dialog open={seasonOpen} onClose={() => setSeasonOpen(false)} title="فتح موسم جديد"><form className="stack" onSubmit={createSeason}><Field label="اسم الموسم"><Input value={seasonName} onChange={event => setSeasonName(event.target.value)} placeholder={`الموسم ${data.evaluationSeasons.length + 1}`}/></Field><Field label="تاريخ بداية الموسم" required><Input type="date" value={seasonStartDate} onChange={event => setSeasonStartDate(event.target.value)}/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setSeasonOpen(false)}>إلغاء</Button><Button type="submit">فتح الموسم</Button></div></form></Dialog>
    <Dialog open={examOpen} onClose={() => setExamOpen(false)} title="إضافة امتحان"><form className="stack" onSubmit={addExam}><Field label="اسم الامتحان" required><Input value={examName} onChange={event => setExamName(event.target.value)} autoFocus placeholder="مثال: امتحان الفصل الثالث"/></Field><Field label="تاريخ الامتحان" required><Input type="date" value={examDate} onChange={event => setExamDate(event.target.value)}/></Field><Field label="ملاحظة"><Textarea rows={3} value={examNote} onChange={event => setExamNote(event.target.value)} placeholder="اختياري"/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setExamOpen(false)}>إلغاء</Button><Button type="submit">إضافة وفتح للتدقيق</Button></div></form></Dialog>
    <ConfirmDialog open={closeCycleOpen} onClose={() => setCloseCycleOpen(false)} onConfirm={closeCycle} title="إغلاق وأرشفة دورة التقييم؟" description="سيتم تثبيت نتائج الدورة وإغلاق امتحاناتها المفتوحة." confirmLabel="إغلاق وأرشفة الدورة"/>
    <ConfirmDialog open={closeSeasonOpen} onClose={() => setCloseSeasonOpen(false)} onConfirm={closeSeason} title="إغلاق وأرشفة الموسم؟" description="سيتم تثبيت الترتيب والرانكات وإحصائيات الموسم." confirmLabel="إغلاق وأرشفة الموسم"/>
  </div>;
}
