'use client';

import Link from 'next/link';
import { Archive, Flag, Plus } from 'lucide-react';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import { date } from '@/lib/format';
import { SeasonLeaderboard } from '@/components/evaluations/season-leaderboard';
import { useSeasonManagement } from '@/components/evaluations/use-season-management';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationSeasonsPage() {
  const {
    data, season, cycle, rows, archived, selectedSeason,
    createOpen, setCreateOpen, closeOpen, setCloseOpen, name, setName,
    startDate, setStartDate, error, createSeason, closeSeason, pending,
  } = useSeasonManagement();

  return <div className="page-stack">
    <PageHeader title="المواسم" actions={<div className="inline"><Link href="/evaluations" className="button-link">التدقيق</Link>{!season && <Button onClick={() => setCreateOpen(true)}><Plus size={17}/>فتح موسم</Button>}{season && <Button variant="secondary" onClick={() => setCloseOpen(true)} disabled={Boolean(cycle)}><Archive size={17}/>إغلاق الموسم</Button>}</div>} />
    {!season ? <Card><EmptyState title="لا يوجد موسم مفتوح" action={<Button onClick={() => setCreateOpen(true)}><Flag size={17}/>فتح موسم جديد</Button>}/></Card> : <>
      <section className={styles.seasonAdminHero}><div><span className="eyebrow">الموسم الحالي</span><h2>{season.name}</h2><Badge tone="brand">مفتوح</Badge></div><div className={styles.seasonHeroMetric}><span>المصححون</span><strong dir="ltr">{rows.length}</strong></div><div className={styles.seasonHeroMetric}><span>Drives</span><strong dir="ltr">{data.evaluationCycles.filter(item => item.seasonId===season.id).length}</strong></div></section>
      <div className="inline"><SafeDeleteButton collection="evaluationSeasons" id={season.id} label={season.name} /></div><Card title="Leaderboard الموسم"><SeasonLeaderboard rows={rows}/></Card>
      <Card title="Drives الموسم"><div className={styles.simpleMetricRow}><strong dir="ltr">{data.evaluationCycles.filter(item => item.seasonId===season.id).length}</strong><Link href={{ pathname:'/evaluations/cycles', query:{season:season.id} }} className="button-link">Drives</Link></div></Card>
    </>}
    {!!archived.length && <Card title="أرشيف المواسم"><div className={styles.archiveList}>{archived.map(item => <details className={styles.archiveDetails} key={item.id} id={`season-${item.id}`} open={selectedSeason === item.id || undefined}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p dir="ltr">{date(item.startDate)}{item.endDate ? ` — ${date(item.endDate)}` : ''}</p></div><div className="inline"><Badge>{item.snapshot?.cycleIds.length ?? 0} Drive</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><SeasonLeaderboard rows={item.snapshot?.rows ?? []}/><SafeDeleteButton collection="evaluationSeasons" id={item.id} label={item.name} /><Link href={{ pathname:'/evaluations/cycles', query:{season:item.id} }} className="button-link" aria-label={`عرض Drives ${item.name}`}>عرض Drives الموسم</Link></div></details>)}</div></Card>}
    <Dialog open={createOpen} onClose={() => { if (!pending) setCreateOpen(false); }} title="فتح موسم جديد"><form className="stack" onSubmit={createSeason}><Field label="اسم الموسم"><Input value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="تاريخ بداية الموسم" required><Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button disabled={pending} type="button" variant="secondary" onClick={()=>setCreateOpen(false)}>إلغاء</Button><Button loading={pending} type="submit">فتح الموسم</Button></div></form></Dialog>
    <ConfirmDialog open={closeOpen} onClose={()=>setCloseOpen(false)} onConfirm={closeSeason} title="إغلاق وأرشفة الموسم؟" description="سيتم تثبيت الترتيب والرانكات وإحصائيات الموسم." confirmLabel="إغلاق وأرشفة الموسم"/>
  </div>;
}
