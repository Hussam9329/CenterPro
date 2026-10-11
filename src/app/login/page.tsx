'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, Moon, Sun, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { Button, Field, Input } from '@/components/ui';
import { useDemo } from '@/components/demo-provider';
import { useWelcome } from '@/components/welcome-provider';
import { useTheme } from '@/components/theme-provider';

export default function LoginPage() {
  const { login, setupSystemAdmin, data, ready, session, remembered, systemConfigured, systemUsername } = useDemo();
  const router = useRouter();
  const { showWelcome } = useWelcome();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [usernameInput, setUsername] = useState<string | null>(null);
  const username = usernameInput ?? (ready && !systemConfigured ? systemUsername : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !session || !remembered || loading || new URLSearchParams(window.location.search).get('switch') === '1') return;
    router.replace(session.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
  }, [loading, ready, remembered, router, session]);

  async function enter(event: FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    setError('');
    const cleanUsername = username.trim();
    if (!cleanUsername) { setError('أدخل اسم المستخدم.'); return; }
    if (!password) { setError('أدخل كلمة المرور.'); return; }
    if (!systemConfigured) {
      if (password.length < 6) { setError('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.'); return; }
      if (password !== confirmPassword) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
    }
    setLoading(true);
    try {
      const ok = systemConfigured
        ? await login(cleanUsername, password, remember)
        : await setupSystemAdmin(cleanUsername, password, remember);
      if (!ok) {
        setError(systemConfigured ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'تعذر إنشاء حساب مدير النظام. جرّب اسم مستخدم آخر.');
        return;
      }
      await showWelcome();
      const employeeRole = data.employees.find(employee => employee.active && employee.username.trim().toLocaleLowerCase('en-US') === cleanUsername.toLocaleLowerCase('en-US'))?.role;
      router.push(employeeRole === 'EMPLOYEE' ? '/employee' : '/dashboard');
    } catch {
      setError('تعذر تسجيل الدخول. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page" id="main-content">
    <button className="icon-button login-theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
    <section className="login-story">
      <Brand reversed/>
      <div className="login-story-inner"><h1 className="login-story-title">CenterPro معك بكل خطوة.</h1></div>
      <div className="login-story-footer">Kal-EL VISIONS © 2026</div>
    </section>

    <section className="login-form-side">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><Brand/></div>
        <div className="login-heading"><h2>{systemConfigured ? 'تسجيل الدخول' : 'تهيئة مدير النظام'}</h2></div>
        <form onSubmit={enter} className="stack" noValidate>
          <Field label="اسم المستخدم" required>
            <div className="login-input-wrap"><UserRound size={18}/><Input dir="ltr" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" disabled={loading} placeholder="USERNAME" /></div>
          </Field>
          <Field label="كلمة المرور" required>
            <div className="login-input-wrap"><LockKeyhole size={18}/><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={systemConfigured ? 'current-password' : 'new-password'} disabled={loading} /></div>
          </Field>
          {!systemConfigured && <Field label="تأكيد كلمة المرور" required><Input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" disabled={loading} /></Field>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <label className="remember-login"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={loading}/><span>ابقني مسجلاً</span></label>
          <Button type="submit" loading={loading} disabled={!ready}>{systemConfigured ? 'تسجيل الدخول' : 'إنشاء حساب مدير النظام'}<ArrowLeft size={17}/></Button>
        </form>
        <div className="login-form-copyright">Kal-EL VISIONS © 2026</div>
      </div>
    </section>
  </main>;
}
