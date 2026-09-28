'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserRound, BriefcaseBusiness, ArrowLeft, CalendarCheck2, Wallet, UsersRound, Eye, EyeOff } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import type { Role } from '@/lib/types';

export default function LoginPage() {
  const { login, data, ready } = useDemo();
  const router = useRouter();
  const [role, setRole] = useState<Role>('SUPER_ADMIN');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const account = data.employees.find(employee => employee.role === role && employee.active);
  async function enter(event: FormEvent) { event.preventDefault(); if (!ready || !account) return; setLoading(true); login(role); router.push(role === 'EMPLOYEE' ? '/employee' : '/dashboard'); }
  const roles = [{ value:'SUPER_ADMIN' as const,label:'المدير العام',icon:ShieldCheck },{ value:'ADMIN' as const,label:'مدير العمليات',icon:BriefcaseBusiness },{ value:'EMPLOYEE' as const,label:'موظف',icon:UserRound }];
  return <main className="login-page" id="main-content"><section className="login-story"><Brand reversed/><div className="login-story-inner"><div className="login-story-kicker">منظومة إدارة المركز</div><h1 className="login-story-title">كل التفاصيل.<br/>في مكان واحد.</h1><p className="login-story-copy">مساحة عمل منظّمة تجمع فريقك، حضوره ورواتبه. لتبدأ كل يوم برؤية واضحة وتبقى أقرب إلى التفاصيل.</p><div className="login-story-points"><div><UsersRound size={20}/><span>فريق واحد. إدارة أكثر وضوحاً.</span></div><div><CalendarCheck2 size={20}/><span>حضور دقيق، ومتابعة مستمرة.</span></div><div><Wallet size={20}/><span>رواتب مفصّلة، لكل موظف.</span></div></div></div><div className="login-story-footer">CenterPro © 2026 · مبني على الوضوح والنظام</div></section><section className="login-form-side"><div className="login-form-wrap"><div className="login-mobile-brand"><Brand/></div><div className="login-heading"><span className="eyebrow">أهلاً بعودتك</span><h2>مساحتك للعمل تبدأ هنا.</h2><p>ادخل إلى CenterPro وتابع تفاصيل يومك.</p></div><div className="login-role-grid" aria-label="اختر دور المعاينة">{roles.map(item => <button key={item.value} className={`login-role ${role === item.value ? 'active' : ''}`} onClick={() => setRole(item.value)} aria-pressed={role === item.value}><item.icon className="login-role-icon" size={21}/><span>{item.label}</span></button>)}</div><form onSubmit={enter}><Field label="اسم المستخدم"><Input dir="ltr" value={account?.username || ''} readOnly autoComplete="off" aria-label="اسم المستخدم"/></Field><Field label="كلمة المرور" hint="حقل توضيحي للواجهة؛ لا تحتاج كلمة مرور في المعاينة."><div style={{ position:'relative' }}><Input type={visible ? 'text' : 'password'} value="preview-only" readOnly autoComplete="off" dir="ltr" style={{ paddingRight:48 }}/><button type="button" className="icon-button" style={{ position:'absolute',right:4,top:3 }} onClick={() => setVisible(!visible)} aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></Field><Button type="submit" loading={loading} disabled={!ready}>دخول إلى المعاينة<ArrowLeft size={17}/></Button></form><div className="login-preview-note"><strong>معاينة تفاعلية للواجهات</strong><p>اختر دوراً لتجربة شاشاته. جميع الأسماء والبيانات تجريبية، والتعديلات محفوظة في جلسة هذا المتصفح فقط.</p></div><div className="login-footer">مركز واحد. تجربة متكاملة.</div></div></section></main>;
}
