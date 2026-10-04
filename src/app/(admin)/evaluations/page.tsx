'use client';

import Link from 'next/link';
import { ClipboardCheck, Layers3, Trophy } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, PageHeader } from '@/components/ui';
import { getOpenEvaluationCycle, getOpenEvaluationSeason } from '@/lib/evaluations';
import styles from '@/components/evaluations/evaluations.module.css';

export default function EvaluationsAdminHub() {
  const { data } = useDemo();
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const cycleExams = cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id) : [];
  const cards = [
    { href:'/evaluations/exams', title:'الامتحانات', icon:ClipboardCheck, value:cycleExams.length, status: cycleExams.filter(item => item.state === 'OPEN').length ? `${cycleExams.filter(item => item.state === 'OPEN').length} مفتوح` : 'لا يوجد مفتوح' },
    { href:'/evaluations/cycles', title:'دورات التقييم', icon:Trophy, value:data.evaluationCycles.length, status:cycle ? cycle.name : 'لا توجد دورة مفتوحة' },
    { href:'/evaluations/seasons', title:'المواسم', icon:Layers3, value:data.evaluationSeasons.length, status:season ? season.name : 'لا يوجد موسم مفتوح' },
  ];
  return <div className="page-stack">
    <PageHeader title="التدقيق" />
    <div className={styles.adminHubGrid}>{cards.map(item => <Link href={item.href} key={item.href} className={styles.adminHubCard}>
      <div className={styles.adminHubIcon}><item.icon size={24}/></div>
      <div className={styles.adminHubBody}><h2>{item.title}</h2><strong dir="ltr">{item.value}</strong><Badge tone="brand">{item.status}</Badge></div>
    </Link>)}</div>
    <Card title="الحالة الحالية">
      <div className={styles.adminHubStatus}>
        <div><span>الموسم</span><strong>{season?.name ?? '—'}</strong></div>
        <div><span>الدورة</span><strong>{cycle?.name ?? '—'}</strong></div>
        <div><span>الامتحانات المفتوحة</span><strong dir="ltr">{cycleExams.filter(item => item.state === 'OPEN').length}</strong></div>
      </div>
    </Card>
  </div>;
}
