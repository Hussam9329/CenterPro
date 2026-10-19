'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { Badge, Button, Card } from '@/components/ui';
import { ACCOUNT_PERMISSION_FEATURES, EMPTY_ACCOUNT_PERMISSION, getEmployeePermission } from '@/lib/permissions';
import type { AccountPermissionAction, AccountPermissionFeature, AccountPermissions, Employee } from '@/lib/types';

function clonePermissions(employee: Employee): AccountPermissions {
  return Object.fromEntries(ACCOUNT_PERMISSION_FEATURES.map(({ feature }) => [feature, { ...getEmployeePermission(employee, feature) }])) as AccountPermissions;
}

export function AccountPermissionsEditor({ employee }: { employee: Employee }) {
  return <PermissionForm key={employee.id} employee={employee} />;
}

const actions: ReadonlyArray<{ action: AccountPermissionAction; label: string }> = [
  { action: 'view', label: 'عرض' }, { action: 'create', label: 'إضافة' },
  { action: 'edit', label: 'تعديل' }, { action: 'delete', label: 'حذف' },
];

function PermissionForm({ employee }: { employee: Employee }) {
  const { session, updateData, discardDraft } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const form = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<{ values: AccountPermissions; baseline: string } | null>(null);
  const [error, setError] = useState('');
  const canonical = clonePermissions(employee);
  const permissions = draft?.values ?? canonical;
  const canManage = session?.role === 'SUPER_ADMIN' && employee.role === 'EMPLOYEE';

  function setPermission(feature: AccountPermissionFeature, action: AccountPermissionAction, checked: boolean) {
    if (!canManage || pending) return;
    setError('');
    setDraft(previous => {
      const values = previous?.values ?? canonical;
      const current = { ...(values[feature] ?? EMPTY_ACCOUNT_PERMISSION) };
      if (action === 'view') {
        current.view = checked;
        if (!checked) { current.create = false; current.edit = false; current.delete = false; }
      } else {
        current[action] = checked;
        if (checked) current.view = true;
      }
      return { values: { ...values, [feature]: current }, baseline: previous?.baseline ?? JSON.stringify(canonical) };
    });
  }

  function cancel() {
    if (pending) return;
    discardDraft(form.current);
    setDraft(null);
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !draft || pending) return;
    setError('');
    const normalized = Object.fromEntries(ACCOUNT_PERMISSION_FEATURES.map(({ feature, actions: supported }) => {
      const current = draft.values[feature] ?? EMPTY_ACCOUNT_PERMISSION;
      const allowed = new Set(supported);
      return [feature, {
        view: Boolean(current.view),
        create: Boolean(current.view && allowed.has('create') && current.create),
        edit: Boolean(current.view && allowed.has('edit') && current.edit),
        delete: Boolean(current.view && allowed.has('delete') && current.delete),
      }];
    })) as AccountPermissions;
    if (!await mutate(() => updateData((data, actor) => {
      if (actor?.role !== 'SUPER_ADMIN') throw new Error('تعديل صلاحيات الحساب متاح للمشرف العام فقط.');
      const target = data.employees.find(item => item.id === employee.id);
      if (!target || target.role !== 'EMPLOYEE') throw new Error('حساب الموظف غير موجود أو تغيّر دوره.');
      if (JSON.stringify(clonePermissions(target)) !== draft.baseline) throw new Error('تغيّرت صلاحيات الحساب. ألغِ التغييرات لمراجعة الصلاحيات الحالية قبل الحفظ.');
      target.permissions = normalized;
      target.updatedAt = new Date().toISOString();
    }, before => ({ action: 'تعديل صلاحيات حساب موظف', entity: 'employee-permissions', entityId: employee.id, employeeId: employee.id, oldValues: { permissions: before.employees.find(item => item.id === employee.id)?.permissions ?? {} }, newValues: { permissions: normalized } }), undefined, form.current ?? undefined), setError)) return;
    setDraft(null);
    toast('تم حفظ صلاحيات الحساب.');
  }

  if (employee.role !== 'EMPLOYEE') return <Card title="صلاحيات القوائم"><div className="notice"><ShieldCheck size={20}/><span>هذا الحساب إداري ويستخدم صلاحيات دوره الأساسية. الصلاحيات اليدوية مخصصة لحسابات الموظفين.</span></div></Card>;

  return <Card title="صلاحيات القوائم" action={canManage ? <Badge tone="brand">السوبر أدمن فقط</Badge> : <Badge>عرض فقط</Badge>}>
    <form ref={form} onSubmit={save} className="stack" aria-label={`صلاحيات ${employee.name}`}>
      <p className="muted">تفعيل العرض يتيح قراءة القائمة فقط. امنح الإضافة والتعديل والحذف كلّاً على حدة عند الحاجة.</p>
      {ACCOUNT_PERMISSION_FEATURES.map(item => {
        const value = permissions[item.feature] ?? EMPTY_ACCOUNT_PERMISSION;
        const supportedActions = actions.filter(({ action }) => item.actions.includes(action)).map(action => ({ ...action, label: item.actionLabels?.[action.action] ?? action.label }));
        return <fieldset key={item.feature} style={{ minWidth: 0, margin: 0, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 10 }}>
          <legend style={{ paddingInline: 6, fontWeight: 700 }}>{item.label}</legend>
          <p className="muted">{item.description}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px' }}>{supportedActions.map(({ action, label }) => <label key={action} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <input type="checkbox" aria-label={`${label} ${item.label}`} style={{ width: 20, height: 20, accentColor: 'var(--brand-text)' }} checked={Boolean(value[action])} disabled={!canManage || (action !== 'view' && !value.view) || pending} onChange={event => setPermission(item.feature, action, event.target.checked)} />{label}
          </label>)}</div>
        </fieldset>;
      })}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {canManage && <div className="form-actions"><Button type="button" variant="secondary" disabled={pending || !draft} onClick={cancel}>إلغاء التغييرات</Button><Button type="submit" loading={pending} disabled={!draft}><ShieldCheck size={17}/>حفظ الصلاحيات</Button></div>}
    </form>
  </Card>;
}
