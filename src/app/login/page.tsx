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
  const { login, setupSystemAdmin, ready, session, remembered, systemConfigured, systemUsername, backend, pendingImport, connectionError, refresh } = useDemo();
  const router = useRouter();
  const { showWelcome } = useWelcome();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [usernameInput, setUsername] = useState<string | null>(null);
  const username = usernameInput ?? (ready && backend === 'local' && !systemConfigured ? systemUsername : '');
  const setup = backend === 'local' && !systemConfigured;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !session || !remembered || loading || new URLSearchParams(window.location.search).get('switch') === '1') return;
    router.replace(session.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
  }, [loading, ready, remembered, router, session]);

  async function enter(event: FormEvent) {
    event.preventDefault();
    if (!ready || loading || pendingImport) return;
    setError('');
    const cleanUsername = username.trim();
    if (!cleanUsername) { setError('أدخل اسم المستخدم.'); return; }
    if (!password) { setError('أدخل كلمة المرور.'); return; }
    if (setup) {
      if (password.length < 6) { setError('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.'); return; }
      if (password !== confirmPassword) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
    }
    setLoading(true);
    try {
      const account = setup
        ? await setupSystemAdmin(cleanUsername, password, remember)
        : await login(cleanUsername, password, remember);
      if (!account) {
        setError(setup ? 'تعذر إنشاء حساب مدير النظام. جرّب اسم مستخدم آخر.' : 'اسم المستخدم أو كلمة المرور غير صحيحة.');
        return;
      }
      await showWelcome();
      router.push(account.role === 'EMPLOYEE' ? '/employee' : '/dashboard');
    } catch (failure) {
      setError(backend === 'neon' && failure instanceof Error ? failure.message : 'تعذر تسجيل الدخول. حاول مرة أخرى.');
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
        <div className="login-heading"><h2>{pendingImport ? 'بانتظار استيراد بيانات المركز' : setup ? 'تهيئة مدير النظام' : 'تسجيل الدخول'}</h2></div>
        {connectionError && <div className="stack"><p className="field-error" role="alert">{connectionError}</p><Button variant="secondary" onClick={() => { void refresh().catch(() => {}); }}>إعادة الاتصال</Button></div>}
        {pendingImport ? <div className="notice" role="status"><span>تم ربط النظام بقاعدة البيانات. ننتظر استيراد النسخة الاحتياطية لاستعادة حسابات المركز وتفاصيله. احتفظ بملف النسخة الذي حمّلته.</span></div> : <form onSubmit={enter} className="stack" noValidate>
          <Field label="اسم المستخدم" required>
            <div className="login-input-wrap"><UserRound size={18}/><Input dir="ltr" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" disabled={loading} placeholder="USERNAME" /></div>
          </Field>
          <Field label="كلمة المرور" required>
            <div className="login-input-wrap"><LockKeyhole size={18}/><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} disabled={loading} /></div>
          </Field>
          {setup && <Field label="تأكيد كلمة المرور" required><Input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" disabled={loading} /></Field>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <label className="remember-login"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={loading}/><span>ابقني مسجلاً</span></label>
          <Button type="submit" loading={loading} disabled={!ready || Boolean(connectionError)}>{!setup ? 'تسجيل الدخول' : 'إنشاء حساب مدير النظام'}<ArrowLeft size={17}/></Button>
        </form>}
        <div className="login-form-copyright">Kal-EL VISIONS © 2026</div>
      </div>
    </section>
  </main>;
}
