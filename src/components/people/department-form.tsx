'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Button, ConfirmDialog, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { validateSalaryConfig } from '@/lib/payroll';
import type { Department, SalaryConfig, SalaryTier } from '@/lib/types';
import styles from './people.module.css';

const blankSalary: SalaryConfig = { mode: 'TIERED', dailyRate: 0, unexcusedRate: 0, maximum: 0, fixedSalary: 0, extraDaysStart: 32, tiers: [{ id: 'initial-tier', fromDays: 0, toDays: 31, type: 'PER_DAY', amount: 0 }] };

export function DepartmentForm({ department, onClose }: { department?: Department; onClose: () => void }) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [salary, setSalary] = useState<SalaryConfig>(() => structuredClone(department?.salary ?? blankSalary));
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const change = <K extends keyof SalaryConfig>(key: K, value: SalaryConfig[K]) => setSalary(current => ({ ...current, [key]: value }));
  const updateTier = <K extends keyof SalaryTier>(id: string, key: K, value: SalaryTier[K]) => setSalary(current => ({ ...current, tiers: current.tiers.map(tier => tier.id === id ? { ...tier, [key]: value } : tier) }));
  const addTier = () => { const last = salary.tiers.at(-1); const from = last ? last.toDays + 1 : 0; change('tiers', [...salary.tiers, { id: crypto.randomUUID(), fromDays: from, toDays: from, type: 'FIXED', amount: 0 }]); };
  const save = () => {
    if (session?.role !== 'SUPER_ADMIN') return;
    const id = department?.id ?? `department-${crypto.randomUUID()}`;
    const updated: Department = { id, name: name.trim(), description: description.trim(), active: department?.active ?? true, salary: structuredClone(salary) };
    updateData(draft => { const index = draft.departments.findIndex(item => item.id === id); if (index >= 0) draft.departments[index] = updated; else draft.departments.push(updated); }, { action: department ? 'تعديل القسم وإعدادات الراتب' : 'إضافة قسم', entity: 'department', entityId: id, oldValues: department ? { name: department.name, salary: department.salary } : {}, newValues: { name: updated.name, salary: updated.salary } });
    setConfirmation(false);
    toast(department ? 'تم حفظ القسم وإعادة احتساب الرواتب المفتوحة في المعاينة.' : 'تمت إضافة القسم بنجاح.');
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('اكتب اسم القسم.'); return; }
    if (data.departments.some(item => item.id !== department?.id && item.name.trim() === name.trim())) { setError('يوجد قسم بهذا الاسم. اختر اسماً مختلفاً.'); return; }
    try {
      validateSalaryConfig(salary);
      if (salary.mode === 'TIERED') {
        let nextDay = 0;
        for (const tier of salary.tiers) { if (tier.fromDays !== nextDay) throw new Error('يجب تغطية الأيام بدءاً من 0 دون فجوات بين القوانين.'); nextDay = tier.toDays + 1; }
      }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'تحقق من إعدادات الراتب.'); return; }
    setError('');
    if (department && JSON.stringify(department.salary) !== JSON.stringify(salary)) setConfirmation(true); else save();
  };
  return <>
    <Dialog open onClose={onClose} title={department ? `إعدادات قسم ${department.name}` : 'إضافة قسم جديد'} description="قواعد مستقلة وواضحة لكل قسم في المركز." wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid"><Field label="اسم القسم" required><Input value={name} autoFocus onChange={event => setName(event.target.value)} placeholder="اسم القسم" /></Field><Field label="نوع الراتب"><Select value={salary.mode} onChange={event => change('mode', event.target.value as SalaryConfig['mode'])}><option value="TIERED">غير قطعي</option><option value="FIXED">قطعي</option></Select></Field><div className="field-span-2"><Field label="وصف القسم"><Textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} placeholder="وصف مختصر لطبيعة عمل القسم" /></Field></div></div>
        <hr className={styles.sectionRule} />
        <div className={styles.sectionTitle}><h3 className="inline"><SlidersHorizontal size={17} />إعدادات الراتب</h3><span className={styles.mutedNote}>المبالغ بالدينار العراقي</span></div>
        <div className="form-grid"><Field label="قيمة اليومية" required hint="تستخدم لخصم الغياب بعذر والأيام الإضافية."><Input type="number" min={0} step={1000} value={salary.dailyRate} onChange={event => change('dailyRate', Number(event.target.value))} /></Field><Field label="خصم الغياب بدون عذر" required hint="المبلغ الذي يخصم عن كل يوم غياب بدون عذر."><Input type="number" min={0} step={1000} value={salary.unexcusedRate} onChange={event => change('unexcusedRate', Number(event.target.value))} /></Field>{salary.mode === 'FIXED' ? <Field label="الراتب القطعي" required hint="لا يزيد الأساسي بزيادة الحضور في الشهر الكامل."><Input type="number" min={0} step={1000} value={salary.fixedSalary} onChange={event => change('fixedSalary', Number(event.target.value))} /></Field> : <><Field label="الحد الأعلى للراتب" required><Input type="number" min={0} step={1000} value={salary.maximum} onChange={event => change('maximum', Number(event.target.value))} /></Field><Field label="تبدأ الأيام الإضافية من اليوم" required hint="رقم أول يوم حضور يحتسب بعد نهاية القوانين."><Input type="number" min={1} step={1} value={salary.extraDaysStart} onChange={event => change('extraDaysStart', Number(event.target.value))} /></Field></>}</div>
        {salary.mode === 'TIERED' && <><div className={styles.sectionTitle}><h3>قوانين القسم</h3><Button variant="secondary" type="button" onClick={addTier}><Plus size={15} />إضافة قانون</Button></div><p className={styles.mutedNote}>تعتمد القوانين على أيام الحضور فقط. رتبها من 0 تصاعدياً؛ ثم تضاف اليومية لكل يوم إضافي حتى الحد الأعلى.</p>{salary.tiers.map((tier, index) => <div className={styles.tier} key={tier.id}><div className={styles.tierTitle}><span>القانون {index + 1}</span><Button variant="ghost" type="button" aria-label={`حذف القانون ${index + 1}`} onClick={() => change('tiers', salary.tiers.filter(item => item.id !== tier.id))}><Trash2 size={16} /></Button></div><div className={styles.tierFields}><Field label="من يوم"><Input type="number" min={0} step={1} value={tier.fromDays} onChange={event => updateTier(tier.id, 'fromDays', Number(event.target.value))} /></Field><Field label="إلى يوم"><Input type="number" min={0} step={1} value={tier.toDays} onChange={event => updateTier(tier.id, 'toDays', Number(event.target.value))} /></Field><Field label="طريقة الحساب"><Select value={tier.type} onChange={event => updateTier(tier.id, 'type', event.target.value as SalaryTier['type'])}><option value="PER_DAY">حسب اليومية</option><option value="FIXED">مبلغ ثابت</option></Select></Field><Field label={tier.type === 'FIXED' ? 'المبلغ الثابت' : 'طريقة الحساب'}>{tier.type === 'FIXED' ? <Input type="number" min={0} step={1000} value={tier.amount} onChange={event => updateTier(tier.id, 'amount', Number(event.target.value))} /> : <Input value="الحضور × اليومية" readOnly />}</Field></div></div>)}</>}
        {salary.mode === 'FIXED' && <p className={styles.mutedNote}>الشهر الأول أو الأخير غير المكتمل: أيام الحضور × قيمة اليومية، ضمن سقف الراتب القطعي. تطبق بعدها الخصومات والمكافآت.</p>}
        {department && <div className="notice notice-warning"><AlertCircle size={18} /><span>سيتم تطبيق تعديل إعدادات الراتب على الشهر المفتوح حالياً وإعادة احتساب الرواتب. الأشهر المؤرشفة تبقى ثابتة.</span></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className="form-actions"><Button type="submit" disabled={session?.role !== 'SUPER_ADMIN'}>{department ? 'حفظ الإعدادات' : 'إضافة القسم'}</Button><Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button></div>
      </form>
    </Dialog>
    <ConfirmDialog open={confirmation} onClose={() => setConfirmation(false)} onConfirm={save} title="تأكيد تعديل قواعد الراتب" description="سيتم تطبيق هذا التعديل على الشهر المفتوح حالياً وإعادة احتساب رواتب موظفي القسم. إذا تغير راتب مصروف ستظهر حالته «يحتاج مراجعة». تبقى النسخ المؤرشفة محفوظة." confirmLabel="حفظ وإعادة الاحتساب" />
  </>;
}
