'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, Eye, FilterX, History, ShieldCheck } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Pagination, Select, StatCard } from '@/components/ui';
import { date, duration, money, monthLabel, number, time } from '@/lib/format';
import type { AuditEntry, DemoData, Role } from '@/lib/types';

const roleLabels: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف' };
const entityLabels: Record<string, string> = { employee: 'الموظفون', department: 'الأقسام', workday: 'أيام الحضور', attendance: 'الحضور', deduction: 'الخصومات', bonus: 'المكافآت', payment: 'صرف الرواتب', payroll_month: 'رواتب الشهر', settings: 'إعدادات النظام', 'evaluation-cycle': 'دورات التقييم', 'evaluation-exam': 'امتحانات التدقيق', 'exam-evaluation': 'تقييمات المصححين' };
const valueLabels: Record<string, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف', OPEN: 'مفتوح', CLOSED: 'مغلق', ARCHIVED: 'مؤرشف', REOPENED: 'معاد فتحه', PAID: 'تم الصرف', UNPAID: 'لم يُصرف', REVIEW: 'تحتاج مراجعة', PRESENT: 'حاضر', UNRESOLVED: 'لم يُحسم', EXCUSED: 'غياب بعذر', UNEXCUSED: 'غياب بدون عذر', EXEMPT: 'معفى', QR: 'رمز QR', MANUAL: 'إداري', FIXED: 'قطعي', TIERED: 'غير قطعي', PER_DAY: 'عن كل يوم', INCLUDE: 'مشمول', EXCLUDE: 'مستثنى', MALE: 'ذكر', FEMALE: 'أنثى' };
const fieldLabels: Record<string, string> = { id: 'رقم السجل', code: 'الرقم الوظيفي', name: 'الاسم', date: 'التاريخ', startDate: 'تاريخ المباشرة', endDate: 'تاريخ إنهاء الخدمة', startTime: 'بداية الدوام', checkIn: 'وقت الحضور', month: 'الشهر', state: 'الحالة', status: 'حالة الحضور', paymentStatus: 'حالة الصرف', amount: 'المبلغ', finalSalary: 'صافي الراتب', salaryAtPayment: 'الراتب عند الصرف', paidAmount: 'المبلغ المصروف', active: 'نشط', role: 'الدور', username: 'اسم المستخدم', employeeId: 'الموظف', departmentId: 'القسم', departmentIds: 'الأقسام المشمولة', reason: 'السبب', type: 'النوع', customType: 'نوع الخصم', createdBy: 'أضيف بواسطة', paidBy: 'صرف بواسطة', createdAt: 'تاريخ الإنشاء', updatedAt: 'آخر تعديل', sessionsInvalidated: 'إنهاء الجلسات السابقة', simulated: 'محاكاة', preview: 'معاينة', latenessSeconds: 'مدة التأخير', centerName: 'اسم المركز', qrInterval: 'مدة تجديد QR بالثواني', salary: 'إعدادات الراتب', salaryConfig: 'إعدادات الراتب', mode: 'نوع الراتب', dailyRate: 'قيمة اليوم', unexcusedRate: 'خصم اليوم بدون عذر', maximum: 'سقف الراتب', fixedSalary: 'الراتب القطعي', extraDaysStart: 'بداية الأيام الإضافية', tiers: 'قوانين القسم', fromDays: 'من يوم', toDays: 'إلى يوم', fixedOverride: 'راتب قطعي خاص', dailyRateOverride: 'قيمة يوم خاصة', address: 'السكن', phone: 'رقم الهاتف', guardianPhone: 'هاتف ولي الأمر', gender: 'الجنس', birthDate: 'تاريخ الميلاد', notes: 'الملاحظات', qualification: 'المؤهل', telegram: 'معرّف تليغرام', photo: 'الصورة', overrides: 'استثناءات الموظفين', explicitRecalculation: 'إعادة احتساب صريحة', salaryRules: 'قوانين القسم', requiredDays: 'الأيام المطلوبة', attendanceDays: 'أيام الحضور', excusedDays: 'غياب بعذر', unexcusedDays: 'غياب بدون عذر', exemptDays: 'أيام الإعفاء', unresolvedDays: 'أيام لم تُحسم', baseSalary: 'الراتب الأساسي', otherDeductions: 'الخصومات الأخرى', bonuses: 'المكافآت', cycleId: 'دورة التقييم', examId: 'الامتحان', papers: 'عدد الأوراق المصححة', correctionErrors: 'أخطاء التصحيح', behaviorErrors: 'أخطاء السلوك', note: 'الملاحظة', rows: 'عدد المصححين', exams: 'عدد الامتحانات' };
const sensitiveField = /password|passphrase|hash|secret|token|credential|كلمة.?المرور|كلمة.?السر/i;
const financialFields = new Set(['amount', 'finalSalary', 'salaryAtPayment', 'paidAmount', 'dailyRate', 'unexcusedRate', 'maximum', 'fixedSalary', 'dailyRateOverride', 'baseSalary', 'otherDeductions', 'bonuses']);

function readableValue(value: unknown, key: string, data: DemoData): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'number') return financialFields.has(key) ? money(value) : key === 'latenessSeconds' ? duration(value) : number(value);
  if (Array.isArray(value)) return value.length ? value.map(item => readableValue(item, key === 'departmentIds' ? 'departmentId' : key, data)).join('، ') : 'لا يوجد';
  if (typeof value === 'object') return Object.entries(value).filter(([child]) => !sensitiveField.test(child)).map(([child, item]) => `${fieldLabels[child] || data.employees.find(employee => employee.id === child)?.name || child}: ${readableValue(item, child, data)}`).join(' · ') || 'لا يوجد';
  const text = String(value);
  if (key === 'employeeId') return data.employees.find(employee => employee.id === text)?.name || text;
  if (key === 'departmentId') return data.departments.find(department => department.id === text)?.name || text;
  if (key === 'month' && /^\d{4}-\d{2}$/.test(text)) return monthLabel(text);
  if (key === 'startTime') return time(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return `${date(text)} — ${time(text)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return date(text);
  return valueLabels[text] || text;
}

function baghdadDate(value: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export default function AuditPage() {
  const { data, session } = useDemo();
  const [actor, setActor] = useState('all');
  const [employee, setEmployee] = useState('all');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const pageSize = 10;
  const invalidRange = Boolean(from && to && from > to);
  const rows = useMemo(() => data.audit.filter(entry => {
    const day = baghdadDate(entry.timestamp);
    return !invalidRange && (actor === 'all' || actor === entry.actor) && (employee === 'all' || employee === entry.employeeId) && (action === 'all' || action === entry.action) && (entity === 'all' || entity === entry.entity) && (!from || day >= from) && (!to || day <= to);
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [data.audit, actor, employee, action, entity, from, to, invalidRange]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const clear = () => { setActor('all'); setEmployee('all'); setAction('all'); setEntity('all'); setFrom(''); setTo(''); setPage(1); };
  const hasFilters = actor !== 'all' || employee !== 'all' || action !== 'all' || entity !== 'all' || Boolean(from || to);
  const selectedEmployee = selected?.employeeId ? data.employees.find(item => item.id === selected.employeeId) : undefined;
  const changedKeys = selected ? Array.from(new Set([...Object.keys(selected.oldValues), ...Object.keys(selected.newValues)])).filter(key => !sensitiveField.test(key)) : [];

  if (session?.role !== 'SUPER_ADMIN') return <EmptyState title="هذه الصفحة متاحة لـ Super Admin فقط" description="سجل العمليات مخصص لمراجعة الإجراءات الإدارية." />;

  return <div className="page-stack">
    <PageHeader eyebrow="الشفافية والمتابعة" title="سجل العمليات" description="من نفّذ الإجراء، وماذا تغيّر، ومتى حدث. الأوقات حسب توقيت بغداد." actions={<Badge tone="brand"><ShieldCheck size={14} />Super Admin</Badge>} />
    <div className="stats-grid"><StatCard label="العمليات المسجلة" value={number(data.audit.length)} icon={<History size={21} />} hint="داخل جلسة المعاينة" /><StatCard label="نتائج الفلاتر" value={number(rows.length)} accent hint="مرتبة من الأحدث إلى الأقدم" /><StatCard label="المستخدمون المنفذون" value={number(new Set(data.audit.map(entry => entry.actor)).size)} hint="مستخدمون لديهم إجراءات مسجلة" /></div>
    <Card title="البحث في السجل" description="اجمع أكثر من فلتر للوصول إلى الإجراء المطلوب." action={hasFilters ? <Button variant="ghost" onClick={clear}><FilterX size={17} />مسح الفلاتر</Button> : undefined}>
      <div className="form-grid">
        <Field label="المستخدم المنفذ"><Select value={actor} onChange={event => change(setActor, event.target.value)}><option value="all">جميع المستخدمين</option>{[...new Set(data.audit.map(entry => entry.actor))].map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="الموظف المرتبط"><Select value={employee} onChange={event => change(setEmployee, event.target.value)}><option value="all">جميع الموظفين</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.code}</option>)}</Select></Field>
        <Field label="الإجراء"><Select value={action} onChange={event => change(setAction, event.target.value)}><option value="all">جميع الإجراءات</option>{[...new Set(data.audit.map(entry => entry.action))].map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="نوع السجل"><Select value={entity} onChange={event => change(setEntity, event.target.value)}><option value="all">جميع الأنواع</option>{[...new Set(data.audit.map(entry => entry.entity))].map(value => <option key={value} value={value}>{entityLabels[value] || value}</option>)}</Select></Field>
        <Field label="من تاريخ"><Input type="date" value={from} max={to || undefined} dir="ltr" onChange={event => change(setFrom, event.target.value)} /></Field>
        <Field label="إلى تاريخ" error={invalidRange ? 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية أو مساوياً له.' : undefined}><Input type="date" value={to} min={from || undefined} dir="ltr" onChange={event => change(setTo, event.target.value)} /></Field>
      </div>
    </Card>
    <Card title="الإجراءات" description="تفتح التفاصيل مقارنة واضحة للقيم قبل الإجراء وبعده.">
      {rows.length === 0 ? <EmptyState title={hasFilters ? "لا توجد عمليات تطابق الفلاتر" : "لا توجد عمليات مسجلة حتى الآن."} description={hasFilters ? "جرّب فترة زمنية أخرى أو امسح الفلاتر." : "ستُسجّل هنا الإضافات والتعديلات التي تجريها داخل CenterPro."} action={hasFilters ? <Button variant="secondary" onClick={clear}>مسح الفلاتر</Button> : undefined} /> : <>
        <div className="desktop-table table-wrap"><table className="data-table"><thead><tr><th scope="col">المستخدم</th><th scope="col">الإجراء</th><th scope="col">الموظف المرتبط</th><th scope="col">نوع السجل</th><th scope="col">التاريخ والوقت</th><th scope="col">التفاصيل</th></tr></thead><tbody>{visible.map(entry => <tr key={entry.id}><td><div className="inline"><Avatar name={entry.actor} /><div><strong>{entry.actor}</strong><div className="muted">{roleLabels[entry.role]}</div></div></div></td><td>{entry.action}</td><td>{entry.employeeId ? <Link className="button-link" href={`/employees/${entry.employeeId}`}>{data.employees.find(item => item.id === entry.employeeId)?.name || entry.employeeId}</Link> : '—'}</td><td><Badge>{entityLabels[entry.entity] || entry.entity}</Badge></td><td><span dir="ltr">{date(entry.timestamp)}</span><div className="muted" dir="ltr">{time(entry.timestamp)}</div></td><td><Button variant="ghost" onClick={() => setSelected(entry)} aria-label={`تفاصيل ${entry.action}`}><Eye size={17} />عرض</Button></td></tr>)}</tbody></table></div>
        <div className="mobile-cards">{visible.map(entry => <article className="stack" key={entry.id}><div className="list-row"><div className="inline"><Avatar name={entry.actor} /><strong>{entry.actor}</strong></div><Badge>{entityLabels[entry.entity] || entry.entity}</Badge></div><strong>{entry.action}</strong>{entry.employeeId && <span className="muted">{data.employees.find(item => item.id === entry.employeeId)?.name || entry.employeeId}</span>}<div className="list-row"><span className="muted" dir="ltr">{date(entry.timestamp)} · {time(entry.timestamp)}</span><Button variant="ghost" onClick={() => setSelected(entry)} aria-label={`تفاصيل ${entry.action}`}>التفاصيل<ChevronLeft size={16} /></Button></div></article>)}</div>
        <Pagination page={currentPage} total={rows.length} pageSize={pageSize} onChange={setPage} />
      </>}
    </Card>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title="تفاصيل العملية" description={selected?.action} wide>
      {selected && <div className="stack"><div className="detail-grid"><div className="detail-item"><span>نفّذ الإجراء</span><strong>{selected.actor}</strong><span>{roleLabels[selected.role]}</span></div><div className="detail-item"><span>التاريخ والوقت — بغداد</span><strong dir="ltr">{date(selected.timestamp)}</strong><span dir="ltr">{time(selected.timestamp)}</span></div><div className="detail-item"><span>نوع السجل</span><strong>{entityLabels[selected.entity] || selected.entity}</strong><span dir="ltr">{selected.entityId}</span></div><div className="detail-item"><span>الموظف المرتبط</span>{selectedEmployee ? <Link className="button-link" href={`/employees/${selectedEmployee.id}`}>{selectedEmployee.name}</Link> : <strong>—</strong>}</div></div>
        {changedKeys.length ? <div className="stack">{changedKeys.map(key => <div className="form-section" key={key}><h3>{fieldLabels[key] || key}</h3><div className="grid-2"><div className="detail-item"><span>قبل الإجراء</span><strong style={{ overflowWrap: 'anywhere' }}>{readableValue(selected.oldValues[key], key, data)}</strong></div><div className="detail-item"><span>بعد الإجراء</span><strong style={{ overflowWrap: 'anywhere' }}>{readableValue(selected.newValues[key], key, data)}</strong></div></div></div>)}</div> : <div className="notice">تم تسجيل الإجراء، ولا توجد قيم تفصيلية قابلة للعرض.</div>}
        {(selected.ip || selected.userAgent) && <details><summary>معلومات التسجيل</summary><div className="detail-grid">{selected.ip && <div className="detail-item"><span>عنوان الاتصال</span><span dir="ltr">{selected.ip}</span></div>}{selected.userAgent && <div className="detail-item"><span>وسيلة الاستخدام</span><span style={{ overflowWrap: 'anywhere' }}>{selected.userAgent}</span></div>}</div></details>}
        <div className="notice">هذا سجل تجريبي لجلسة المعاينة. لا تُعرض كلمات المرور أو الرموز السرية ضمن تفاصيل العمليات.</div>
        <div className="form-actions"><Button variant="secondary" onClick={() => setSelected(null)}>إغلاق التفاصيل</Button></div>
      </div>}
    </Dialog>
  </div>;
}
