import type { ReactNode } from 'react';
import { Badge, Button, Card, Dialog, Field, Input, Pagination, Select, Textarea } from '@/components/ui';
import { date, money } from '@/lib/format';
import type { Bonus, Deduction, DemoData } from '@/lib/types';
import styles from './finance.module.css';

export type Adjustment = Bonus | Deduction;
export interface AdjustmentForm { employeeId: string; amount: string; date: string; reason: string; type: Deduction['type']; customType: string }

interface AdjustmentRecordsProps {
  visible: Adjustment[];
  data: DemoData;
  isDeduction: boolean;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  rowActions: (item: Adjustment) => ReactNode;
}

export function AdjustmentRecords({ visible, data, isDeduction, page, total, onPageChange, rowActions }: AdjustmentRecordsProps) {
  return <>
<div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>المبلغ</th><th>التاريخ</th>{isDeduction && <th>النوع</th>}<th>السبب</th><th>أضيف بواسطة</th><th>الإجراءات</th></tr></thead><tbody>{visible.map(item => { const employee = data.employees.find(person => person.id === item.employeeId); return <tr key={item.id}><td>{employee?.name}<div className={styles.small}>{employee?.code}</div></td><td className={`amount ${isDeduction ? 'text-danger' : ''}`}><strong>{money(item.amount)}</strong></td><td>{date(item.date)}</td>{'type' in item && <td><Badge tone="neutral">{item.type === 'أخرى' ? (item as Deduction).customType : String(item.type)}</Badge></td>}<td style={{ maxWidth: 280 }}>{item.reason}</td><td>{item.createdBy}<div className={styles.small}>{date(item.createdAt)}</div></td><td>{rowActions(item)}</td></tr>; })}</tbody></table></div><div className="mobile-cards">{visible.map(item => <Card key={item.id}><div className={styles.recordHead}><strong>{data.employees.find(person => person.id === item.employeeId)?.name}</strong><strong className={`amount ${isDeduction ? 'text-danger' : ''}`}>{money(item.amount)}</strong></div><p>{item.reason}</p><div className={styles.recordHead}><div className="inline"><span className={styles.small}>{date(item.date)}</span>{'type' in item && <Badge>{item.type === 'أخرى' ? (item as Deduction).customType : String(item.type)}</Badge>}</div>{rowActions(item)}</div></Card>)}</div><Pagination page={page} total={total} pageSize={8} onChange={onPageChange} />
  </>;
}

interface AdjustmentDialogProps {
  open: boolean;
  pending: boolean;
  editing: boolean;
  noun: string;
  isDeduction: boolean;
  data: DemoData;
  form: AdjustmentForm;
  error: string;
  onFormChange: (value: AdjustmentForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}

export function AdjustmentDialog({ open, pending, editing, noun, isDeduction, data, form, error, onFormChange, onClose, onSubmit }: AdjustmentDialogProps) {
  return (
    <Dialog open={open} onClose={() => { if (!pending) onClose(); }} title={`${editing ? 'تعديل' : 'إضافة'} ${noun}`}><form onSubmit={onSubmit} className="stack"><Field label="الموظف" required><Select required value={form.employeeId} onChange={e => onFormChange({ ...form, employeeId: e.target.value })}><option value="">اختر الموظف</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}{!item.active ? ' (غير فعال)' : ''}</option>)}</Select></Field><div className="form-grid"><Field label="المبلغ (د.ع)" required><Input type="number" min="0" step="1" inputMode="numeric" required value={form.amount} onChange={e => onFormChange({ ...form, amount: e.target.value })} /></Field><Field label="التاريخ" required><Input type="date" required value={form.date} onChange={e => onFormChange({ ...form, date: e.target.value })} /></Field></div>{isDeduction && <Field label="نوع الخصم" required><Select value={form.type} onChange={e => onFormChange({ ...form, type: e.target.value as Deduction['type'] })}><option>اعتراض</option><option>خصم إداري</option><option>أخرى</option></Select></Field>}{isDeduction && form.type === 'أخرى' && <Field label="تحديد نوع الخصم" required><Input required value={form.customType} maxLength={80} onChange={e => onFormChange({ ...form, customType: e.target.value })} /></Field>}<Field label={`سبب ${noun}`} required><Textarea required rows={3} value={form.reason} maxLength={1000} onChange={e => onFormChange({ ...form, reason: e.target.value })} placeholder={isDeduction ? 'مثال: اعتراض على تصحيح السؤال رقم 4' : 'مثال: أداء مميز خلال الأسبوع'} /></Field>{error && <p className="text-danger" role="alert">{error}</p>}<div className="form-actions"><Button disabled={pending} type="button" variant="secondary" onClick={onClose}>إلغاء</Button><Button loading={pending} type="submit">حفظ {noun}</Button></div></form></Dialog>
  );
}
