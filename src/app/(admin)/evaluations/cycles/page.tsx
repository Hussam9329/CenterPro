'use client';

import Link from 'next/link';
import { Archive, Plus, Trophy } from 'lucide-react';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Select } from '@/components/ui';
import { date } from '@/lib/format';
import { Leaderboard } from '@/components/evaluations/leaderboard';
import { useCycleManagement } from '@/components/evaluations/use-cycle-management';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationCyclesPage() {
  const { data, season, cycle, visibleCycle, canOpen, archived, leaderboard, seasonFilter, selectSeason, closeOpen, setCloseOpen, openCycle, closeCycle, pending } = useCycleManagement();

  return <div className="page-stack">
    <PageHeader title="Drives" actions={<div className="inline"><Link href="/evaluations" className="button-link">التدقيق</Link>{!cycle && <Button loading={pending} onClick={openCycle} disabled={!canOpen}><Plus size={17}/>فتح Drive</Button>}{visibleCycle && <Button variant="secondary" onClick={() => setCloseOpen(true)}><Archive size={17}/>إغلاق الـ Drive</Button>}</div>} />
    {(data.evaluationSeasons.length > 0 || data.evaluationCycles.some(item => !item.seasonId)) && <Select aria-label="اختيار الموسم" value={seasonFilter} onChange={event => selectSeason(event.target.value)}><option value="">كل المواسم</option>{data.evaluationSeasons.map(item => <option key={item.id} value={item.id}>{item.name}{item.state === 'ARCHIVED' ? ' — مؤرشف' : ' — الحالي'}</option>)}{data.evaluationCycles.some(item => !item.seasonId) && <option value="__legacy__">Drives سابقة بلا موسم</option>}</Select>}
    {visibleCycle ? <>
      <div className={styles.adminSectionBar}><div><span>{visibleCycle.seasonId ? 'الـ Drive الحالي' : 'Drive سابق بلا موسم'}</span><strong>{visibleCycle.name}</strong></div><Badge tone="brand">مفتوحة</Badge></div>
      <div className="inline"><SafeDeleteButton collection="evaluationCycles" id={visibleCycle.id} label={visibleCycle.name} /></div><Card title="Leaderboard الـ Drive"><Leaderboard rows={leaderboard}/></Card>
      <Card title="امتحانات الـ Drive"><div className={styles.simpleMetricRow}><strong dir="ltr">{data.evaluationExams.filter(item => item.cycleId === visibleCycle.id).length}</strong><Link href={{ pathname:'/evaluations/exams', query:{cycle:visibleCycle.id} }} className="button-link">الامتحانات</Link></div></Card>
    </> : canOpen ? <Card><EmptyState title="لا يوجد Drive مفتوح" action={<Button loading={pending} onClick={openCycle}><Trophy size={17}/>فتح أول Drive</Button>}/></Card> : !archived.length && <Card><EmptyState title={!season && !cycle ? 'لا يوجد موسم مفتوح' : 'لا توجد Drives ضمن هذا الاختيار'} action={!season && !cycle ? <Link className="button-link" href="/evaluations/seasons">المواسم</Link> : undefined}/></Card>}
    {!!archived.length && <Card title="أرشيف الـ Drives"><div className={styles.archiveList}>{archived.map(item => <details className={styles.archiveDetails} key={item.id}><summary className={styles.archiveRow}><div><strong>{item.name}</strong><p>{data.evaluationSeasons.find(season => season.id === item.seasonId)?.name ?? 'Drives سابقة بلا موسم'}</p>{item.closedAt && <p><span dir="ltr">{date(item.closedAt)}</span> · {item.closedBy}</p>}</div><div className="inline"><Badge>{item.snapshot?.exams.length ?? 0} امتحان</Badge><Badge tone="brand">{item.snapshot?.rows.length ?? 0} مصحح</Badge></div></summary><div className="stack" style={{padding:'14px 4px 4px'}}><Leaderboard rows={item.snapshot?.rows ?? []}/><SafeDeleteButton collection="evaluationCycles" id={item.id} label={item.name} /><Link href={{ pathname:'/evaluations/exams', query:{cycle:item.id} }} className="button-link" aria-label={`عرض امتحانات ${item.name}`}>عرض امتحانات الـ Drive</Link></div></details>)}</div></Card>}
    <ConfirmDialog open={closeOpen} onClose={() => setCloseOpen(false)} onConfirm={closeCycle} title="إغلاق وأرشفة الـ Drive؟" description="سيتم تثبيت نتائج الـ Drive وإغلاق امتحاناته المفتوحة." confirmLabel="إغلاق وأرشفة الـ Drive"/>
  </div>;
}
