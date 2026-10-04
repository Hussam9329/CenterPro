'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarCheck2, Database, Moon, ShieldCheck, Sun, UsersRound, Wallet } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button, Field, Select } from '@/components/ui';
import { canLoadTestData, useDemo } from '@/components/demo-provider';
import { useWelcome } from '@/components/welcome-provider';
import { useTheme } from '@/components/theme-provider';

export default function LoginPage() {
  const { login, data, ready, loadTestData, session, remembered } = useDemo();
  const router = useRouter();
  const { showWelcome } = useWelcome();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [accountId, setAccountId] = useState('SYSTEM');
  const activeAccounts = useMemo(() => [...data.employees].filter(employee => employee.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [data.employees]);
  const selected = activeAccounts.find(employee => employee.id === accountId);

  useEffect(() => {
    if (!ready || !session || !remembered || loading || new URLSearchParams(window.location.search).get('switch') === '1') return;
    router.replace(session.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
  }, [loading, ready, remembered, router, session]);

  async function enter(event: FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    const ok = accountId === 'SYSTEM' ? login('SUPER_ADMIN', undefined, remember) : selected ? login(selected.role, selected.id, remember) : false;
    if (!ok) { setLoading(false); return; }
    await showWelcome();
    router.push(selected?.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
  }

  function loadFixture() {
    if (loadTestData()) setAccountId('SYSTEM');
  }

  return <main className="login-page" id="main-content">
    <button className="icon-button login-theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
    <section className="login-story">
      <Brand reversed/>
      <div className="login-story-inner">
        <div className="login-story-kicker">منظومة إدارة المركز</div>
        <h1 className="login-story-title">كل التفاصيل.<br/>في مكان واحد.</h1>
        <div className="login-story-points"><div><UsersRound size={20}/><span>فريق واحد. إدارة أكثر وضوحاً.</span></div><div><CalendarCheck2 size={20}/><span>حضور دقيق، ومتابعة مستمرة.</span></div><div><Wallet size={20}/><span>رواتب وتقييمات مفصّلة.</span></div></div>
      </div>
      <div className="login-story-footer">CenterPro © 2026</div>
    </section>

    <section className="login-form-side">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><Brand/></div>
        <div className="login-heading"><span className="eyebrow">معاينة CenterPro</span><h2>تسجيل الدخول</h2></div>
        <form onSubmit={enter} className="stack">
          <Field label="الحساب" required>
            <Select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={loading}>
              <option value="SYSTEM">مدير النظام — Super Admin</option>
              {activeAccounts.map(employee => {
                const department = data.departments.find(item => item.id === employee.departmentId)?.name || 'بدون قسم';
                return <option key={employee.id} value={employee.id}>{employee.name} — {department}</option>;
              })}
            </Select>
          </Field>
          <label className="remember-login"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/><span>ابقني مسجلاً</span></label>
          <Button type="submit" loading={loading} disabled={!ready}>تسجيل الدخول<ArrowLeft size={17}/></Button>
        </form>

        <div className="login-preview-note"><ShieldCheck size={17}/><div><strong>معاينة الواجهات</strong></div></div>
        {canLoadTestData(data) && <div className="login-test-data"><Database size={20}/><div><strong>بيانات الاختبار</strong><p>4 مصححين و3 مدققين مع سجلات الحضور.</p></div><Button type="button" variant="secondary" disabled={!ready || loading} onClick={loadFixture}><Database size={16}/>تحميل بيانات الاختبار</Button></div>}
        <div className="login-footer">مركز واحد. تجربة متكاملة.</div>
      </div>
    </section>
  </main>;
}
