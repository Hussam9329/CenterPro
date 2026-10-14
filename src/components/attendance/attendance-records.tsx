import { Avatar, Badge, Button, Select } from '@/components/ui';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { statusLabel } from '@/lib/attendance';
import { date, duration, time } from '@/lib/format';
import type { AttendanceStatus, Department } from '@/lib/types';
import { attendanceStatuses as statuses, statusTone, type AttendanceRow as Row } from './day-helpers';
import type { AttendanceReview } from './use-attendance-review';
import styles from './attendance.module.css';

function AttendanceStatusField({ row, review }: { row: Row; review: AttendanceReview }) {
  const { locked, pending, quickPendingEmployeeId, quickReview } = review;
  if (locked) return <Badge tone={statusTone(row.record.status)}>{statusLabel(row.record.status)}</Badge>;
  return <Select
    className={styles.quickStatusSelect}
    aria-label={`تغيير حالة ${row.employee.name}`}
    title="الحضور يحفظ مباشرة بوقت بدء الدوام عند عدم وجود تسجيل سابق. الغياب والاستثناء يفتحان نافذة المراجعة."
    value={row.record.status}
    disabled={pending}
    aria-busy={pending && quickPendingEmployeeId === row.employee.id}
    onChange={event => { void quickReview(row, event.target.value as AttendanceStatus); }}
  >{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</Select>;
}

export function AttendanceRecords({ rows: pageRows, departments, review }: {
  rows: Row[];
  departments: Department[];
  review: AttendanceReview;
}) {
  const { locked, pending, openEdit } = review;
  return <><div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>الحالة</th><th>وقت الحضور</th><th>التأخير</th><th>المصدر / آخر ملاحظة</th><th>الإجراء</th></tr></thead><tbody>{pageRows.map(row => <tr key={`${row.day.id}-${row.employee.id}`}><td><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><div className="muted">{row.employee.code} · {departments.find(dep => dep.id === row.employee.departmentId)?.name}</div></div></div></td><td><AttendanceStatusField row={row} review={review} /></td><td dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</td><td>{row.record.latenessSeconds ? <span className="text-brand">{duration(row.record.latenessSeconds)}</span> : '—'}</td><td><span>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'يدوي' : '—'}</span>{row.record.reason && <p className={styles.recordNote}>{row.record.reason}</p>}</td><td><div className="inline"><Button variant="ghost" disabled={pending} onClick={() => openEdit(row)}>{locked ? 'التفاصيل' : 'مراجعة'}</Button>{row.record.id && <SafeDeleteButton collection="attendance" id={row.record.id} label={`حضور ${row.employee.name}`} compact />}</div></td></tr>)}</tbody></table></div><div className="mobile-cards">{pageRows.map(row => <article className={styles.attendanceCard} key={`${row.day.id}-${row.employee.id}`}><div className={styles.cardHeading}><div className="inline"><Avatar name={row.employee.name} src={row.employee.photo} /><div><strong>{row.employee.name}</strong><small className="muted">{row.employee.code} · {date(row.day.date)}</small></div></div><AttendanceStatusField row={row} review={review} /></div><div className={styles.cardMetrics}><span>الحضور <b dir="ltr">{row.record.checkIn ? time(row.record.checkIn) : '—'}</b></span><span>التأخير <b>{row.record.latenessSeconds ? duration(row.record.latenessSeconds) : '—'}</b></span></div><p className={styles.recordNote}>{row.record.source === 'QR' ? 'QR' : row.record.source === 'MANUAL' ? 'إدخال يدوي' : 'لم يسجل حضور'}{row.record.reason ? ` · ${row.record.reason}` : ''}</p><div className="inline"><Button variant="secondary" disabled={pending} onClick={() => openEdit(row)}>{locked ? 'عرض التفاصيل' : 'مراجعة الحالة'}</Button>{row.record.id && <SafeDeleteButton collection="attendance" id={row.record.id} label={`حضور ${row.employee.name}`} compact />}</div></article>)}</div></>;
}
