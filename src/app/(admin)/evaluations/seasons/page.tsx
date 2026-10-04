'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Archive, Flag, Plus } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import { buildEvaluationSeasonSnapshot, getOpenEvaluationCycle, getOpenEvaluationSeason, getSeasonLeaderboard } from '@/lib/evaluations';
import { DEMO_MONTH } from '@/lib/mock-data';
import { date } from '@/lib/format';
import { SeasonLeaderboard } from '@/components/evaluations/season-leaderboard';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationSeasonsPage() {
  const { data, session, updateData } = useDemo();
  const params = useSearchParams();
  const toast = useToast();
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const rows = season ? getSeasonLeaderboard(data, season.id) : [];
  const archived = [...data.evaluationSeasons].filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const [createOpen, setCreateOpen] = useState(false); const [closeOpen, setCloseOpen] = useState(false); const [name,setName]=useState(''); const [startDate,setStartDate]=useState(`${DEMO_MONTH}-01`); const [error,setError]=useState('');

  function createSeason(event: FormEvent) {
    event.preventDefault(); if (!session || season) return; const id=crypto.randomUUID(); const value=name.trim() || `الموسم ${data.evaluationSeasons.length+1}`; const now=new Date().toISOString();
    try { updateData(draft => { draft.evaluationSeasons.push({ id, name:value, startDate, state:'OPEN', openedAt:now, openedBy:session.name }); }, { action:'فتح موسم تقييم جديد', entity:'evaluation-season', entityId:id, newValues:{name:value,startDate} }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر فتح الموسم.'); return; }
    setCreateOpen(false); setName(''); setError(''); toast('تم فتح الموسم.');
  }

  function closeSeason() {
    if (!session || !season) return; if (cycle) { toast('أغلق دورة التقييم الحالية أولاً.'); return; } const now=new Date().toISOString();
    try {
      updateData(draft => {
        const current = draft.evaluationSeasons.find(item => item.id === season.id);
        if (!current) throw new Error('الموسم غير موجود.');
        current.endDate = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Baghdad', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(now));
        current.snapshot = buildEvaluationSeasonSnapshot(draft, season.id);
        current.state = 'ARCHIVED'; current.closedAt = now; current.closedBy = session.name;
      }, (_before, after) => {
        const snapshot = after.evaluationSeasons.find(item => item.id === season.id)?.snapshot;
        return { action:'إغلاق وأرشفة الموسم', entity:'evaluation-season', entityId:season.id, oldValues:{state:'OPEN'}, newValues:{state:'ARCHIVED', rows:snapshot?.rows.length ?? 0, cycles:snapshot?.cycleIds.length ?? 0} };
      });
      setCloseOpen(false); toast('تم أرشفة الموسم.');
    }
    catch (failure) { toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الموسم.'); }
  }

  return <div className="page-stack">
    <PageHeader title="المواسم" actions={<div className="inline"><Link href="/evaluations" className="button-link">التدقيق</Link>{!season && <Button onClick={() => setCreateOpen(true)}><Plus size={17}/>فتح موسم</Button>}{season && <Button variant="secondary" onClick={() => setCloseOpen(true)} disabled={Boolean(cycle)}><Archive size={17}/>إغلاق الموسم</Button>}</div>} />
    {!season ? <Card><EmptyState title="لا يوجد موسم مفتوح" action={<Button onClick={() => setCreateOpen(true)}><Flag size={17}/>فتح موسم جديد</Button>}/></Card> : <>
      <section className={styles.seasonAdminHero}><div><span className="eyebrow">الموسم الحالي</span><h2>{season.name}</h2><Badge tone="brand">مفتوح</Badge></div><div className={styles.seasonHeroMetric}><span>المصححون</span><strong dir="ltr">{rows.length}</strong></div><div className={styles.seasonHeroMetric}><span>الدورات</span><strong dir="ltr">{data.evaluationCycles.filter(item => item.seasonId===season.id).length}</strong></div></section>
      <Card title="Leaderboard الموسم"><SeasonLeaderboard rows={rows}/></Card>
      <Card title="دورات الموسم"><div className={styles.simpleMetricRow}><strong dir="ltr">{data.evaluationCycles.filter(item => item.seasonId===season.id).length}</strong><Link href={{ pathname:'/evaluations/cycles', query:{season:season.id} }} className="button-link">دورات التقييم</Link></div></Card>
    </>}
    {!!archived.length && <Card title="أرشيف المواسم"><div className={styles.archiveList}>{archived.map(item => <details className={styles.archiveDetails} key={item.id} id={`season-${item.id}`} open={params.get('season') === item.id || undefined}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p dir="ltr">{date(item.startDate)}{item.endDate ? ` — ${date(item.endDate)}` : ''}</p></div><div className="inline"><Badge>{item.snapshot?.cycleIds.length ?? 0} دورة</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><SeasonLeaderboard rows={item.snapshot?.rows ?? []}/><Link href={{ pathname:'/evaluations/cycles', query:{season:item.id} }} className="button-link" aria-label={`عرض دورات ${item.name}`}>عرض دورات الموسم</Link></div></details>)}</div></Card>}
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="فتح موسم جديد"><form className="stack" onSubmit={createSeason}><Field label="اسم الموسم"><Input value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="تاريخ بداية الموسم" required><Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={()=>setCreateOpen(false)}>إلغاء</Button><Button type="submit">فتح الموسم</Button></div></form></Dialog>
    <ConfirmDialog open={closeOpen} onClose={()=>setCloseOpen(false)} onConfirm={closeSeason} title="إغلاق وأرشفة الموسم؟" description="سيتم تثبيت الترتيب والرانكات وإحصائيات الموسم." confirmLabel="إغلاق وأرشفة الموسم"/>
  </div>;
}
