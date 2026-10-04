'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardCheck, FileText, Target, Trophy } from 'lucide-react';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import { RankBadge } from '@/components/evaluations/rank-badge';
import { SeasonLeaderboard } from '@/components/evaluations/season-leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, EmptyState, PageHeader, Select, StatCard } from '@/components/ui';
import { formatAccuracy, formatAveragePapers, getCycleLeaderboard, getExamLeaderboard, getExamEvaluation, getLatestEvaluationSeason, getRankProgress, getSeasonLeaderboard, isCorrectionEmployee } from '@/lib/evaluations';
import { date } from '@/lib/format';

export default function EmployeeEvaluationPage() {
  const { data, session } = useDemo();
  const employee = data.employees.find(item => item.id === session?.employeeId);
  const latestSeason = getLatestEvaluationSeason(data);
  const seasons = useMemo(() => [...data.evaluationSeasons].sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN') || (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt)), [data.evaluationSeasons]);
  const hasLegacyCycles = data.evaluationCycles.some(item => !item.seasonId);
  const [seasonId, setSeasonId] = useState(latestSeason?.id ?? (hasLegacyCycles ? '__legacy__' : ''));
  const effectiveSeasonId = seasons.some(item => item.id === seasonId) || (seasonId === '__legacy__' && hasLegacyCycles) ? seasonId : latestSeason?.id ?? (hasLegacyCycles ? '__legacy__' : '');
  const season = seasons.find(item => item.id === effectiveSeasonId);
  const cycles = useMemo(() => data.evaluationCycles
    .filter(item => effectiveSeasonId === '__legacy__' ? !item.seasonId : item.seasonId === effectiveSeasonId)
    .sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN') || (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt)), [data.evaluationCycles, effectiveSeasonId]);
  const [cycleId, setCycleId] = useState('');
  const cycle = cycles.find(item => item.id === cycleId) || cycles[0];
  const currentRows = cycle ? getCycleLeaderboard(data, cycle.id, { publishedOnly: true }) : [];
  const own = currentRows.find(row => row.employeeId === employee?.id);
  const currentExams = cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => a.date.localeCompare(b.date)) : [];
  const snapshotExams = cycle?.state === 'ARCHIVED' ? cycle.snapshot?.exams || [] : [];
  const examOptions = cycle?.state === 'ARCHIVED' ? snapshotExams.map(exam => ({ id:exam.id, name:exam.name, date:exam.date, state:'CLOSED' as const })) : currentExams;
  const [examId, setExamId] = useState('');
  const effectiveExamId = examOptions.some(item => item.id === examId) ? examId : examOptions[0]?.id || '';
  const selectedExam = examOptions.find(item => item.id === effectiveExamId);
  const examRows = !cycle || !effectiveExamId || selectedExam?.state === 'OPEN' ? [] : cycle.state === 'ARCHIVED' ? snapshotExams.find(exam => exam.id === effectiveExamId)?.rows || [] : getExamLeaderboard(data, effectiveExamId, { publishedOnly: true });
  const seasonRows = season ? getSeasonLeaderboard(data, season.id, { publishedOnly: true }) : [];
  const ownSeason = seasonRows.find(row => row.employeeId === employee?.id);
  const seasonRank = getRankProgress(ownSeason?.score ?? 0);

  if (!employee || !isCorrectionEmployee(data, employee)) return <EmptyState title="واجهة التقييم مخصصة لموظفي قسم التصحيح"/>;
  if (!cycle && !season) return <div className="page-stack"><PageHeader eyebrow="أداؤك" title="التقييمات"/><EmptyState title="لا توجد تقييمات حتى الآن"/></div>;

  const ownExamItems = !cycle ? [] : (cycle.state === 'ARCHIVED'
    ? snapshotExams.map(exam => ({ exam:{ ...exam, state:'CLOSED' as const }, row:exam.rows.find(row => row.employeeId === employee.id) }))
    : currentExams.map(exam => ({ exam, row:exam.state === 'CLOSED' ? getExamLeaderboard(data, exam.id, { publishedOnly: true }).find(row => row.employeeId === employee.id) : undefined })))
    .map(item => ({
      id:item.exam.id,
      name:item.exam.name,
      date:item.exam.date,
      state:item.exam.state,
      papers:item.row?.papers ?? 0,
      correctionErrors:item.row?.correctionErrors ?? 0,
      behaviorErrors:item.row?.behaviorErrors ?? 0,
      score:item.row?.score ?? 0,
      evaluated: item.exam.state === 'CLOSED' && (cycle?.state === 'ARCHIVED' ? Boolean(item.row && item.row.examsEvaluated > 0) : Boolean(getExamEvaluation(data, item.exam.id, employee.id, { publishedOnly: true }))),
    }));
  const rank = currentRows.findIndex(row => row.employeeId === employee.id) + 1;
  const seasonPosition = seasonRows.findIndex(row => row.employeeId === employee.id) + 1;

  return <div className="page-stack">
    <PageHeader eyebrow="أداؤك" title="التقييمات" actions={<div className="inline"><Select value={effectiveSeasonId} onChange={event => { setSeasonId(event.target.value); setCycleId(''); setExamId(''); }} aria-label="اختيار الموسم">{seasons.map(item => <option key={item.id} value={item.id}>{item.name}{item.state === 'ARCHIVED' ? ' — مؤرشف' : ' — الحالي'}</option>)}{hasLegacyCycles && <option value="__legacy__">دورات سابقة بلا موسم</option>}</Select>{cycle && <><Select value={cycle.id} onChange={event => { setCycleId(event.target.value); setExamId(''); }} aria-label="اختيار دورة التقييم">{cycles.map(item => <option key={item.id} value={item.id}>{item.name}{item.state === 'ARCHIVED' ? ' — مؤرشفة' : ' — الحالية'}</option>)}</Select><Badge tone={cycle.state === 'OPEN' ? 'success' : 'neutral'}>{cycle.state === 'OPEN' ? 'الحالية' : 'أرشيف'}</Badge></>}</div>}/>

    {season && <section className={styles.employeeSeasonCard} aria-label="ملخص تقييم الموسم">
      <RankBadge score={ownSeason?.score ?? 0} size="lg" animated/>
      <div className={styles.employeeSeasonMain}>
        <span className="eyebrow">{season.name}</span>
        <h2 dir="ltr">{seasonRank.rank.name}</h2>
        <strong className={styles.seasonPoints} dir="ltr">{ownSeason?.score ?? 0} pts</strong>
        {seasonRank.rank.next !== null ? <><div className={styles.rankProgress} role="progressbar" aria-label="التقدم إلى الرتبة التالية" aria-valuemin={0} aria-valuemax={100} aria-valuenow={seasonRank.progress} aria-valuetext={`متبقي ${seasonRank.pointsToNext} نقطة`}><span style={{ width:`${seasonRank.progress}%` }}/></div><small>متبقي <bdi dir="ltr">{seasonRank.pointsToNext}</bdi> نقطة إلى {getRankProgress(seasonRank.rank.next).rank.name}</small></> : <small>أعلى رتبة موسمية</small>}
      </div>
      <div className={styles.employeeSeasonStats}>
        <div><span>ترتيبك</span><strong dir="ltr">{seasonPosition ? `#${seasonPosition}` : '—'}</strong></div>
        <div><span>الدورات</span><strong dir="ltr">{ownSeason?.cyclesEvaluated ?? 0}</strong></div>
        <div><span>الامتحانات</span><strong dir="ltr">{ownSeason?.examsEvaluated ?? 0}</strong></div>
        <div><span>أيام الحضور</span><strong dir="ltr">{ownSeason?.attendanceDays ?? 0}</strong></div>
        <div><span>متوسط اليوم</span><strong dir="ltr">{formatAveragePapers(ownSeason?.averagePapersPerDay ?? null)}</strong></div>
        <div><span>الدقة</span><strong dir="ltr">{formatAccuracy(ownSeason?.accuracy ?? null)}</strong></div>
      </div>
      <div className={styles.employeeSeasonPhrase}>انت موظف مو عادي !</div>
    </section>}

    {season && <Card title="Leaderboard الموسم"><SeasonLeaderboard rows={seasonRows} highlightEmployeeId={employee.id}/></Card>}
    {season && !cycle && <Card><EmptyState title="لا توجد دورات في هذا الموسم"/></Card>}

    {cycle && <>
      <section className={styles.ownHero}><div><div className="eyebrow">{cycle.name}</div><h2 className={styles.employeeEvaluationName}>{own?.employeeName ?? employee.name}</h2><div className={styles.heroGrid}><StatCard label="الترتيب" value={rank ? `#${rank}` : '—'} icon={<Trophy size={18}/>}/><StatCard label="الأوراق" value={own?.papers ?? 0} icon={<FileText size={18}/>}/><StatCard label="الامتحانات" value={own?.examsEvaluated ?? 0} icon={<ClipboardCheck size={18}/>}/><StatCard label="معدل الدقة" value={formatAccuracy(own?.accuracy ?? null)} icon={<Target size={18}/>}/></div></div><div className={styles.ownScore}><span>التقييم النهائي</span><strong dir="ltr">{own?.score ?? 0}</strong><small>{own?.correctionErrors ?? 0} تصحيح · {own?.behaviorErrors ?? 0} سلوك</small></div></section>
      <Card title="تفاصيل الامتحانات">{!ownExamItems.length ? <EmptyState title="لا توجد امتحانات"/> : <div className={styles.examBreakdown}>{ownExamItems.map(item => <div className={styles.examBreakdownItem} key={item.id}><div className="inline" style={{justifyContent:'space-between'}}><h4>{item.name}</h4><Badge tone={item.state === 'OPEN' ? 'warning' : item.evaluated ? 'brand' : 'neutral'}>{item.state === 'OPEN' ? 'قيد التدقيق' : item.evaluated ? 'تم التقييم' : 'بدون تقييم'}</Badge></div><p><CalendarDays size={13}/><span dir="ltr">{date(item.date)}</span></p>{item.state === 'CLOSED' && <p>{item.papers} ورقة · {item.correctionErrors} تصحيح · {item.behaviorErrors} سلوك · <strong>{item.score} نقطة</strong></p>}</div>)}</div>}</Card>
      <Card title="Leaderboard الدورة"><Leaderboard rows={currentRows}/></Card>
      <Card title="Leaderboard الامتحان">{!examOptions.length ? <EmptyState title="لا توجد امتحانات في هذه الدورة"/> : <div className="stack"><Select aria-label="اختيار امتحان التقييم" value={effectiveExamId} onChange={event => setExamId(event.target.value)}>{examOptions.map(exam => <option key={exam.id} value={exam.id}>{exam.name} — {date(exam.date)}{exam.state === 'OPEN' ? ' — قيد التدقيق' : ''}</option>)}</Select>{selectedExam?.state === 'OPEN' ? <EmptyState title="قيد التدقيق"/> : <Leaderboard rows={examRows}/>}</div>}</Card>
    </>}
  </div>;
}
