'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Expand, LogOut, QrCode, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useDemo } from '@/components/demo-provider';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { date, time } from '@/lib/format';
import { getOpenWorkday } from '@/lib/attendance';
import { useAttendanceQr } from '@/components/attendance/use-attendance-qr';
import styles from '@/components/attendance/attendance.module.css';

export default function AttendanceDisplay() {
  const { data, session, ready, backend, today, logout, connectionError, refresh, notify } = useDemo();
  const router = useRouter();
  const interval = Math.min(60, Math.max(30, data.settings.qrInterval || 45));
  const [fullscreenError, setFullscreenError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const day = getOpenWorkday(data.workdays);
  const { clock, qr, qrError, remaining, payload } = useAttendanceQr({ interval, day, backend, ready, session });
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else setFullscreenError('لتوسيع العرض على iPad، أضف CenterPro إلى الشاشة الرئيسية وافتحه منها.'); }
    catch { setFullscreenError('تعذر تفعيل ملء الشاشة في هذا المتصفح. يمكنك إضافة التطبيق للشاشة الرئيسية.'); }
  }
  if (!ready && connectionError) return <main className={styles.display}><Brand/><div className={styles.displayBody}><p role="alert">{connectionError}</p><Button onClick={() => { void refresh().catch(() => {}); }}>إعادة الاتصال</Button></div></main>;
  if (!ready) return <main className={styles.display}><Skeleton /></main>;
  if (!session || session.role === 'EMPLOYEE') return <main className={styles.display}><EmptyState title="شاشة الحضور غير متاحة لهذا الحساب" action={<Link className="button-link" href="/login">تسجيل الدخول</Link>} /></main>;
  const qrOnly = session.role === 'QR_DISPLAY';
  async function exitDisplay() {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); router.replace('/login'); }
    catch (error) { notify(error instanceof Error ? error.message : 'تعذر تسجيل الخروج. حاول مرة أخرى.'); }
    finally { setLoggingOut(false); }
  }
  return <main className={styles.display}>
    <header className={styles.displayHeader}>{qrOnly ? <button className="icon-button" onClick={() => { void exitDisplay(); }} disabled={loggingOut} aria-label="تسجيل الخروج"><LogOut size={18}/></button> : <Link className="button-link" href="/attendance"><ArrowRight size={17} />الحضور</Link>}<Brand /><Button variant="secondary" aria-label="ملء الشاشة" onClick={fullscreen}><Expand size={17} /><span>ملء الشاشة</span></Button></header>
    <div className={styles.displayBody}><Badge tone="brand">{backend === 'neon' ? 'تسجيل الحضور' : 'معاينة الواجهة · حضور تجريبي'}</Badge><h1>تسجيل الحضور</h1><p className={styles.displaySubtitle}>افتح حساب CenterPro من هاتفك، ثم امسح الرمز.</p>
      {day ? <><div className={styles.displayDetails}><span>{date(day.date)}</span><span>بداية الدوام <b dir="ltr">{time(day.startTime)}</b></span></div><div className={styles.qrFrame}>{(backend === 'neon' ? qr && qr.workdayId === day.id && remaining > 0 : clock.issuedAt) ? <QRCodeSVG value={payload} size={360} level="M" marginSize={3} title={backend === 'neon' ? 'رمز تسجيل الحضور' : 'رمز تسجيل حضور تجريبي'} /> : <div className={styles.qrLoading}><QrCode size={72} /><span>{backend === 'neon' ? 'جارٍ تجهيز رمز الحضور' : 'جارٍ تجهيز الرمز التجريبي'}</span></div>}</div><div className={styles.refreshIndicator}><span>يتجدد الرمز خلال <b>{remaining}</b> ثانية</span><progress aria-label="الوقت المتبقي للرمز" max={interval} value={remaining} /></div><div className={styles.displayNote}><ShieldCheck size={18} /><span>{backend === 'neon' ? 'رمز مؤقت يتجدد تلقائياً. يسجّل كل موظف حضوره من حسابه.' : 'رمز معاينة يتجدد تلقائياً. لا يسجل حضوراً حقيقياً.'}</span></div></> : <div className={styles.noWorkday}>{qrOnly
        ? <EmptyState title="لا يوجد يوم حضور مفتوح حالياً." />
        : <EmptyState title="لا يوجد يوم حضور مفتوح حالياً." description="افتح يوم حضور من قسم الحضور لعرض الرمز." action={<Link className="button-link" href="/attendance">الحضور</Link>} />}
      </div>}
      {qrError && <p role="alert" className="notice">{qrError}</p>}
      {connectionError && <div role="alert" className="notice"><span>{connectionError}</span><Button variant="secondary" onClick={() => { void refresh().catch(() => {}); }}>إعادة الاتصال</Button></div>}
      {fullscreenError && <p role="status" className="notice">{fullscreenError}</p>}
    </div><footer className={styles.displayFooter}>{data.settings.centerName} <span>توقيت بغداد · {date(day?.date || today)}{backend !== 'neon' && ' تاريخ العرض التجريبي'}</span></footer>
  </main>;
}
