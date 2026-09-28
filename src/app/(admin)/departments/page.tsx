'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Plus, Power, Settings2, ShieldCheck, Users } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, SearchInput, Select } from '@/components/ui';
import { DepartmentForm } from '@/components/people/department-form';
import { money } from '@/lib/format';
import type { Department } from '@/lib/types';
import styles from '@/components/people/people.module.css';

export default function DepartmentsPage() {
  const { data, session, updateData } = useDemo();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Department | 'new' | null>(() => searchParams.get('add') === '1' && session?.role === 'SUPER_ADMIN' ? 'new' : null);
  const [toggling, setToggling] = useState<Department | null>(null);
  const isSuper = session?.role === 'SUPER_ADMIN';
  const departments = data.departments.filter(item => item.name.includes(search.trim()) && (status === 'all' || item.active === (status === 'active')));
  const toggle = () => {
    if (!toggling || !isSuper) return;
    updateData(draft => { const item = draft.departments.find(department => department.id === toggling.id); if (item) item.active = !item.active; }, { action: toggling.active ? 'إيقاف قسم' : 'تفعيل قسم', entity: 'department', entityId: toggling.id, oldValues: { active: toggling.active }, newValues: { active: !toggling.active } });
    toast(toggling.active ? 'تم إيقاف القسم مع الاحتفاظ بجميع سجلاته.' : 'تم تفعيل القسم.');
    setToggling(null);
  };
  return <div className="page-stack"><PageHeader eyebrow="تنظيم المركز" title="الأقسام" description="أقسام واضحة، وقواعد رواتب مستقلة لكل فريق." actions={isSuper ? <Button onClick={() => setEditing('new')}><Plus size={18} />إضافة قسم</Button> : undefined} />
    {!isSuper && <div className="notice"><ShieldCheck size={18} /><span>يمكنك الاطلاع على الأقسام. تعديل الأقسام وإعدادات الرواتب متاح للمشرف العام فقط.</span></div>}
    {data.departments.length > 0 && <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="البحث باسم القسم" /><Select value={status} onChange={event => setStatus(event.target.value)} aria-label="حالة القسم" style={{ maxWidth: 200 }}><option value="all">جميع الأقسام</option><option value="active">الأقسام النشطة</option><option value="inactive">الأقسام غير النشطة</option></Select></div>}
    {departments.length ? <div className={styles.departmentGrid}>{departments.map(department => { const employees = data.employees.filter(item => item.departmentId === department.id); return <Card key={department.id}><div className={styles.departmentCard}><div className={styles.departmentHeader}><div><div className={styles.departmentIcon}><Building2 size={22} /></div><h2 className={styles.departmentTitle}>{department.name}</h2></div><Badge tone={department.active ? 'success' : 'neutral'}>{department.active ? 'نشط' : 'غير نشط'}</Badge></div><p className={styles.departmentDescription}>{department.description || 'قسم مستقل ضمن مركز CenterPro.'}</p><div className="inline"><Badge tone="brand">{department.salary.mode === 'FIXED' ? 'قطعي' : 'غير قطعي'}</Badge><span className={styles.mutedNote}>{department.salary.mode === 'TIERED' ? `${department.salary.tiers.length} قوانين راتب` : 'أساسي ثابت للشهر الكامل'}</span></div><div className={styles.departmentFacts}><div><span>قيمة اليومية</span><strong>{money(department.salary.dailyRate)}</strong></div><div><span>{department.salary.mode === 'FIXED' ? 'الراتب القطعي' : 'الحد الأعلى'}</span><strong>{money(department.salary.mode === 'FIXED' ? department.salary.fixedSalary : department.salary.maximum)}</strong></div><div><span>غياب بدون عذر</span><strong>{money(department.salary.unexcusedRate)}</strong></div><div><span>الموظفون النشطون</span><strong className="inline"><Users size={14} />{employees.filter(item => item.active).length} من {employees.length}</strong></div></div><div className={styles.departmentFooter}>{isSuper ? <><Button variant="secondary" onClick={() => setEditing(department)}><Settings2 size={16} />إعدادات القسم</Button><Button variant="ghost" onClick={() => setToggling(department)} title={department.active ? 'إيقاف القسم' : 'تفعيل القسم'} aria-label={`${department.active ? 'إيقاف' : 'تفعيل'} قسم ${department.name}`}><Power size={17} /></Button></> : <span className={styles.mutedNote}>الإعدادات محمية بصلاحية المشرف العام</span>}</div></div></Card>; })}</div> : <Card><EmptyState title={data.departments.length ? "لا توجد أقسام تطابق البحث" : "لا توجد أقسام حتى الآن"} description={data.departments.length ? "عدّل كلمات البحث أو حالة القسم." : "أضف أول قسم للبدء، ثم حدد نوع الراتب وقوانين الراتب الخاصة به."} action={!data.departments.length && isSuper ? <Button onClick={() => setEditing('new')}><Plus size={17} />إضافة أول قسم</Button> : undefined} /></Card>}
    {editing && <DepartmentForm key={editing === 'new' ? 'new' : editing.id} department={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    <ConfirmDialog open={Boolean(toggling)} onClose={() => setToggling(null)} onConfirm={toggle} title={toggling?.active ? 'إيقاف القسم؟' : 'تفعيل القسم؟'} description={toggling?.active ? `سيتم إيقاف قسم ${toggling.name} للاختيارات الجديدة. يبقى الموظفون وسجلات الحضور والرواتب السابقة محفوظين.` : `سيصبح قسم ${toggling?.name ?? ''} متاحاً للاختيار في الموظفين وأيام الحضور الجديدة.`} confirmLabel={toggling?.active ? 'تأكيد إيقاف القسم' : 'تفعيل القسم'} danger={toggling?.active} />
  </div>;
}
