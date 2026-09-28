'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Check, ChevronLeft, Clock3, Globe2, LockKeyhole, RotateCcw, Save, ShieldCheck, Sun, UsersRound, X } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import type { Role } from '@/lib/types';

type Access = 'yes' | 'no' | 'own' | 'employees';
interface PermissionRow { label: string; superAdmin: Access; admin: Access; employee: Access }
const permissions: PermissionRow[] = [
  { label: 'عرض ملفات الموظفين', superAdmin: 'yes', admin: 'yes', employee: 'own' },
  { label: 'إضافة الموظفين وتعديل بياناتهم وتفعيلهم', superAdmin: 'yes', admin: 'employees', employee: 'no' },
  { label: 'إدارة اسم المستخدم وإعادة تعيين كلمة المرور', superAdmin: 'yes', admin: 'employees', employee: 'no' },
  { label: 'إنشاء حسابات الإدارة وتعديلها وتغيير الأدوار', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'إدارة الأقسام وإعدادات الرواتب المحمية', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'فتح أيام العمل ومراجعة الحضور وتعديله', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إدارة الخصومات والمكافآت', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إدارة رواتب الشهر الحالي وتسجيل صرفها', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إعادة فتح أشهر الرواتب المؤرشفة', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'عرض التقارير العامة', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'عرض سجل العمليات وإدارة إعدادات النظام', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'عرض الحضور والراتب والتفاصيل المالية السابقة', superAdmin: 'yes', admin: 'yes', employee: 'own' },
];
const roleLabels: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف' };

function AccessLabel({ access }: { access: Access }) {
  if (access === 'own') return <Badge tone="brand">بياناته فقط</Badge>;
  if (access === 'employees') return <Badge tone="neutral">حسابات الموظفين</Badge>;
  return <span className={access === 'yes' ? 'inline' : 'inline muted'}>{access === 'yes' ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{access === 'yes' ? 'متاح' : 'غير متاح'}</span>;
}

export default function SettingsPage() {
  const { data, session, updateData, resetDemo } = useDemo();
  const toast = useToast();
  const [centerName, setCenterName] = useState(data.settings.centerName);
  const [qrInterval, setQrInterval] = useState(String(data.settings.qrInterval));
  const [errors, setErrors] = useState<{ name?: string; interval?: string }>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState('');
  const dirty = centerName.trim() !== data.settings.centerName || Number(qrInterval) !== data.settings.qrInterval;
  const adminAccounts = data.employees.filter(employee => employee.role !== 'EMPLOYEE');

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session?.role !== 'SUPER_ADMIN') return;
    const nextErrors: typeof errors = {};
    const interval = Number(qrInterval);
    if (!centerName.trim()) nextErrors.name = 'أدخل اسم المركز.';
    if (!qrInterval.trim() || !Number.isInteger(interval) || interval < 30 || interval > 60) nextErrors.interval = 'اختر عدداً صحيحاً من 30 إلى 60 ثانية.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !dirty) return;
    const next = { centerName: centerName.trim(), qrInterval: interval };
    updateData(draft => { draft.settings = next; }, { action: 'تعديل إعدادات النظام', entity: 'settings', entityId: 'center-settings', oldValues: { ...data.settings }, newValues: next });
    setCenterName(next.centerName);
    setQrInterval(String(next.qrInterval));
    toast('تم حفظ الإعدادات التجريبية وتسجيل التغيير في سجل العمليات.');
  }

  function reset() {
    if (resetWord.trim() !== 'إعادة ضبط' || session?.role !== 'SUPER_ADMIN') return;
    resetDemo();
    setCenterName('CenterPro');
    setQrInterval('45');
    setErrors({});
    setResetOpen(false);
    setResetWord('');
  }

  if (session?.role !== 'SUPER_ADMIN') return <EmptyState title="هذه الصفحة متاحة لـ Super Admin فقط" description="يمكن للإدارة العليا تعديل إعدادات المركز والاطلاع على صلاحيات الأدوار." />;

  return <div className="page-stack">
    <PageHeader eyebrow="إدارة النظام" title="الإعدادات" description="إعدادات المركز والصلاحيات، بوضوح وفي مكان واحد." actions={<Badge tone="brand"><ShieldCheck size={14} />Super Admin</Badge>} />
    <div className="notice"><ShieldCheck size={18} /><span>معاينة الواجهات: التغييرات تخص هذه الجلسة في المتصفح، ولا تغيّر إعدادات نظام فعلي.</span></div>
    <div className="grid-2">
      <Card title="إعدادات المركز" description="يُسجّل كل تعديل تحفظه في سجل العمليات التجريبي.">
        <form onSubmit={save} className="stack">
          <Field label="اسم المركز" required error={errors.name}><Input value={centerName} onChange={event => setCenterName(event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.name)} /></Field>
          <Field label="تجديد رمز الحضور" required hint="من 30 إلى 60 ثانية. القيمة الافتراضية 45 ثانية." error={errors.interval}><div className="inline"><Input type="number" min={30} max={60} step={1} value={qrInterval} onChange={event => setQrInterval(event.target.value)} dir="ltr" aria-invalid={Boolean(errors.interval)} /><span className="muted">ثانية</span></div></Field>
          <div className="notice"><Clock3 size={18} /><span>ينعكس الفاصل الزمني على شاشة QR التجريبية. التحقق الفعلي من الرمز يُفعّل بعد اعتماد الواجهات.</span></div>
          <div className="form-actions"><Button type="submit" disabled={!dirty}><Save size={17} />حفظ الإعدادات</Button>{dirty && <Button variant="secondary" onClick={() => { setCenterName(data.settings.centerName); setQrInterval(String(data.settings.qrInterval)); setErrors({}); }}>إلغاء التغييرات</Button>}</div>
        </form>
      </Card>
      <Card title="أساسيات النظام" description="إعدادات ثابتة حسب مواصفات CenterPro.">
        <div className="stack">
          <div className="list-row"><div className="inline"><Globe2 size={19} /><div><strong>لغة الواجهة</strong><div className="muted">العربية · من اليمين إلى اليسار</div></div></div><Badge>ثابت</Badge></div>
          <div className="list-row"><div className="inline"><Sun size={19} /><div><strong>مظهر الواجهة</strong><div className="muted">فاتح · هوية CenterPro</div></div></div><Badge>ثابت</Badge></div>
          <div className="list-row"><div className="inline"><Clock3 size={19} /><div><strong>المنطقة الزمنية</strong><div className="muted">بغداد <span dir="ltr">(Asia/Baghdad)</span></div></div></div><Badge>ثابت</Badge></div>
          <div className="notice"><LockKeyhole size={18} /><span>تسجيل الحضور لا يشترط GPS أو الاتصال بشبكة Wi-Fi محددة.</span></div>
        </div>
      </Card>
    </div>
    <Card title="الأدوار والصلاحيات" description="الصلاحيات المحددة لكل دور في مواصفات النظام. هذه المصفوفة للعرض.">
      <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">الصلاحية</th><th scope="col" dir="ltr">Super Admin</th><th scope="col" dir="ltr">Admin / Manager</th><th scope="col">موظف</th></tr></thead><tbody>{permissions.map(permission => <tr key={permission.label}><th scope="row">{permission.label}</th><td><AccessLabel access={permission.superAdmin} /></td><td><AccessLabel access={permission.admin} /></td><td><AccessLabel access={permission.employee} /></td></tr>)}</tbody></table></div>
      <div className="notice">يسجل الموظف حضوره بنفسه من قارئ QR، ويطّلع على بياناته فقط. إدارة حسابات الإدارة والأدوار متاحة لـ Super Admin من ملف الموظف.</div>
    </Card>
    <Card title="حسابات الإدارة" description="افتح ملف الحساب لإدارة بياناته، دوره أو كلمة مروره." action={<Link href="/employees" className="button-link"><UsersRound size={17} />إدارة الموظفين<ChevronLeft size={15} /></Link>}>
      <div className="stack">{adminAccounts.map(account => <div className="list-row" key={account.id}><div className="inline"><Avatar name={account.name} src={account.photo} /><div><Link href={`/employees/${account.id}`} className="button-link">{account.name}</Link><div className="muted" dir="ltr">{account.code} · {account.username}</div></div></div><div className="inline"><Badge tone={account.active ? 'brand' : 'neutral'}>{account.active ? roleLabels[account.role] : 'غير نشط'}</Badge><Link href={`/employees/${account.id}`} className="button-link" aria-label={`إدارة حساب ${account.name}`}><ChevronLeft size={18} /></Link></div></div>)}</div>
    </Card>
    <Card title="إعادة ضبط المعاينة" description="استرجع بيانات العرض الأصلية بعد تجربة الإضافة والتعديل.">
      <div className="list-row"><p className="muted">تحذف إعادة الضبط كل تغييرات جلسة المعاينة وسجلها التجريبي، مع إبقاء الدور الحالي.</p><Button variant="danger" onClick={() => { setResetWord(''); setResetOpen(true); }}><RotateCcw size={17} />إعادة ضبط البيانات</Button></div>
    </Card>
    <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="إعادة ضبط جميع بيانات المعاينة؟" description="ستُحذف إضافاتك وتعديلاتك على الموظفين والحضور والرواتب والإعدادات وسجل العمليات في هذه الجلسة. ستعود البيانات التجريبية الأصلية، ولا يمكن التراجع عن هذا الإجراء.">
      <div className="stack"><Field label="اكتب «إعادة ضبط» للتأكيد"><Input value={resetWord} onChange={event => setResetWord(event.target.value)} autoComplete="off" placeholder="إعادة ضبط" /></Field><div className="form-actions"><Button variant="danger" disabled={resetWord.trim() !== 'إعادة ضبط'} onClick={reset}>تأكيد إعادة ضبط المعاينة</Button><Button variant="secondary" onClick={() => setResetOpen(false)}>إلغاء</Button></div></div>
    </Dialog>
  </div>;
}
