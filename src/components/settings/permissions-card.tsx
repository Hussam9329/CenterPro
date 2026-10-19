import { Check, X } from 'lucide-react';
import { Badge, Card } from '@/components/ui';

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
function AccessLabel({ access }: { access: Access }) {
  if (access === 'own') return <Badge tone="brand">بياناته فقط</Badge>;
  if (access === 'employees') return <Badge tone="neutral">حسابات الموظفين</Badge>;
  return <span className={access === 'yes' ? 'inline' : 'inline muted'}>{access === 'yes' ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{access === 'yes' ? 'متاح' : 'غير متاح'}</span>;
}

export function PermissionsCard() {
  return <Card title="الأدوار والصلاحيات">
      <div className="table-wrap" role="region" aria-label="جدول الصلاحيات" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">الصلاحية</th><th scope="col" dir="ltr">المدير العام</th><th scope="col" dir="ltr">مدير العمليات</th><th scope="col">موظف</th></tr></thead><tbody>{permissions.map(permission => <tr key={permission.label}><th scope="row">{permission.label}</th><td><AccessLabel access={permission.superAdmin} /></td><td><AccessLabel access={permission.admin} /></td><td><AccessLabel access={permission.employee} /></td></tr>)}</tbody></table></div>
      <div className="notice">يسجل الموظف حضوره بنفسه من قارئ QR، ويطّلع على بياناته فقط. إدارة حسابات الإدارة والأدوار متاحة لـ المدير العام من ملف الموظف.</div>
    </Card>;
}
