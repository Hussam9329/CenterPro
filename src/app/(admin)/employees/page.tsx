'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, UserCheck, Users, UserX } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Pagination, SearchInput, Select, StatCard } from '@/components/ui';
import { EmployeeForm, ResetPasswordDialog } from '@/components/people/employee-form';
import type { Employee } from '@/lib/types';
import { date, money } from '@/lib/format';
import styles from '@/components/people/people.module.css';

export default function EmployeesPage() {
  const { data, session, updateData } = useDemo();
  const searchParams = useSearchParams();
  const hasActiveDepartment = data.departments.some(item => item.active);
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('active');
  const [salary, setSalary] = useState('all');
  const [sort, setSort] = useState('code');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Employee | 'new' | null>(() => searchParams.get('add') === '1' && hasActiveDepartment ? 'new' : null);
  const [passwordEmployee, setPasswordEmployee] = useState<Employee | null>(null);
  const [toggleEmployee, setToggleEmployee] = useState<Employee | null>(null);
  const pageSize = 8;
  const isSuper = session?.role === 'SUPER_ADMIN';
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 220); return () => clearTimeout(timer); }, [search]);
  const rows = useMemo(() => {
    const query = debouncedSearch.trim().toLocaleLowerCase();
    return data.employees.filter(employee => {
      const dep = data.departments.find(item => item.id === employee.departmentId);
      const fixed = employee.fixedOverride || dep?.salary.mode === 'FIXED';
      return (!query || `${employee.name} ${employee.code} ${employee.username} ${employee.phone}`.toLocaleLowerCase().includes(query)) && (department === 'all' || employee.departmentId === department) && (status === 'all' || employee.active === (status === 'active')) && (salary === 'all' || fixed === (salary === 'FIXED'));
    }).sort((a, b) => {
      let result = 0;
      if (sort === 'name') result = a.name.localeCompare(b.name, 'ar');
      else if (sort === 'newest') result = b.startDate.localeCompare(a.startDate);
      else result = a.code.localeCompare(b.code, 'en', { numeric: true });
      return result || a.code.localeCompare(b.code, 'en', { numeric: true });
    });
  }, [data, debouncedSearch, department, status, salary, sort]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setFilter = (set: (value: string) => void, value: string) => { set(value); setPage(1); };
  const toggle = () => {
    if (!toggleEmployee || (!isSuper && toggleEmployee.role !== 'EMPLOYEE')) return;
    updateData(draft => { const employee = draft.employees.find(item => item.id === toggleEmployee.id); if (employee) { employee.active = !employee.active; employee.updatedAt = new Date().toISOString(); } }, { action: toggleEmployee.active ? 'إيقاف موظف' : 'تفعيل موظف', entity: 'employee', entityId: toggleEmployee.id, employeeId: toggleEmployee.id, oldValues: { active: toggleEmployee.active }, newValues: { active: !toggleEmployee.active } });
    toast(toggleEmployee.active ? 'تم إيقاف الموظف مع الاحتفاظ بسجلاته.' : 'تم تفعيل الموظف.');
    setToggleEmployee(null);
  };
  const actions = (employee: Employee) => <div className={styles.rowActions}><Button variant="ghost" title="تعديل الموظف" aria-label={`تعديل ${employee.name}`} onClick={() => setEditing(employee)} disabled={!isSuper && employee.role !== 'EMPLOYEE'}><Pencil size={16} /></Button><Button variant="ghost" title="تغيير كلمة المرور" aria-label={`تغيير كلمة مرور ${employee.name}`} onClick={() => setPasswordEmployee(employee)} disabled={!isSuper && employee.role !== 'EMPLOYEE'}><KeyRound size={16} /></Button><Button variant="ghost" title={employee.active ? 'إيقاف الموظف' : 'تفعيل الموظف'} aria-label={`${employee.active ? 'إيقاف' : 'تفعيل'} ${employee.name}`} onClick={() => setToggleEmployee(employee)} disabled={!isSuper && employee.role !== 'EMPLOYEE'}>{employee.active ? <UserX size={16} /> : <UserCheck size={16} />}</Button></div>;
  const salaryLabel = (employee: Employee) => employee.fixedOverride || data.departments.find(item => item.id === employee.departmentId)?.salary.mode === 'FIXED' ? 'قطعي' : 'غير قطعي';

  return <div className="page-stack">
    <PageHeader eyebrow="إدارة الفريق" title="الموظفون" description="كل موظف، بياناته وحضوره ومستحقاته في مكان واحد." actions={hasActiveDepartment ? <Button onClick={() => setEditing('new')}><Plus size={18} />إضافة موظف</Button> : isSuper ? <Link href="/departments?add=1" className="btn btn-primary"><Plus size={18} />إضافة قسم</Link> : undefined} />
    <div className="stats-grid"><StatCard label="إجمالي الموظفين" value={String(data.employees.length)} icon={<Users size={21} />} hint="جميع الملفات المسجلة" /><StatCard label="موظفون نشطون" value={String(data.employees.filter(item => item.active).length)} icon={<UserCheck size={21} />} accent hint="ضمن الفريق الحالي" /><StatCard label="موظفون غير نشطين" value={String(data.employees.filter(item => !item.active).length)} icon={<UserX size={21} />} hint="سجلاتهم محفوظة" /><StatCard label="الأقسام النشطة" value={String(data.departments.filter(item => item.active).length)} hint="أقسام المركز" /></div>
    {!data.employees.length ? <Card><EmptyState title={!hasActiveDepartment ? data.departments.length ? 'لا توجد أقسام نشطة' : 'أضف قسماً أولاً' : 'لا يوجد موظفون حتى الآن'} description={!hasActiveDepartment ? isSuper ? data.departments.length ? 'فعّل أحد الأقسام أو أضف قسماً جديداً قبل إضافة الموظفين.' : 'أضف قسماً أولاً قبل إضافة الموظفين.' : 'اطلب من المشرف العام إضافة قسم أو تفعيله قبل إضافة الموظفين.' : 'أضف أول موظف إلى CenterPro، وأنشئ ملفه وحساب دخوله معاً.'} action={hasActiveDepartment ? <Button onClick={() => setEditing('new')}><Plus size={17} />إضافة أول موظف</Button> : isSuper ? <Link href="/departments" className="button-link">الأقسام</Link> : undefined} /></Card> : <Card>
      <div className={styles.directoryTools}><Field label="البحث عن موظف"><SearchInput value={search} onChange={value => setFilter(setSearch, value)} placeholder="الاسم، الرقم الوظيفي أو الهاتف" /></Field><Field label="القسم"><Select value={department} onChange={event => setFilter(setDepartment, event.target.value)}><option value="all">جميع الأقسام</option>{data.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="الحالة"><Select value={status} onChange={event => setFilter(setStatus, event.target.value)}><option value="active">النشطون</option><option value="inactive">غير النشطين</option><option value="all">جميع الحالات</option></Select></Field><Field label="نوع الراتب"><Select value={salary} onChange={event => setFilter(setSalary, event.target.value)}><option value="all">جميع الأنواع</option><option value="TIERED">غير قطعي</option><option value="FIXED">قطعي</option></Select></Field></div>
      <div className={styles.sortLine}><span>{rows.length} موظف يطابق البحث</span><Select aria-label="ترتيب الموظفين" value={sort} onChange={event => setFilter(setSort, event.target.value)}><option value="code">الرقم الوظيفي</option><option value="name">الاسم أبجدياً</option><option value="newest">الأحدث مباشرة</option></Select></div>
      {rows.length === 0 ? <EmptyState title="لا يوجد موظفون يطابقون البحث" description="جرّب تعديل البحث أو إزالة أحد الفلاتر." action={<Button variant="secondary" onClick={() => { setSearch(''); setDepartment('all'); setStatus('all'); setSalary('all'); }}>مسح الفلاتر</Button>} /> : <>
        <div className="desktop-table table-wrap"><table className="data-table"><thead><tr><th>الموظف</th><th>القسم</th><th>نوع الراتب</th><th>تاريخ المباشرة</th><th>الحالة</th><th><span className="sr-only">إجراءات</span></th></tr></thead><tbody>{visible.map(employee => <tr key={employee.id}><td><div className={styles.person}><Avatar name={employee.name} src={employee.photo} /><div className={styles.personText}><Link href={`/employees/${employee.id}`} className={styles.personName}>{employee.name}</Link><span className={styles.code}>{employee.code}</span></div></div></td><td>{data.departments.find(item => item.id === employee.departmentId)?.name}</td><td><span>{salaryLabel(employee)}</span>{employee.fixedOverride && <div className={styles.mutedNote}>{money(employee.fixedSalary)}</div>}</td><td>{date(employee.startDate)}</td><td><Badge tone={employee.active ? 'success' : 'neutral'}>{employee.active ? 'نشط' : 'غير نشط'}</Badge></td><td>{actions(employee)}</td></tr>)}</tbody></table></div>
        <div className="mobile-cards">{visible.map(employee => <article className={styles.mobilePerson} key={employee.id}><div className={styles.mobileTop}><div className={styles.person}><Avatar name={employee.name} src={employee.photo} /><div className={styles.personText}><Link href={`/employees/${employee.id}`} className={styles.personName}>{employee.name}</Link><span className={styles.code}>{employee.code}</span></div></div><Badge tone={employee.active ? 'success' : 'neutral'}>{employee.active ? 'نشط' : 'غير نشط'}</Badge></div><div className={styles.mobileTop}><div className={styles.mobileMeta}><span>{data.departments.find(item => item.id === employee.departmentId)?.name}</span><span>{salaryLabel(employee)}</span></div>{actions(employee)}</div></article>)}</div>
        <Pagination page={currentPage} total={rows.length} pageSize={pageSize} onChange={setPage} />
      </>}
    </Card>}
    {editing && (editing !== 'new' || hasActiveDepartment) && <EmployeeForm key={editing === 'new' ? 'new' : editing.id} open onClose={() => setEditing(null)} employee={editing === 'new' ? undefined : editing} />}
    <ResetPasswordDialog employee={passwordEmployee} onClose={() => setPasswordEmployee(null)} />
    <ConfirmDialog open={Boolean(toggleEmployee)} onClose={() => setToggleEmployee(null)} onConfirm={toggle} title={toggleEmployee?.active ? 'إيقاف الموظف؟' : 'تفعيل الموظف؟'} description={toggleEmployee?.active ? `سيصبح ${toggleEmployee.name} غير نشط، ولن يكون متوقعاً في أيام الحضور الجديدة. تبقى بياناته وحضوره ورواتبه السابقة محفوظة.` : `سيعود ${toggleEmployee?.name ?? ''} إلى قائمة الموظفين النشطين مع بقاء رقمه الوظيفي وسجلاته.`} confirmLabel={toggleEmployee?.active ? 'تأكيد إيقاف الموظف' : 'تفعيل الموظف'} danger={toggleEmployee?.active} />
  </div>;
}
