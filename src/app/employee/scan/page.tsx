'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CameraOff, CheckCircle2, CircleAlert, Clock3, QrCode, RefreshCw, ScanLine } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import { useDemo, useToast } from '@/components/demo-provider';
import { Badge, Button, Card, Field, PageHeader, Select } from '@/components/ui';
import { getLatenessSeconds, getOpenWorkday, isExpected } from '@/lib/attendance';
import { DEMO_TODAY } from '@/lib/mock-data';
import { duration, time } from '@/lib/format';
import styles from '@/components/attendance/attendance.module.css';

type Outcome = { kind: 'success' | 'warning' | 'error'; title: string; message: string; timestamp?: string };
type Scenario = 'SUCCESS' | 'INVALID' | 'EXPIRED' | 'DUPLICATE' | 'CLOSED' | 'EXEMPT' | 'NETWORK';

export default function EmployeeScanPage() {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const scanLock = useRef(false);
  const cameraGeneration = useRef(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scenario, setScenario] = useState<Scenario>('SUCCESS');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const employee = data.employees.find(item => item.id === session?.employeeId);
  const day = getOpenWorkday(data.workdays);
  const attendance = data.attendance.find(item => item.employeeId === employee?.id && item.workdayId === day?.id);
  const release = () => {
    controls.current?.stop(); controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
  };
  useEffect(() => () => { cameraGeneration.current += 1; controls.current?.stop(); controls.current = null; }, []);
  const stopCamera = () => { cameraGeneration.current += 1; release(); setCameraActive(false); setStarting(false); };

  function simulatedOutcome(selected: Scenario, decoded?: string, scannedAt = 0) {
    setCameraError('');
    if (selected === 'INVALID') { setOutcome({ kind: 'error', title: 'رمز QR غير صالح', message: 'امسح رمز CenterPro المعروض على شاشة الحضور.' }); return; }
    if (selected === 'EXPIRED') { setOutcome({ kind: 'warning', title: 'انتهت صلاحية رمز QR', message: 'امسح الرمز الجديد على شاشة الحضور.' }); return; }
    if (selected === 'DUPLICATE') { setOutcome({ kind: 'warning', title: 'تم تسجيل حضورك مسبقاً اليوم', message: 'لا يمكن إنشاء تسجيل حضور إضافي لليوم نفسه.', timestamp: attendance?.checkIn || `${day?.date || DEMO_TODAY}T14:17:43+03:00` }); return; }
    if (selected === 'CLOSED') { setOutcome({ kind: 'warning', title: 'لا يوجد يوم حضور مفتوح حالياً', message: 'راجع الإدارة لفتح يوم الحضور.' }); return; }
    if (selected === 'EXEMPT') { setOutcome({ kind: 'warning', title: 'أنت مستثنى من دوام هذا اليوم', message: 'لن يُسجل حضور أو غياب أو خصم لهذا اليوم.' }); return; }
    if (selected === 'NETWORK' || !navigator.onLine) { setOutcome({ kind: 'error', title: 'تعذر الاتصال', message: 'تحقق من اتصال الإنترنت ثم أعد المحاولة. لم يُسجل حضور.' }); return; }
    if (!employee || !employee.active || session?.role !== 'EMPLOYEE') { setOutcome({ kind: 'error', title: 'تعذر تسجيل الحضور', message: 'هذه الشاشة مخصصة لحساب الموظف النشط.' }); return; }
    if (!day) { simulatedOutcome('CLOSED'); return; }
    if (decoded) {
      try {
        const payload: unknown = JSON.parse(decoded);
        if (!payload || typeof payload !== 'object' || !('preview' in payload) || payload.preview !== 'CENTERPRO_PREVIEW' || !('workdayId' in payload) || payload.workdayId !== day.id || !('expiresAt' in payload) || typeof payload.expiresAt !== 'number') { simulatedOutcome('INVALID'); return; }
        if (payload.expiresAt < scannedAt) { simulatedOutcome('EXPIRED'); return; }
      } catch { simulatedOutcome('INVALID'); return; }
    }
    if (!isExpected(employee, day) || attendance?.status === 'EXEMPT') { simulatedOutcome('EXEMPT'); return; }
    if (attendance?.status === 'PRESENT') { simulatedOutcome('DUPLICATE'); return; }
    if (data.months.some(item => item.month === day.date.slice(0, 7) && item.state !== 'OPEN')) { setOutcome({ kind: 'warning', title: 'الشهر محمي', message: 'لا يمكن تسجيل حضور ذاتي في شهر مؤرشف أو أعيد فتحه للتعديل.' }); return; }
    const timestamp = `${day.date}T14:17:43+03:00`;
    updateData(draft => {
      const existing = draft.attendance.find(item => item.employeeId === employee.id && item.workdayId === day.id);
      if (existing?.status === 'PRESENT') return;
      const next = { id: existing?.id || crypto.randomUUID(), employeeId: employee.id, workdayId: day.id, status: 'PRESENT' as const, checkIn: timestamp, latenessSeconds: getLatenessSeconds(timestamp, day.date, day.startTime), source: 'QR' as const, reason: 'محاكاة حضور في معاينة الواجهة', updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, next); else draft.attendance.push(next);
    }, { action: 'محاكاة تسجيل حضور QR', entity: 'الحضور', entityId: attendance?.id || day.id, employeeId: employee.id, newValues: { status: 'PRESENT', checkIn: timestamp, preview: true } });
    setOutcome({ kind: 'success', title: 'تم تسجيل حضورك التجريبي', message: 'تم تحديث بيانات المعاينة على هذا المتصفح فقط.', timestamp });
    toast('تمت محاكاة تسجيل الحضور بنجاح.');
  }

  async function activateCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('الكاميرا غير متاحة. افتح الموقع عبر اتصال آمن ومن متصفح يدعم الكاميرا.'); return; }
    release(); setStarting(true); setOutcome(null); setCameraError(''); scanLock.current = false;
    const generation = ++cameraGeneration.current;
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (generation !== cameraGeneration.current || !video.current) return;
      const reader = new BrowserQRCodeReader();
      const scanner = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, result => {
        if (result && !scanLock.current && generation === cameraGeneration.current) {
          scanLock.current = true; simulatedOutcome('SUCCESS', result.getText(), Date.now()); stopCamera();
        }
      });
      if (generation !== cameraGeneration.current) { scanner.stop(); return; }
      controls.current = scanner; setCameraActive(true);
    } catch (cause) {
      if (generation !== cameraGeneration.current) return;
      const name = cause instanceof Error ? cause.name : '';
      setCameraError(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'لم يُسمح بالوصول للكاميرا. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.' : name === 'NotFoundError' ? 'لم يتم العثور على كاميرا في هذا الجهاز.' : 'تعذر تشغيل الكاميرا. أغلق أي تطبيق يستخدمها ثم أعد المحاولة.');
      release(); setCameraActive(false);
    } finally { if (generation === cameraGeneration.current) setStarting(false); }
  }

  return <div className={`page-stack ${styles.scannerPage}`}>
    <PageHeader eyebrow="حضورك" title="تسجيل الحضور" description="وجّه كاميرا هاتفك نحو الرمز الموجود على شاشة الحضور في المركز." />
    <div className={styles.previewNotice}><Badge tone="brand">معاينة تجريبية</Badge><span>الكاميرا تقرأ الرمز فعلياً؛ النتيجة محاكاة محلية ولا تمثل حضوراً حقيقياً.</span></div>
    <div className={styles.scannerViewport}><video ref={video} muted autoPlay playsInline aria-label="معاينة الكاميرا لمسح رمز الحضور" className={cameraActive || starting ? styles.videoVisible : styles.videoHidden} /><div className={styles.scanTarget}>{(cameraActive || starting) && <><ScanLine size={36} /><span>{cameraActive ? 'ضع الرمز داخل الإطار' : 'جارٍ تشغيل الكاميرا'}</span></>}</div>{!cameraActive && !starting && <div className={styles.cameraPlaceholder}><QrCode size={52} /><p>الكاميرا متوقفة</p></div>}<div className={styles.cameraControls}>{cameraActive ? <Button variant="secondary" onClick={stopCamera}><CameraOff size={18} />إيقاف الكاميرا</Button> : <Button onClick={activateCamera} loading={starting}><Camera size={18} />{starting ? 'جارٍ تشغيل الكاميرا' : 'تشغيل الكاميرا'}</Button>}</div></div>
    {cameraError && <div className="notice notice-warning" role="alert"><CircleAlert size={20} /><span>{cameraError}</span></div>}
    {outcome && <section role="status" aria-live="polite" className={`${styles.scanOutcome} ${outcome.kind === 'success' ? styles.scanSuccess : styles.scanWarning}`}><div className={styles.outcomeIcon}>{outcome.kind === 'success' ? <CheckCircle2 size={32} /> : <CircleAlert size={32} />}</div><h2>{outcome.title}</h2><p>{outcome.message}</p>{outcome.timestamp && <div className={styles.scanTime}><Clock3 size={19} /><span>وقت الحضور التجريبي</span><strong dir="ltr">{time(outcome.timestamp)}</strong></div>}<Button variant="secondary" onClick={() => { setOutcome(null); scanLock.current = false; }}><RefreshCw size={16} />مسح رمز آخر</Button></section>}
    {attendance?.status === 'PRESENT' && <Card title="حضورك مسجل في المعاينة"><div className="detail-grid"><div className="detail-item"><span className="muted">وقت الحضور</span><strong dir="ltr">{attendance.checkIn ? time(attendance.checkIn) : '—'}</strong></div><div className="detail-item"><span className="muted">التأخير</span><strong>{duration(attendance.latenessSeconds)}</strong></div></div><Link className="button-link" href="/employee/attendance">عرض سجل حضوري</Link></Card>}
    <details className={styles.demoControls}><summary>تجربة حالات الواجهة</summary><p className="muted">للمراجعة دون كاميرا. النجاح يحدّث سجل موظفك التجريبي إذا كان مؤهلاً؛ بقية الخيارات تعرض رسائل فقط.</p><Field label="حالة التجربة"><Select value={scenario} onChange={event => setScenario(event.target.value as Scenario)}><option value="SUCCESS">تسجيل حضور تجريبي</option><option value="INVALID">رمز غير صالح</option><option value="EXPIRED">رمز منتهي الصلاحية</option><option value="DUPLICATE">حضور مسجل مسبقاً</option><option value="CLOSED">لا يوجد يوم مفتوح</option><option value="EXEMPT">موظف مستثنى</option><option value="NETWORK">انقطاع الاتصال</option></Select></Field><Button variant="secondary" onClick={() => { stopCamera(); simulatedOutcome(scenario); }}>تجربة الحالة</Button></details>
    <p className={styles.scannerFootnote}>لا يتطلب التسجيل مشاركة الموقع أو الاتصال بشبكة Wi-Fi محددة.</p>
  </div>;
}
