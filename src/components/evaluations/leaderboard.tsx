'use client';

import { Avatar, EmptyState } from '@/components/ui';
import { formatAccuracy } from '@/lib/evaluations';
import type { EvaluationLeaderboardRow } from '@/lib/types';
import styles from './evaluations.module.css';

export function Leaderboard({ rows, emptyTitle = 'لا توجد بيانات تقييم حتى الآن' }: { rows: EvaluationLeaderboardRow[]; emptyTitle?: string }) {
  if (!rows.length) return <EmptyState title={emptyTitle} description="ستظهر النتائج هنا بعد توفر موظفي التصحيح وبيانات التدقيق." />;
  return <>
    <div className="table-wrap">
      <table className={styles.leaderboardTable} aria-label="ترتيب المصححين">
        <thead><tr><th scope="col" aria-label="الترتيب">#</th><th scope="col">المصحح</th><th scope="col">الأوراق</th><th scope="col">الامتحانات</th><th scope="col">أخطاء التصحيح</th><th scope="col">أخطاء السلوك</th><th scope="col">معدل الدقة</th><th scope="col">التقييم</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.employeeId}><td><span className={`${styles.rank} ${index < 3 ? styles.rankTop : ''}`}>{index + 1}</span></td><td><div className="inline"><Avatar name={row.employeeName} size="sm"/><div><strong>{row.employeeName}</strong><div className="muted" dir="ltr">{row.employeeCode}</div></div></div></td><td dir="ltr">{row.papers}</td><td dir="ltr">{row.examsEvaluated}</td><td dir="ltr">{row.correctionErrors}</td><td dir="ltr">{row.behaviorErrors}</td><td dir="ltr">{formatAccuracy(row.accuracy)}</td><td><span className={styles.score} dir="ltr">{row.score}</span></td></tr>)}</tbody>
      </table>
    </div>
    <div className={styles.mobileLeaderboard}>{rows.map((row, index) => <article className={styles.mobileLeaderCard} key={row.employeeId}><span className={`${styles.rank} ${index < 3 ? styles.rankTop : ''}`}>{index + 1}</span><div><strong>{row.employeeName}</strong><div className="muted" dir="ltr">{row.employeeCode}</div></div><strong className={styles.score} dir="ltr">{row.score}</strong><p>{row.papers} ورقة · {row.examsEvaluated} امتحان · {row.correctionErrors} خطأ تصحيح · {row.behaviorErrors} سلوك · الدقة {formatAccuracy(row.accuracy)}</p></article>)}</div>
  </>;
}
