import { ArrowUpRight } from 'lucide-react';
import { Button, Card, Pagination } from '@/components/ui';
import { money } from '@/lib/format';
import type { PayrollResult } from '@/lib/types';
import { PaymentBadge } from './payroll-breakdown';
import styles from './finance.module.css';

interface PayrollRecordsProps {
  visible: PayrollResult[];
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (employeeId: string) => void;
  onPayment: (result: PayrollResult) => void;
  canPayment: boolean;
}

export function PayrollRecords({ visible, page, total, pageSize, onPageChange, onSelect, onPayment, canPayment }: PayrollRecordsProps) {
  return <>
<div className="table-wrap desktop-table"><table className="data-table"><thead><tr><th>الموظف</th><th>القسم / نوع الراتب</th><th>مطلوب</th><th>حضور</th><th>غياب بعذر / بدونه</th><th>الأساسي</th><th>خصومات أخرى</th><th>مكافآت</th><th>الصافي</th><th>الصرف</th><th aria-label="الإجراءات" /></tr></thead><tbody>{visible.map(item => <tr key={item.employeeId}><td><button className={styles.rowName} onClick={() => onSelect(item.employeeId)}>{item.employeeName}<small>{item.employeeCode}</small></button></td><td>{item.departmentName}<div className={styles.small}>{item.salaryMode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</div></td><td>{item.requiredDays}</td><td>{item.attendanceDays}</td><td>{item.excusedDays} / {item.unexcusedDays}</td><td className="amount">{money(item.baseSalary)}</td><td className="amount">{money(item.otherDeductions)}</td><td className="amount">{money(item.bonuses)}</td><td className={`amount ${item.finalSalary < 0 ? 'text-danger' : ''}`}><strong>{money(item.finalSalary)}</strong></td><td><PaymentBadge status={item.paymentStatus} /></td><td><Button variant="ghost" onClick={() => onSelect(item.employeeId)} aria-label={`تفاصيل راتب ${item.employeeName}`}><ArrowUpRight size={17} /></Button></td></tr>)}</tbody></table></div><div className="mobile-cards">{visible.map(item => <Card key={item.employeeId}><div className={styles.recordHead}><button className={styles.rowName} onClick={() => onSelect(item.employeeId)}>{item.employeeName}<small>{item.employeeCode} · {item.departmentName}</small></button><PaymentBadge status={item.paymentStatus} /></div><div className={styles.compactMetrics}><div><span>المطلوب</span><strong>{item.requiredDays}</strong></div><div><span>الحضور</span><strong>{item.attendanceDays}</strong></div><div><span>بعذر</span><strong>{item.excusedDays}</strong></div><div><span>بدون عذر</span><strong>{item.unexcusedDays}</strong></div></div><div className={styles.recordHead}><span>صافي الراتب</span><strong className={`amount ${item.finalSalary < 0 ? 'text-danger' : ''}`}>{money(item.finalSalary)}</strong></div><div className={styles.cardActions}><Button variant="secondary" onClick={() => onSelect(item.employeeId)}>التفاصيل</Button>{canPayment && <Button variant="ghost" onClick={() => onPayment(item)}>{item.paymentStatus === 'UNPAID' ? 'تسجيل الصرف' : 'صرف جديد'}</Button>}</div></Card>)}</div><Pagination page={page} total={total} pageSize={pageSize} onChange={onPageChange} />
  </>;
}
