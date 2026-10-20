'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Camera, CameraOff, Check, CheckCircle2, CircleAlert, Clock3, House, QrCode, RefreshCw, ScanLine } from 'lucide-react';
import { Badge, Button, Card, Field, PageHeader, Select } from '@/components/ui';
import { duration, time } from '@/lib/format';
import { useAttendanceScanner, type Scenario } from '@/components/attendance/use-attendance-scanner';
import styles from '@/components/attendance/attendance.module.css';

export default function EmployeeScanPage() {
  const {
    video, cameraActive, starting, cameraError, scenario, setScenario, outcome,
    attendance, backend, stopCamera, activateCamera, simulatedOutcome, resetOutcome,
  } = useAttendanceScanner();
  const succeeded = outcome?.kind === 'success';
  // A confirmed check-in replaces the camera with the success screen; release the camera too.
  useEffect(() => { if (succeeded && cameraActive) stopCamera(); }, [succeeded, cameraActive, stopCamera]);
  useEffect(() => { if (succeeded) window.scrollTo({ top: 0, behavior: 'smooth' }); }, [succeeded]);

  return <div className={`page-stack ${styles.scannerPage}`}>
    <PageHeader title="تسجيل الحضور" />
    {backend !== 'neon' && <div className={styles.previewNotice}><Badge tone="brand">معاينة تجريبية</Badge><span>الكاميرا تقرأ الرمز فعلياً؛ النتيجة محاكاة محلية ولا تمثل حضوراً حقيقياً.</span></div>}
    <div className={styles.scannerViewport} hidden={succeeded}><video ref={video} muted autoPlay playsInline aria-label="معاينة الكاميرا لمسح رمز الحضور" className={cameraActive || starting ? styles.videoVisible : styles.videoHidden} /><div className={styles.scanTarget}>{(cameraActive || starting) && <><ScanLine size={36} /><span>{cameraActive ? 'ضع الرمز داخل الإطار' : 'جارٍ تشغيل الكاميرا'}</span></>}</div>{!cameraActive && !starting && <div className={styles.cameraPlaceholder}><QrCode size={52} /><p>الكاميرا متوقفة</p></div>}<div className={styles.cameraControls}>{cameraActive ? <Button variant="secondary" onClick={stopCamera}><CameraOff size={18} />إيقاف الكاميرا</Button> : <Button onClick={activateCamera} loading={starting}><Camera size={18} />{starting ? 'جارٍ تشغيل الكاميرا' : 'تشغيل الكاميرا'}</Button>}</div></div>
    {cameraError && <div className="notice notice-warning" role="alert"><CircleAlert size={20} /><span>{cameraError}</span></div>}
    {succeeded && outcome && <section role="status" aria-live="polite" className={styles.successScreen}><div className={styles.successMark} aria-hidden="true"><Check size={58} strokeWidth={3} /></div><h2>{outcome.title}</h2><p>{outcome.message}</p>{outcome.timestamp && <div className={styles.successTime}><Clock3 size={18} /><span>{backend === 'neon' ? 'وقت الحضور' : 'وقت الحضور التجريبي'}</span><strong dir="ltr">{time(outcome.timestamp)}</strong></div>}<div className={styles.successActions}><Link className="btn btn-primary" href="/employee"><House size={17} />العودة للرئيسية</Link><Button variant="secondary" onClick={resetOutcome}><RefreshCw size={16} />مسح رمز آخر</Button></div></section>}
    {outcome && !succeeded && <section role="status" aria-live="polite" className={`${styles.scanOutcome} ${outcome.kind === 'success' ? styles.scanSuccess : styles.scanWarning}`}><div className={styles.outcomeIcon}>{outcome.kind === 'success' ? <CheckCircle2 size={32} /> : <CircleAlert size={32} />}</div><h2>{outcome.title}</h2><p>{outcome.message}</p>{outcome.timestamp && <div className={styles.scanTime}><Clock3 size={19} /><span>{backend === 'neon' ? 'وقت الحضور' : 'وقت الحضور التجريبي'}</span><strong dir="ltr">{time(outcome.timestamp)}</strong></div>}<Button variant="secondary" onClick={resetOutcome}><RefreshCw size={16} />مسح رمز آخر</Button></section>}
    {!succeeded && attendance?.status === 'PRESENT' && <Card title={backend === 'neon' ? 'حضورك مسجل' : 'حضورك مسجل في المعاينة'}><div className="detail-grid"><div className="detail-item"><span className="muted">وقت الحضور</span><strong dir="ltr">{attendance.checkIn ? time(attendance.checkIn) : '—'}</strong></div><div className="detail-item"><span className="muted">التأخير</span><strong>{duration(attendance.latenessSeconds)}</strong></div></div><Link className="button-link" href="/employee/attendance">عرض سجل حضوري</Link></Card>}
    {backend !== 'neon' && <details className={styles.demoControls}><summary>تجربة حالات الواجهة</summary><p className="muted">للمراجعة دون كاميرا. النجاح يحدّث سجل موظفك التجريبي إذا كان مؤهلاً؛ بقية الخيارات تعرض رسائل فقط.</p><Field label="حالة التجربة"><Select value={scenario} onChange={event => setScenario(event.target.value as Scenario)}><option value="SUCCESS">تسجيل حضور تجريبي</option><option value="INVALID">رمز غير صالح</option><option value="EXPIRED">رمز منتهي الصلاحية</option><option value="DUPLICATE">حضور مسجل مسبقاً</option><option value="CLOSED">لا يوجد يوم مفتوح</option><option value="EXEMPT">موظف مستثنى</option><option value="NETWORK">انقطاع الاتصال</option></Select></Field><Button variant="secondary" onClick={() => { stopCamera(); simulatedOutcome(scenario); }}>تجربة الحالة</Button></details>}
    <p className={styles.scannerFootnote}>لا يتطلب التسجيل مشاركة الموقع أو الاتصال بشبكة Wi-Fi محددة.</p>
  </div>;
}
