import Link from 'next/link';
import { ChevronLeft, Eye } from 'lucide-react';
import { Avatar, Badge, Button, Dialog, Pagination } from '@/components/ui';
import { date, time } from '@/lib/format';
import type { AuditEntry, DemoData } from '@/lib/types';
import { roleLabels, entityLabels, fieldLabels, sensitiveField, readableValue } from './audit-values';

interface AuditRecordsProps {
  visible: AuditEntry[];
  data: DemoData;
  currentPage: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (entry: AuditEntry) => void;
}

export function AuditRecords({ visible, data, currentPage, total, pageSize, onPageChange, onSelect }: AuditRecordsProps) {
  return <>
        <div className="desktop-table table-wrap"><table className="data-table"><thead><tr><th scope="col">المستخدم</th><th scope="col">الإجراء</th><th scope="col">الموظف المرتبط</th><th scope="col">نوع السجل</th><th scope="col">التاريخ والوقت</th><th scope="col">التفاصيل</th></tr></thead><tbody>{visible.map(entry => <tr key={entry.id}><td><div className="inline"><Avatar name={entry.actor} /><div><strong>{entry.actor}</strong><div className="muted">{roleLabels[entry.role]}</div></div></div></td><td>{entry.action}</td><td>{entry.employeeId ? <Link className="button-link" href={`/employees/${entry.employeeId}`}>{data.employees.find(item => item.id === entry.employeeId)?.name || entry.employeeId}</Link> : '—'}</td><td><Badge>{entityLabels[entry.entity] || entry.entity}</Badge></td><td><span dir="ltr">{date(entry.timestamp)}</span><div className="muted" dir="ltr">{time(entry.timestamp)}</div></td><td><Button variant="ghost" onClick={() => onSelect(entry)} aria-label={`تفاصيل ${entry.action}`}><Eye size={17} />عرض</Button></td></tr>)}</tbody></table></div>
        <div className="mobile-cards">{visible.map(entry => <article className="stack" key={entry.id}><div className="list-row"><div className="inline"><Avatar name={entry.actor} /><strong>{entry.actor}</strong></div><Badge>{entityLabels[entry.entity] || entry.entity}</Badge></div><strong>{entry.action}</strong>{entry.employeeId && <span className="muted">{data.employees.find(item => item.id === entry.employeeId)?.name || entry.employeeId}</span>}<div className="list-row"><span className="muted" dir="ltr">{date(entry.timestamp)} · <bdi dir="ltr">{time(entry.timestamp)}</bdi></span><Button variant="ghost" onClick={() => onSelect(entry)} aria-label={`تفاصيل ${entry.action}`}>التفاصيل<ChevronLeft size={16} /></Button></div></article>)}</div>
        <Pagination page={currentPage} total={total} pageSize={pageSize} onChange={onPageChange} />
  </>;
}

interface AuditDetailsDialogProps {
  selected: AuditEntry | null;
  data: DemoData;
  onClose: () => void;
}

export function AuditDetailsDialog({ selected, data, onClose }: AuditDetailsDialogProps) {
  const selectedEmployee = selected?.employeeId ? data.employees.find(item => item.id === selected.employeeId) : undefined;
  const changedKeys = selected ? Array.from(new Set([...Object.keys(selected.oldValues), ...Object.keys(selected.newValues)])).filter(key => !sensitiveField.test(key)) : [];
  return (
    <Dialog open={Boolean(selected)} onClose={onClose} title="تفاصيل العملية" description={selected?.action} wide>
      {selected && <div className="stack"><div className="detail-grid"><div className="detail-item"><span>نفّذ الإجراء</span><strong>{selected.actor}</strong><span>{roleLabels[selected.role]}</span></div><div className="detail-item"><span>التاريخ والوقت — بغداد</span><strong dir="ltr">{date(selected.timestamp)}</strong><span dir="ltr">{time(selected.timestamp)}</span></div><div className="detail-item"><span>نوع السجل</span><strong>{entityLabels[selected.entity] || selected.entity}</strong><span dir="ltr">{selected.entityId}</span></div><div className="detail-item"><span>الموظف المرتبط</span>{selectedEmployee ? <Link className="button-link" href={`/employees/${selectedEmployee.id}`}>{selectedEmployee.name}</Link> : <strong>—</strong>}</div></div>
        {changedKeys.length ? <div className="stack">{changedKeys.map(key => <div className="form-section" key={key}><h3>{fieldLabels[key] || key}</h3><div className="grid-2"><div className="detail-item"><span>قبل الإجراء</span><strong style={{ overflowWrap: 'anywhere' }}>{readableValue(selected.oldValues[key], key, data)}</strong></div><div className="detail-item"><span>بعد الإجراء</span><strong style={{ overflowWrap: 'anywhere' }}>{readableValue(selected.newValues[key], key, data)}</strong></div></div></div>)}</div> : <div className="notice">تم تسجيل الإجراء، ولا توجد قيم تفصيلية قابلة للعرض.</div>}
        {(selected.ip || selected.userAgent) && <details><summary>معلومات التسجيل</summary><div className="detail-grid">{selected.ip && <div className="detail-item"><span>عنوان الاتصال</span><span dir="ltr">{selected.ip}</span></div>}{selected.userAgent && <div className="detail-item"><span>وسيلة الاستخدام</span><span style={{ overflowWrap: 'anywhere' }}>{selected.userAgent}</span></div>}</div></details>}
        <div className="notice">هذا سجل تجريبي لجلسة المعاينة. لا تُعرض كلمات المرور أو الرموز السرية ضمن تفاصيل العمليات.</div>
        <div className="form-actions"><Button variant="secondary" onClick={onClose}>إغلاق التفاصيل</Button></div>
      </div>}
    </Dialog>
  );
}
