'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, Clock3, Download, Globe2, LockKeyhole, Moon, QrCode, RotateCcw, Save, ShieldCheck, Sun, UsersRound, X } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useTheme } from '@/components/theme-provider';
import { Avatar, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader } from '@/components/ui';
import type { Role } from '@/lib/types';
import { serializeSystemBackup, systemBackupFilename } from '@/lib/system-backup';
import styles from './settings.module.css';

type Access = 'yes' | 'no' | 'own' | 'employees';
interface PermissionRow { label: string; superAdmin: Access; admin: Access; employee: Access }
const permissions: PermissionRow[] = [
  { label: 'عرض ملفات الموظفين', superAdmin: 'yes', admin: 'yes', employee: 'own' },
  { label: 'إضافة الموظفين وتعديل بياناتهم وتفعيلهم', superAdmin: 'yes', admin: 'employees', employee: 'no' },
  { label: 'إدارة اسم المستخدم وإعادة تعيين كلمة المرور', superAdmin: 'yes', admin: 'employees', employee: 'no' },
  { label: 'إنشاء حسابات الإدارة وتعديلها وتغيير الأدوار', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'إدارة الأقسام وإعدادات الرواتب المحمية', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'إدارة أيام الحضور ومراجعته وتعديله', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إدارة الخصومات والمكافآت', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إدارة رواتب الشهر الحالي وتسجيل صرفها', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'إعادة فتح أشهر الرواتب المؤرشفة', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'عرض التقارير العامة', superAdmin: 'yes', admin: 'yes', employee: 'no' },
  { label: 'عرض سجل العمليات وإدارة إعدادات النظام', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'تحميل نسخة احتياطية كاملة للنظام', superAdmin: 'yes', admin: 'no', employee: 'no' },
  { label: 'عرض الحضور والراتب والتفاصيل المالية السابقة', superAdmin: 'yes', admin: 'yes', employee: 'own' },
];
const roleLabels: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin / Manager', EMPLOYEE: 'موظف', QR_DISPLAY: 'QR Display' };

function AccessLabel({ access }: { access: Access }) {
  if (access === 'own') return <Badge tone="brand">بياناته فقط</Badge>;
  if (access === 'employees') return <Badge tone="neutral">حسابات الموظفين</Badge>;
  return <span className={access === 'yes' ? 'inline' : 'inline muted'}>{access === 'yes' ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{access === 'yes' ? 'متاح' : 'غير متاح'}</span>;
}

export default function SettingsPage() {
  const { data, session, updateData, resetDemo, prepareSystemBackup, saveQrDisplayAccount, qrDisplayConfigured, qrDisplayUsername, qrDisplayActive, backend, connectionError, discardDraft } = useDemo();
  const { theme } = useTheme();
  const toast = useToast();
  const [centerName, setCenterName] = useState(data.settings.centerName);
  const [qrInterval, setQrInterval] = useState(String(data.settings.qrInterval));
  const [errors, setErrors] = useState<{ name?: string; interval?: string }>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWord, setResetWord] = useState('');
  const [exporting, setExporting] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [qrUsernameDraft, setQrUsername] = useState<string | null>(null);
  const [qrPassword, setQrPassword] = useState('');
  const [qrActiveDraft, setQrActive] = useState<boolean | null>(null);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrError, setQrError] = useState('');
  const exportingRef = useRef(false);
  const qrUsername = qrUsernameDraft ?? (qrDisplayUsername || 'CENTER_QR');
  const qrActive = qrActiveDraft ?? (qrDisplayConfigured ? qrDisplayActive : true);
  const qrDirty = qrUsernameDraft !== null || qrActiveDraft !== null || qrPassword !== '';
  const dirty = centerName.trim() !== data.settings.centerName || Number(qrInterval) !== data.settings.qrInterval;
  const adminAccounts = data.employees.filter(employee => employee.role !== 'EMPLOYEE');

  async function downloadBackup() {
    if (exportingRef.current || session?.role !== 'SUPER_ADMIN') return;
    exportingRef.current = true;
    setExporting(true);
    setBackupError('');
    try {
      const backup = await prepareSystemBackup(theme);
      const file = new Blob([serializeSystemBackup(backup)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = systemBackupFilename(backup.payload.exportedAt);
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        // Keep the object URL alive while mobile browsers start the download.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      toast('تم تجهيز النسخة الاحتياطية. تأكد من حفظ الملف على جهازك.');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'تعذر تجهيز النسخة الاحتياطية. حاول مرة أخرى.');
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftForm = event.currentTarget;
    if (savingRef.current || session?.role !== 'SUPER_ADMIN') return;
    const nextErrors: typeof errors = {};
    const interval = Number(qrInterval);
    if (!centerName.trim()) nextErrors.name = 'أدخل اسم المركز.';
    if (!qrInterval.trim() || !Number.isInteger(interval) || interval < 30 || interval > 60) nextErrors.interval = 'اختر عدداً صحيحاً من 30 إلى 60 ثانية.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !dirty) return;
    const next = { centerName: centerName.trim(), qrInterval: interval };
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await updateData(draft => { draft.settings = next; }, { action: 'تعديل إعدادات النظام', entity: 'settings', entityId: 'center-settings', oldValues: { ...data.settings }, newValues: next }, undefined, draftForm);
      setCenterName(next.centerName);
      setQrInterval(String(next.qrInterval));
      toast('تم حفظ الإعدادات وتسجيل التغيير في سجل العمليات.');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات. حاول مرة أخرى.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function saveQrAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftForm = event.currentTarget;
    if (qrSaving || session?.role !== 'SUPER_ADMIN') return;
    const username = qrUsername.trim();
    if (!username) { setQrError('أدخل اسم مستخدم شاشة الحضور.'); return; }
    if (/\s/.test(username)) { setQrError('اسم المستخدم لا يقبل المسافات.'); return; }
    if (!qrDisplayConfigured && qrPassword.length < 6) { setQrError('أدخل كلمة مرور من 6 أحرف أو أرقام على الأقل.'); return; }
    if (qrPassword && qrPassword.length < 6) { setQrError('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.'); return; }
    setQrSaving(true); setQrError('');
    try {
      await saveQrDisplayAccount({ username, active: qrActive, ...(qrPassword ? { password: qrPassword } : {}) }, draftForm);
      setQrUsername(null); setQrActive(null);
      setQrPassword('');
      toast(qrDisplayConfigured ? 'تم تحديث حساب شاشة الحضور.' : 'تم إنشاء حساب شاشة الحضور.');
    } catch (error) { setQrError(error instanceof Error ? error.message : 'تعذر حفظ حساب شاشة الحضور.'); }
    finally { setQrSaving(false); }
  }

  function reset() {
    if (backend === 'neon' || resetWord.trim() !== 'إعادة ضبط' || session?.role !== 'SUPER_ADMIN') return;
    resetDemo();
    setCenterName('CenterPro');
    setQrInterval('45');
    setErrors({});
    setResetOpen(false);
    setResetWord('');
  }

  if (session?.role !== 'SUPER_ADMIN') return <EmptyState title="هذه الصفحة متاحة لـ Super Admin فقط" description="يمكن للإدارة العليا تعديل إعدادات المركز والاطلاع على صلاحيات الأدوار." />;

  return <div className="page-stack">
    <PageHeader title="الإعدادات" actions={<Badge tone="brand"><ShieldCheck size={14} />Super Admin</Badge>} />
    <Card title="نسخة احتياطية كاملة">
      <div className="stack">
        <p>{backend === 'neon' ? 'تنزيل نسخة كاملة من البيانات المحفوظة في قاعدة البيانات بملف واحد.' : 'تنزيل كل البيانات المحفوظة في هذا المتصفح بملف واحد، لنقلها لاحقاً إلى قاعدة البيانات.'}</p>
        <p className="muted">يشمل الحسابات وصور الموظفين والأقسام والحضور والرواتب والأرشيف والتقييمات والإعدادات وسجل العمليات.</p>
        <div className="notice"><LockKeyhole size={18} /><span>ملف JSON خاص بالمركز، يتضمن بيانات تحقق الدخول. احتفظ به في مكان آمن.</span></div>
        <div className="form-actions"><Button onClick={downloadBackup} loading={exporting} disabled={exporting}><Download size={17} />تحميل نسخة احتياطية كاملة</Button></div>
        {backupError && <p role="alert" className="text-danger">{backupError}</p>}
      </div>
    </Card>
    <div className="grid-2">
      <Card title="إعدادات المركز">
        <form onSubmit={save} className="stack">{saveError && <p className="text-danger" role="alert">{saveError}</p>}
          <Field label="اسم المركز" required error={errors.name}><Input value={centerName} onChange={event => setCenterName(event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.name)} /></Field>
          <Field label="تجديد رمز الحضور" required hint="من 30 إلى 60 ثانية. القيمة الافتراضية 45 ثانية." error={errors.interval}><div className="inline"><Input type="number" min={30} max={60} step={1} value={qrInterval} onChange={event => setQrInterval(event.target.value)} dir="ltr" aria-invalid={Boolean(errors.interval)} /><span className="muted">ثانية</span></div></Field>
          <div className="notice"><Clock3 size={18} /><span>يُستخدم هذا الفاصل الزمني لتجديد رمز الحضور.</span></div>
          <div className="form-actions"><Button type="submit" loading={saving} disabled={!dirty}><Save size={17} />حفظ الإعدادات</Button>{(dirty || saveError) && <Button variant="secondary" onClick={event => { setCenterName(data.settings.centerName); setQrInterval(String(data.settings.qrInterval)); setErrors({}); setSaveError(''); discardDraft(event.currentTarget.closest('form')); }}>إلغاء التغييرات</Button>}</div>
        </form>
      </Card>
      <Card title="أساسيات النظام">
        <div className="stack">
          {backend === 'neon' && <div className="list-row"><strong>قاعدة البيانات</strong><Badge tone={connectionError ? 'warning' : 'success'}>{connectionError ? 'تعذر الاتصال' : 'Neon · متصل'}</Badge></div>}
          <div className="list-row"><div className="inline"><Globe2 size={19} /><div><strong>لغة الواجهة</strong><div className="muted">العربية · من اليمين إلى اليسار</div></div></div><Badge>ثابت</Badge></div>
          <div className="list-row"><div className="inline">{theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}<div><strong>مظهر الواجهة</strong><div className="muted">{theme === 'dark' ? 'داكن' : 'فاتح'} · هوية CenterPro</div></div></div><Badge>حسب اختيارك</Badge></div>
          <div className="list-row"><div className="inline"><Clock3 size={19} /><div><strong>المنطقة الزمنية</strong><div className="muted">بغداد <span dir="ltr">(Asia/Baghdad)</span></div></div></div><Badge>ثابت</Badge></div>
          <div className="notice"><LockKeyhole size={18} /><span>تسجيل الحضور لا يشترط GPS أو الاتصال بشبكة Wi-Fi محددة.</span></div>
        </div>
      </Card>
    </div>
    <Card title="الأدوار والصلاحيات">
      <div className="table-wrap" role="region" aria-label="جدول الصلاحيات" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">الصلاحية</th><th scope="col" dir="ltr">Super Admin</th><th scope="col" dir="ltr">Admin / Manager</th><th scope="col">موظف</th></tr></thead><tbody>{permissions.map(permission => <tr key={permission.label}><th scope="row">{permission.label}</th><td><AccessLabel access={permission.superAdmin} /></td><td><AccessLabel access={permission.admin} /></td><td><AccessLabel access={permission.employee} /></td></tr>)}</tbody></table></div>
      <div className="notice">يسجل الموظف حضوره بنفسه من قارئ QR، ويطّلع على بياناته فقط. إدارة حسابات الإدارة والأدوار متاحة لـ Super Admin من ملف الموظف.</div>
    </Card>
    <Card title="حساب شاشة الحضور" action={<Badge tone={qrDisplayConfigured && qrDisplayActive ? 'success' : 'neutral'}>{qrDisplayConfigured ? qrDisplayActive ? 'نشط' : 'معطل' : 'غير مُنشأ'}</Badge>}>
      <form className="stack" onSubmit={saveQrAccount} noValidate>
        <div className="notice"><QrCode size={20}/><span>حساب مستقل للـ iPad. بعد تسجيل الدخول يفتح شاشة QR فقط ولا يملك صلاحية الموظفين أو الرواتب أو الإعدادات.</span></div>
        <div className="grid-2">
          <Field label="اسم المستخدم" required><Input dir="ltr" value={qrUsername} onChange={event => setQrUsername(event.target.value)} autoComplete="username" placeholder="CENTER_QR" /></Field>
          <Field label={qrDisplayConfigured ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'} required={!qrDisplayConfigured}><Input type="password" dir="ltr" value={qrPassword} onChange={event => setQrPassword(event.target.value)} autoComplete="new-password" placeholder={qrDisplayConfigured ? 'اتركها فارغة للإبقاء على الحالية' : ''} /></Field>
        </div>
        <label className="remember-login"><input type="checkbox" checked={qrActive} onChange={event => setQrActive(event.target.checked)} /><span>الحساب نشط</span></label>
        {qrError && <p className="text-danger" role="alert">{qrError}</p>}
        <div className="form-actions"><Button type="submit" loading={qrSaving}><Save size={17}/>{qrDisplayConfigured ? 'حفظ حساب شاشة الحضور' : 'إنشاء حساب شاشة الحضور'}</Button>{(qrDirty || qrError) && <Button variant="secondary" disabled={qrSaving} onClick={event => { setQrUsername(null); setQrActive(null); setQrPassword(''); setQrError(''); discardDraft(event.currentTarget.closest('form')); }}>إلغاء تعديلات حساب الشاشة</Button>}<Link className="button-link" href="/attendance-display"><QrCode size={16}/>فتح شاشة الحضور<ChevronLeft size={14}/></Link></div>
      </form>
    </Card>
    <Card title="حسابات الإدارة" action={<Link href="/employees" className="button-link"><UsersRound size={17} />إدارة الموظفين<ChevronLeft size={15} /></Link>}>
      <div className="stack">
        <div className="notice"><ShieldCheck size={20}/><div><strong>مدير النظام</strong><p>حساب الإدارة الرئيسي خارج قائمة الموظفين والحضور والرواتب.</p></div></div>
        {!adminAccounts.length && <EmptyState title="لم تُضف حسابات إدارة بعد" description="يمكنك تعيين دور إداري لحساب موظف تضيفه بنفسك."/>}
        {adminAccounts.map(account => <div className={`list-row ${styles.accountRow}`} key={account.id}>
          <div className={`inline ${styles.accountIdentity}`}><Avatar name={account.name} src={account.photo}/><div>
            <Link href={`/employees/${account.id}`} className="button-link">{account.name}</Link>
            <div className="muted" dir="ltr">{account.code} · {account.username}</div>
          </div></div>
          <div className={`inline ${styles.accountActions}`}><Badge tone={account.active ? 'brand' : 'neutral'}>{account.active ? roleLabels[account.role] : 'غير نشط'}</Badge><Link href={`/employees/${account.id}`} className="button-link" aria-label={`إدارة حساب ${account.name}`}><ChevronLeft size={18}/></Link></div>
        </div>)}
      </div>
    </Card>
    {backend === 'local' && <><Card title="إعادة ضبط النظام">
      <div className="list-row"><p className="muted">تُحذف كل الأقسام والموظفين وأيام الحضور والبيانات المالية والسجل. يبقى حساب مدير النظام متاحاً.</p><Button variant="danger" onClick={() => { setResetWord(''); setResetOpen(true); }}><RotateCcw size={17} />تصفير بيانات النظام</Button></div>
    </Card>
    <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="إعادة ضبط جميع بيانات النظام؟" description="ستُحذف الموظفون والأقسام والحضور والرواتب والتقييمات وسجل العمليات وتعود المنظومة إلى حالة فارغة. لا يمكن التراجع عن هذا الإجراء.">
      <div className="stack"><Field label="اكتب «إعادة ضبط» للتأكيد"><Input value={resetWord} onChange={event => setResetWord(event.target.value)} autoComplete="off" placeholder="إعادة ضبط" /></Field><div className="form-actions"><Button variant="danger" disabled={resetWord.trim() !== 'إعادة ضبط'} onClick={reset}>تأكيد إعادة ضبط النظام</Button><Button variant="secondary" onClick={() => setResetOpen(false)}>إلغاء</Button></div></div>
    </Dialog></>}
  </div>;
}
