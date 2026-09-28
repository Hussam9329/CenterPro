'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Expand, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useDemo } from '@/components/demo-provider';
import { Brand } from '@/components/brand';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { date, time } from '@/lib/format';
import { getOpenWorkday } from '@/lib/attendance';
import { DEMO_TODAY } from '@/lib/mock-data';
import styles from '@/components/attendance/attendance.module.css';

export default function AttendanceDisplay() {
  const { data, session, ready } = useDemo();
  const interval = Math.min(60, Math.max(30, data.settings.qrInterval || 45));
  const [clock, setClock] = useState({ now: 0, issuedAt: 0 });
  const [fullscreenError, setFullscreenError] = useState('');
  const day = getOpenWorkday(data.workdays);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(previous => ({ now, issuedAt: !previous.issuedAt || now - previous.issuedAt >= interval * 1000 ? now : previous.issuedAt }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [interval]);
  const remaining = Math.max(0, interval - Math.floor((clock.now - clock.issuedAt) / 1000));
  const payload = JSON.stringify({ preview: 'CENTERPRO_PREVIEW', workdayId: day?.id, issuedAt: clock.issuedAt, expiresAt: clock.issuedAt + interval * 1000, nonce: `preview-${clock.issuedAt}` });
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else setFullscreenError('لتوسيع العرض على iPad، أضف CenterPro إلى الشاشة الرئيسية وافتحه منها.'); }
    catch { setFullscreenError('تعذر تفعيل ملء الشاشة في هذا المتصفح. يمكنك إضافة التطبيق للشاشة الرئيسية.'); }
  }
  if (!ready) return <main className={styles.display}><Skeleton /></main>;
  if (!session || session.role === 'EMPLOYEE') return <main className={styles.display}><EmptyState title="شاشة الحضور مخصصة للإدارة" description="ادخل بحساب الإدارة التجريبي لعرض الرمز." action={<Link className="button-link" href="/login">تسجيل الدخول</Link>} /></main>;
  return <main className={styles.display}>
    <header className={styles.displayHeader}><Link className="button-link" href="/attendance"><ArrowRight size={17} />الحضور</Link><Brand /><Button variant="secondary" onClick={fullscreen}><Expand size={17} /><span>ملء الشاشة</span></Button></header>
    <div className={styles.displayBody}><Badge tone="brand">معاينة الواجهة · حضور تجريبي</Badge><h1>تسجيل الحضور</h1><p className={styles.displaySubtitle}>افتح حساب CenterPro من هاتفك، ثم امسح الرمز.</p>
      {day ? <><div className={styles.displayDetails}><span>{date(day.date)}</span><span>بداية الدوام <b dir="ltr">{time(day.startTime)}</b></span></div><div className={styles.qrFrame}>{clock.issuedAt ? <QRCodeSVG value={payload} size={360} level="M" marginSize={3} title="رمز تسجيل حضور تجريبي" /> : <div className={styles.qrLoading}><QrCode size={72} /><span>جارٍ تجهيز الرمز التجريبي</span></div>}</div><div className={styles.refreshIndicator}><span>يتجدد الرمز خلال <b>{remaining}</b> ثانية</span><progress aria-label="الوقت المتبقي للرمز" max={interval} value={remaining} /></div><div className={styles.displayNote}><ShieldCheck size={18} /><span>رمز معاينة يتجدد تلقائياً. لا يسجل حضوراً حقيقياً.</span></div></> : <div className={styles.noWorkday}><EmptyState title="لا يوجد يوم حضور مفتوح حالياً." description="افتح يوم حضور من قسم الحضور لعرض رمز المعاينة." action={<Link className="button-link" href="/attendance">الحضور</Link>} /></div>}
      {fullscreenError && <p role="status" className="notice">{fullscreenError}</p>}
    </div><footer className={styles.displayFooter}>{data.settings.centerName} <span>توقيت بغداد · {date(day?.date || DEMO_TODAY)} تاريخ العرض التجريبي</span></footer>
  </main>;
}
