import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { date } from '@/lib/format';
import type { Workday } from '@/lib/types';
import styles from './attendance.module.css';

export function OpenDayBlock({ day, reopening = false, onClose }: { day: Workday; reopening?: boolean; onClose: () => void }) {
  return <div className={styles.openDayBlock}><CalendarClock size={30} /><h3>يوجد يوم حضور مفتوح حالياً.</h3><p>{reopening ? 'أغلق اليوم المفتوح قبل إعادة فتح يوم آخر.' : 'يجب إغلاقه قبل فتح يوم حضور جديد.'}</p><Badge tone="success">{date(day.date)}</Badge><Link className="button-link" href={`/attendance/${day.id}`} onClick={onClose}>الذهاب إلى اليوم المفتوح</Link></div>;
}
