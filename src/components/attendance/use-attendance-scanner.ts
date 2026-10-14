import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { useDemo, useToast } from '@/components/demo-provider';
import { getLatenessSeconds, getOpenWorkday, isExpected } from '@/lib/attendance';
import { apiRequest } from '@/lib/api-client';

type Outcome = { kind: 'success' | 'warning' | 'error'; title: string; message: string; timestamp?: string };
export type Scenario = 'SUCCESS' | 'INVALID' | 'EXPIRED' | 'DUPLICATE' | 'CLOSED' | 'EXEMPT' | 'NETWORK';

/** Keeps camera cancellation, single-scan locking and check-in transport together. */
export function useAttendanceScanner() {
  const { data, session, updateData, backend, today, refresh } = useDemo();
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

  async function simulatedOutcome(selected: Scenario, decoded?: string, scannedAt = 0) {
    setCameraError('');
    if (selected === 'INVALID') { setOutcome({ kind: 'error', title: 'رمز QR غير صالح', message: 'امسح رمز CenterPro المعروض على شاشة الحضور.' }); return; }
    if (selected === 'EXPIRED') { setOutcome({ kind: 'warning', title: 'انتهت صلاحية رمز QR', message: 'امسح الرمز الجديد على شاشة الحضور.' }); return; }
    if (selected === 'DUPLICATE') { setOutcome({ kind: 'warning', title: 'تم تسجيل حضورك مسبقاً اليوم', message: 'لا يمكن إنشاء تسجيل حضور إضافي لليوم نفسه.', timestamp: attendance?.checkIn || `${day?.date || today}T14:17:43+03:00` }); return; }
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
    await updateData(draft => {
      const existing = draft.attendance.find(item => item.employeeId === employee.id && item.workdayId === day.id);
      if (existing?.status === 'PRESENT') return;
      const next = { id: existing?.id || crypto.randomUUID(), employeeId: employee.id, workdayId: day.id, status: 'PRESENT' as const, checkIn: timestamp, latenessSeconds: getLatenessSeconds(timestamp, day.date, day.startTime), source: 'QR' as const, reason: 'محاكاة حضور في معاينة الواجهة', updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, next); else draft.attendance.push(next);
    }, { action: 'محاكاة تسجيل حضور QR', entity: 'الحضور', entityId: attendance?.id || day.id, employeeId: employee.id, newValues: { status: 'PRESENT', checkIn: timestamp, preview: true } });
    setOutcome({ kind: 'success', title: 'تم تسجيل حضورك التجريبي', message: 'تم تحديث بيانات المعاينة على هذا المتصفح فقط.', timestamp });
    toast('تمت محاكاة تسجيل الحضور بنجاح.');
  }

  async function scan(decoded: string, scannedAt: number) {
    if (backend !== 'neon') { await simulatedOutcome('SUCCESS', decoded, scannedAt); return; }
    setOutcome(null);
    try {
      const result = await apiRequest<{ checkIn: string; duplicate?: boolean }>('/api/attendance/check-in', { token: decoded });
      setOutcome({ kind: result.duplicate ? 'warning' : 'success', title: result.duplicate ? 'تم تسجيل حضورك مسبقاً اليوم' : 'تم تسجيل حضورك', message: 'وقت الحضور محفوظ في قاعدة البيانات بتوقيت بغداد.', timestamp: result.checkIn });
      await refresh();
    } catch (cause) {
      setOutcome({ kind: 'error', title: 'تعذر تسجيل الحضور', message: cause instanceof Error ? cause.message : 'تحقق من الاتصال ثم امسح الرمز مرة أخرى.' });
    }
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
          scanLock.current = true; void scan(result.getText(), Date.now()); stopCamera();
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

  function resetOutcome() {
    setOutcome(null);
    scanLock.current = false;
  }

  return {
    video, cameraActive, starting, cameraError, scenario, setScenario, outcome,
    attendance, backend, stopCamera, activateCamera, simulatedOutcome, resetOutcome,
  };
}
