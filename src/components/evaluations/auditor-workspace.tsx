'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { EmptyState, Input } from '@/components/ui';
import { getCorrectionEmployees } from '@/lib/evaluations';
import { actorKey } from './editor-values';
import { EvaluationEditor } from './evaluation-editor';
import { MultiEmployeeFilter } from './multi-employee-filter';
import styles from './evaluations.module.css';

export function AuditorWorkspace({ examId, examControl }: { examId: string; examControl?: ReactNode }) {
  const { data, session } = useDemo();
  const exam = data.evaluationExams.find(item => item.id === examId);
  const cycle = data.evaluationCycles.find(item => item.id === exam?.cycleId);
  const season = data.evaluationSeasons.find(item => item.id === cycle?.seasonId);
  const employees = useMemo(() => getCorrectionEmployees(data), [data]);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const selected = selection === null ? employees.map(employee => employee.id) : selection.filter(id => employees.some(employee => employee.id === id));
  const filtered = employees.filter(employee => selected.includes(employee.id) && employee.name.includes(query.trim()));
  if (!exam) return <EmptyState title="الامتحان غير موجود" />;
  if (!employees.length) return <EmptyState title="لا يوجد مصححون فعالون" description="أضف موظفين فعالين إلى قسم التصحيح أولاً." />;

  const disabled = exam.state !== 'OPEN' || cycle?.state !== 'OPEN' || Boolean(cycle.seasonId && season?.state !== 'OPEN');
  return <div className="stack">
    <div className={styles.toolbarGrid}>
      {examControl ?? <div />}
      <div className="field"><span className="field-label">اختيار المصححين</span><MultiEmployeeFilter selected={selected} onChange={setSelection} employeeIds={employees.map(item => ({ id:item.id, name:item.name }))}/></div>
    </div>
    <div className="filter-row" style={{ marginBottom: 0 }}><div className="search-input" style={{ maxWidth: 420 }}><Search size={18}/><Input value={query} onChange={event => setQuery(event.target.value)} aria-label="البحث في المصححين المختارين" placeholder="ابحث داخل المصححين المختارين"/></div></div>
    {disabled && <div className="notice notice-warning">{season?.state === 'ARCHIVED' ? 'الموسم مؤرشف — عرض فقط.' : cycle?.state === 'ARCHIVED' ? 'الدورة مؤرشفة — عرض فقط.' : 'الامتحان مغلق — عرض فقط.'}</div>}
    {!selected.length ? <EmptyState title="لم تختر أي مصحح" /> : !filtered.length ? <EmptyState title="لا توجد نتائج مطابقة" /> : <div className={styles.auditGrid}>{filtered.map(employee => <EvaluationEditor key={`${exam.id}:${employee.id}:${actorKey(session)}`} examId={exam.id} employeeId={employee.id} disabled={disabled}/>)}</div>}
  </div>;
}
