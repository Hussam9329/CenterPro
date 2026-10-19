// Display-only month calendar for the attendance hub; each workday links to its existing detail page.
import Link from 'next/link';
import type { Workday } from '@/lib/types';
import { attendanceDateLabel } from '@/lib/format';
import styles from './attendance-calendar.module.css';

export interface CalendarDaySummary { expected: number; present: number; unresolved: number }

// Iraqi work weeks start on Saturday.
const weekdays = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export function AttendanceCalendar({ month, days, summary, today }: { month: string; days: Workday[]; summary: (day: Workday) => CalendarDaySummary; today: string }) {
  const [year, value] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, value - 1, 1)).getUTCDay() + 1) % 7;
  const byDate = new Map(days.map(day => [day.date, day]));
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)];
  return <div className={styles.calendar}>
    <div className={styles.weekdays} aria-hidden="true">{weekdays.map(name => <span key={name}>{name}</span>)}</div>
    <div className={styles.grid}>
      {cells.map((date, index) => {
        if (!date) return <span key={`lead-${index}`} className={styles.blank}/>;
        const day = byDate.get(date);
        const number = Number(date.slice(8));
        if (!day) return <span key={date} className={`${styles.cell} ${styles.empty} ${date === today ? styles.today : ''}`}><b>{number}</b></span>;
        const totals = summary(day);
        const rate = totals.expected ? Math.round(totals.present / totals.expected * 100) : 0;
        const level = rate >= 90 ? styles.high : rate >= 70 ? styles.mid : styles.low;
        return <Link key={date} href={`/attendance/${day.id}`} className={`${styles.cell} ${level} ${date === today ? styles.today : ''}`} aria-label={`تفاصيل حضور ${attendanceDateLabel(day.date)}`}>
          <span className={styles.top}><b>{number}</b>{day.state === 'OPEN' && <i className={styles.open} title="مفتوح"/>}</span>
          <strong dir="ltr">{rate}%</strong>
          <small>{totals.present}/{totals.expected}{totals.unresolved ? <em> · {totals.unresolved} غير محسوم</em> : null}</small>
        </Link>;
      })}
    </div>
    <div className={styles.legend} aria-hidden="true"><span><i className={styles.high}/>90% فأكثر</span><span><i className={styles.mid}/>70–89%</span><span><i className={styles.low}/>أقل من 70%</span><span><i className={styles.open}/>يوم مفتوح</span></div>
  </div>;
}
