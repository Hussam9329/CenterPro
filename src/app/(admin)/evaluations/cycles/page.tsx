'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Archive, Plus, Trophy } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Select } from '@/components/ui';
import { buildEvaluationCycleSnapshot, getCycleLeaderboard, getOpenEvaluationCycle, getOpenEvaluationSeason } from '@/lib/evaluations';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationCyclesPage() {
  const { data, session, updateData } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const [closeOpen, setCloseOpen] = useState(false);
  const requestedSeason = params.get('season') ?? '';
  const seasonFilter = requestedSeason === '__legacy__' || data.evaluationSeasons.some(item => item.id === requestedSeason) ? requestedSeason : '';
  const matchesSeason = (seasonId?: string) => !seasonFilter || (seasonFilter === '__legacy__' ? !seasonId : seasonId === seasonFilter);
  const visibleCycle = cycle && matchesSeason(cycle.seasonId) ? cycle : undefined;
  const canOpen = !cycle && Boolean(season && matchesSeason(season.id));
  const archived = [...data.evaluationCycles].filter(item => item.state === 'ARCHIVED' && matchesSeason(item.seasonId)).sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const leaderboard = cycle ? getCycleLeaderboard(data, cycle.id) : [];

  function openCycle() {
    if (!session || cycle) return;
    if (!season) { toast('افتح موسماً أولاً.'); return; }
    const id = crypto.randomUUID(); const count = data.evaluationCycles.filter(item => item.seasonId === season.id).length + 1; const now = new Date().toISOString(); const name = `دورة التقييم ${count}`;
    try {
      updateData(draft => { draft.evaluationCycles.push({ id, seasonId:season.id, name, state:'OPEN', openedAt:now, openedBy:session.name }); }, { action:'فتح دورة تقييم جديدة', entity:'evaluation-cycle', entityId:id, newValues:{ name, seasonId:season.id } });
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'تعذر فتح دورة التقييم.');
      return;
    }
    toast('تم فتح دورة تقييم جديدة.');
  }

  function closeCycle() {
    if (!session || !cycle) return;
    const now = new Date().toISOString();
    try {
      updateData(draft => {
        const current = draft.evaluationCycles.find(item => item.id === cycle.id); if (!current) throw new Error('دورة التقييم غير موجودة.');
        const snapshot = buildEvaluationCycleSnapshot(draft, cycle.id);
        current.state='ARCHIVED'; current.closedAt=now; current.closedBy=session.name; current.snapshot=snapshot;
        draft.evaluationExams.filter(item => item.cycleId === cycle.id).forEach(exam => { if (exam.state === 'OPEN') { exam.state='CLOSED'; exam.closedAt=now; exam.closedBy=session.name; } });
      }, (_before, after) => {
        const snapshot = after.evaluationCycles.find(item => item.id === cycle.id)?.snapshot;
        return { action:'إغلاق وأرشفة دورة التقييم', entity:'evaluation-cycle', entityId:cycle.id, oldValues:{state:'OPEN'}, newValues:{state:'ARCHIVED', rows:snapshot?.rows.length ?? 0, exams:snapshot?.exams.length ?? 0} };
      });
      setCloseOpen(false); toast('تم إغلاق وأرشفة دورة التقييم.');
    } catch (failure) { toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الدورة.'); }
  }

  return <div className="page-stack">
    <PageHeader title="دورات التقييم" actions={<div className="inline"><Link href="/evaluations" className="button-link">التدقيق</Link>{!cycle && <Button onClick={openCycle} disabled={!canOpen}><Plus size={17}/>فتح دورة</Button>}{visibleCycle && <Button variant="secondary" onClick={() => setCloseOpen(true)}><Archive size={17}/>إغلاق الدورة</Button>}</div>} />
    {(data.evaluationSeasons.length > 0 || data.evaluationCycles.some(item => !item.seasonId)) && <Select aria-label="اختيار الموسم" value={seasonFilter} onChange={event => router.replace(event.target.value ? `/evaluations/cycles?season=${encodeURIComponent(event.target.value)}` : '/evaluations/cycles')}><option value="">كل المواسم</option>{data.evaluationSeasons.map(item => <option key={item.id} value={item.id}>{item.name}{item.state === 'ARCHIVED' ? ' — مؤرشف' : ' — الحالي'}</option>)}{data.evaluationCycles.some(item => !item.seasonId) && <option value="__legacy__">دورات سابقة بلا موسم</option>}</Select>}
    {visibleCycle ? <>
      <div className={styles.adminSectionBar}><div><span>{visibleCycle.seasonId ? 'الدورة الحالية' : 'دورة سابقة بلا موسم'}</span><strong>{visibleCycle.name}</strong></div><Badge tone="brand">مفتوحة</Badge></div>
      <Card title="Leaderboard الدورة"><Leaderboard rows={leaderboard}/></Card>
      <Card title="امتحانات الدورة"><div className={styles.simpleMetricRow}><strong dir="ltr">{data.evaluationExams.filter(item => item.cycleId === visibleCycle.id).length}</strong><Link href={{ pathname:'/evaluations/exams', query:{cycle:visibleCycle.id} }} className="button-link">الامتحانات</Link></div></Card>
    </> : canOpen ? <Card><EmptyState title="لا توجد دورة تقييم مفتوحة" action={<Button onClick={openCycle}><Trophy size={17}/>فتح دورة تقييم</Button>}/></Card> : !archived.length && <Card><EmptyState title={!season && !cycle ? 'لا يوجد موسم مفتوح' : 'لا توجد دورات ضمن هذا الاختيار'} action={!season && !cycle ? <Link className="button-link" href="/evaluations/seasons">المواسم</Link> : undefined}/></Card>}
    {!!archived.length && <Card title="أرشيف الدورات"><div className={styles.archiveList}>{archived.map(item => <details className={styles.archiveDetails} key={item.id}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p>{data.evaluationSeasons.find(season => season.id === item.seasonId)?.name ?? 'دورات سابقة بلا موسم'}</p>{item.closedAt && <p><span dir="ltr">{date(item.closedAt)}</span> · {item.closedBy}</p>}</div><div className="inline"><Badge>{item.snapshot?.exams.length ?? 0} امتحان</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><Leaderboard rows={item.snapshot?.rows ?? []}/><Link href={{ pathname:'/evaluations/exams', query:{cycle:item.id} }} className="button-link" aria-label={`عرض امتحانات ${item.name}`}>عرض امتحانات الدورة</Link></div></details>)}</div></Card>}
    <ConfirmDialog open={closeOpen} onClose={() => setCloseOpen(false)} onConfirm={closeCycle} title="إغلاق وأرشفة دورة التقييم؟" description="سيتم تثبيت نتائج الدورة وإغلاق امتحاناتها المفتوحة." confirmLabel="إغلاق وأرشفة الدورة"/>
  </div>;
}
