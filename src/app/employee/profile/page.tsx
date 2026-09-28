'use client';

import { ShieldCheck } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import { date, time } from '@/lib/format';

export default function EmployeeProfilePage() {
  const { data, session, ready } = useDemo();
  if (!ready || !session) return <div className="page-stack"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-card" /></div>;
  const employee = data.employees.find(item => item.id === session.employeeId);
  if (!employee || session.role !== 'EMPLOYEE') return null;
  if (!employee.active) return <EmptyState title="حسابك غير فعال حالياً" description="يرجى مراجعة إدارة المركز." />;
  const department = data.departments.find(item => item.id === employee.departmentId);
  const personalFields = [{ label: 'الاسم الكامل', value: employee.name }, { label: 'الجنس', value: employee.gender === 'MALE' ? 'ذكر' : 'أنثى' }, { label: 'تاريخ الميلاد', value: date(employee.birthDate), ltr: true }, { label: 'التحصيل الدراسي', value: employee.qualification }, { label: 'العنوان / السكن', value: employee.address }];
  const contactFields = [{ label: 'رقم الهاتف', value: employee.phone }, { label: 'رقم هاتف ولي الأمر', value: employee.guardianPhone }, { label: 'البريد الإلكتروني', value: employee.email }, { label: 'معرف تليغرام', value: employee.telegram }];
  const workFields = [{ label: 'رقم الموظف', value: employee.code, ltr: true }, { label: 'القسم', value: department?.name }, { label: 'تاريخ المباشرة', value: date(employee.startDate), ltr: true }, { label: 'الحالة', value: 'فعال' }, { label: 'اسم المستخدم', value: employee.username, ltr: true }, { label: 'نوع الحساب', value: 'موظف' }, { label: 'تاريخ إنشاء الحساب', value: `${date(employee.createdAt)} · ${time(employee.createdAt)}`, ltr: true }, { label: 'آخر تحديث', value: `${date(employee.updatedAt)} · ${time(employee.updatedAt)}`, ltr: true }];
  return <div className="page-stack">
    <PageHeader eyebrow="مساحتك الشخصية" title="حسابي" description="بياناتك المسجلة لدى المركز. لتحديث أي معلومة، تواصل مع الإدارة." />
    <Card><div className="list-row"><div className="inline"><Avatar name={employee.name} src={employee.photo} size={72} /><div><h2>{employee.name}</h2><p className="muted">{department?.name} · <bdi>{employee.code}</bdi></p></div></div><Badge tone="success">حساب فعال</Badge></div></Card>
    <div className="grid-2">
      <Card title="المعلومات الشخصية"><dl className="detail-grid">{personalFields.map(item => <div className="detail-item" key={item.label}><dt>{item.label}</dt><dd>{item.ltr ? <bdi>{item.value || 'غير مضاف'}</bdi> : item.value || 'غير مضاف'}</dd></div>)}</dl></Card>
      <Card title="معلومات الاتصال"><dl className="detail-grid">{contactFields.map(item => <div className="detail-item" key={item.label}><dt>{item.label}</dt><dd><bdi>{item.value || 'غير مضاف'}</bdi></dd></div>)}</dl></Card>
    </div>
    <Card title="معلومات العمل والحساب"><dl className="detail-grid">{workFields.map(item => <div className="detail-item" key={item.label}><dt>{item.label}</dt><dd>{item.ltr ? <bdi>{item.value || 'غير مضاف'}</bdi> : item.value || 'غير مضاف'}</dd></div>)}</dl></Card>
    {employee.notes && <Card title="ملاحظات"><p>{employee.notes}</p></Card>}
    <div className="notice"><ShieldCheck size={21} aria-hidden="true" /><p>تتولى الإدارة تحديث بيانات الحساب وتغيير كلمة المرور عند الحاجة.</p></div>
  </div>;
}
