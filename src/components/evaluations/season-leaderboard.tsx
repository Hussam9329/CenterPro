'use client';

import { Avatar } from '@/components/ui';
import { formatAccuracy, formatAveragePapers } from '@/lib/evaluations';
import type { SeasonLeaderboardRow } from '@/lib/types';
import { RankBadge } from './rank-badge';
import styles from './evaluations.module.css';

export function SeasonLeaderboard({ rows, highlightEmployeeId }: { rows: SeasonLeaderboardRow[]; highlightEmployeeId?: string }) {
  if (!rows.length) return <p className="muted">لا توجد بيانات موسم حتى الآن.</p>;
  return <>
    <div className="table-wrap" role="region" aria-label="جدول الترتيب الموسمي" tabIndex={0}><table className={styles.seasonTable} aria-label="الترتيب الموسمي"><thead><tr><th scope="col" aria-label="الترتيب">#</th><th scope="col">المصحح</th><th scope="col">الرانك</th><th scope="col">النقاط</th><th scope="col">الأوراق</th><th scope="col">الامتحانات</th><th scope="col">الدورات</th><th scope="col">الأيام</th><th scope="col">متوسط اليوم</th><th scope="col">الدقة</th></tr></thead><tbody>{rows.map((row,index) => <tr key={row.employeeId} className={row.employeeId === highlightEmployeeId ? styles.highlightRow : ''}><td><span className={`${styles.rank} ${index < 3 ? styles.rankTop : ''}`}>{index + 1}</span></td><td><div className="inline"><Avatar name={row.employeeName} size="sm"/><div><strong>{row.employeeName}</strong><div className="muted" dir="ltr">{row.employeeCode}</div></div></div></td><td><RankBadge score={row.score} size="sm"/></td><td><strong className={styles.score} dir="ltr">{row.score}</strong></td><td dir="ltr">{row.papers}</td><td dir="ltr">{row.examsEvaluated}</td><td dir="ltr">{row.cyclesEvaluated}</td><td dir="ltr">{row.attendanceDays}</td><td dir="ltr">{formatAveragePapers(row.averagePapersPerDay)}</td><td dir="ltr">{formatAccuracy(row.accuracy)}</td></tr>)}</tbody></table></div>
    <div className={styles.mobileLeaderboard}>{rows.map((row,index) => <article className={`${styles.mobileLeaderCard} ${row.employeeId === highlightEmployeeId ? styles.highlightCard : ''}`} key={row.employeeId}><span className={`${styles.rank} ${index < 3 ? styles.rankTop : ''}`}>{index + 1}</span><div><strong>{row.employeeName}</strong><div className="muted" dir="ltr">{row.employeeCode}</div></div><RankBadge score={row.score} size="sm"/><strong className={styles.score} dir="ltr">{row.score} pts</strong><p>{row.papers} ورقة · {row.examsEvaluated} امتحان · {row.cyclesEvaluated} دورة · {row.attendanceDays} يوم · {formatAveragePapers(row.averagePapersPerDay)} · الدقة {formatAccuracy(row.accuracy)}</p></article>)}</div>
  </>;
}
