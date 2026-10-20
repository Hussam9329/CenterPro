'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Plus, Power, Settings2, ShieldCheck, Users } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { SafeDeleteButton } from '@/components/delete/safe-delete-button';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, SearchInput, Select } from '@/components/ui';
import { DepartmentForm } from '@/components/people/department-form';
import { money } from '@/lib/format';
import { hasSessionAccountPermission } from '@/lib/permissions';
import type { Department } from '@/lib/types';
import styles from '@/components/people/people.module.css';

export default function DepartmentsPage() {
  const { data, session, updateData } = useDemo();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { mutate } = useAsyncMutation(toast);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const canCreate = hasSessionAccountPermission(data, session, 'DEPARTMENTS', 'create');
  const canEdit = hasSessionAccountPermission(data, session, 'DEPARTMENTS', 'edit');
  const canDelete = hasSessionAccountPermission(data, session, 'DEPARTMENTS', 'delete');
  const [editing, setEditing] = useState<Department | 'new' | null>(() => searchParams.get('add') === '1' && canCreate ? 'new' : null);
  const [toggling, setToggling] = useState<Department | null>(null);
  const departments = data.departments.filter(item => item.name.includes(search.trim()) && (status === 'all' || item.active === (status === 'active')));
  const toggle = async () => {
    if (!toggling || !canEdit) return;
    if (!await mutate(() => updateData(draft => { const item = draft.departments.find(department => department.id === toggling.id); if (item) item.active = !item.active; }, { action: toggling.active ? 'إيقاف قسم' : 'تفعيل قسم', entity: 'department', entityId: toggling.id, oldValues: { active: toggling.active }, newValues: { active: !toggling.active } }))) return;
    toast(toggling.active ? 'تم إيقاف القسم مع الاحتفاظ بجميع سجلاته.' : 'تم تفعيل القسم.');
    setToggling(null);
  };
  return <div className="page-stack"><PageHeader title="الأقسام" actions={canCreate ? <Button onClick={() => setEditing('new')}><Plus size={18} />إضافة قسم</Button> : undefined} />
    {!canEdit && <div className="notice"><ShieldCheck size={18} /><span>هذه الصلاحية للعرض فقط. التعديل يحتاج صلاحية منفصلة من المشرف العام.</span></div>}
    {data.departments.length > 0 && <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="البحث باسم القسم" /><Select value={status} onChange={event => setStatus(event.target.value)} aria-label="حالة القسم" style={{ maxWidth: 200 }}><option value="all">جميع الأقسام</option><option value="active">الأقسام النشطة</option><option value="inactive">الأقسام غير النشطة</option></Select></div>}
    {departments.length ? <div className={styles.departmentGrid}>{departments.map(department => { const employees = data.employees.filter(item => item.departmentId === department.id); return <Card key={department.id}><div className={styles.departmentCard}><div className={styles.departmentHeader}><div><div className={styles.departmentIcon}><Building2 size={22} /></div><h2 className={styles.departmentTitle}>{department.name}</h2></div><Badge tone={department.active ? 'success' : 'neutral'}>{department.active ? 'نشط' : 'غير نشط'}</Badge></div>{department.description && <p className={styles.departmentDescription}>{department.description}</p>}<div className="inline"><Badge tone="brand">{department.salary.mode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</Badge><span className={styles.mutedNote}>{department.salary.mode === 'TIERED' ? `${department.salary.tiers.length} قوانين راتب` : 'أساسي ثابت للشهر الكامل'}</span></div><div className={styles.departmentFacts}><div><span>قيمة اليومية</span><strong><bdi dir="ltr">{money(department.salary.dailyRate)}</bdi></strong></div><div><span>{department.salary.mode === 'FIXED' ? 'الراتب القطعي' : 'الحد الأعلى'}</span><strong><bdi dir="ltr">{money(department.salary.mode === 'FIXED' ? department.salary.fixedSalary : department.salary.maximum)}</bdi></strong></div><div><span>غياب بدون عذر</span><strong><bdi dir="ltr">{money(department.salary.unexcusedRate)}</bdi></strong></div><div><span>الموظفون النشطون</span><strong className="inline"><Users size={14} />{employees.filter(item => item.active).length} من {employees.length}</strong></div></div><div className={styles.departmentFooter}>{canEdit ? <><Button variant="secondary" onClick={() => setEditing(department)}><Settings2 size={16} />إعدادات القسم</Button><Button variant="ghost" onClick={() => setToggling(department)} title={department.active ? 'إيقاف القسم' : 'تفعيل القسم'} aria-label={`${department.active ? 'إيقاف' : 'تفعيل'} قسم ${department.name}`}><Power size={17} /></Button></> : <span className={styles.mutedNote}>عرض فقط</span>}{canDelete && <SafeDeleteButton collection="departments" id={department.id} label={department.name} compact />}</div></div></Card>; })}</div> : <Card><EmptyState title={data.departments.length ? "لا توجد أقسام تطابق البحث" : "لا توجد أقسام حتى الآن"} description={data.departments.length ? "عدّل كلمات البحث أو حالة القسم." : "أضف أول قسم للبدء، ثم حدد نوع الراتب وقوانين الراتب الخاصة به."} action={!data.departments.length && canCreate ? <Button onClick={() => setEditing('new')}><Plus size={17} />إضافة أول قسم</Button> : undefined} /></Card>}
    {editing && <DepartmentForm key={editing === 'new' ? 'new' : editing.id} department={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={Boolean(toggling)} onClose={() => setToggling(null)} onConfirm={toggle} title={toggling?.active ? 'إيقاف القسم؟' : 'تفعيل القسم؟'} description={toggling?.active ? `سيتم إيقاف قسم ${toggling.name} للاختيارات الجديدة. يبقى الموظفون وسجلات الحضور والرواتب السابقة محفوظين.` : `سيصبح قسم ${toggling?.name ?? ''} متاحاً للاختيار في الموظفين وأيام الحضور الجديدة.`} confirmLabel={toggling?.active ? 'تأكيد إيقاف القسم' : 'تفعيل القسم'} danger={toggling?.active} />
  </div>;
}
