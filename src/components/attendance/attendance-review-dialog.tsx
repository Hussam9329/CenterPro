import { Badge, Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { statusLabel } from '@/lib/attendance';
import { date, time } from '@/lib/format';
import type { AttendanceStatus } from '@/lib/types';
import { statusTone } from './day-helpers';
import type { AttendanceReview } from './use-attendance-review';
import styles from './attendance.module.css';

export function AttendanceReviewDialog({ review }: { review: AttendanceReview }) {
  const {
    editing, pending, remove, editStatus, checkIn, reason, error, locked, monthRecord,
    setRemove, setEditing, setEditStatus, setCheckIn, setReason, save,
  } = review;
  return (
    <Dialog open={Boolean(editing)} onClose={() => { if (!pending) { if (remove) setRemove(false); else setEditing(null); } }} title={remove ? 'إزالة تسجيل الحضور؟' : 'مراجعة سجل الحضور'} description={remove ? 'سيُحذف وقت الحضور وتعود الحالة إلى غير محسوم. يتغير سجل الحضور ويُحفظ التعديل في سجل العمليات.' : editing ? `${editing.employee.name} · ${date(editing.day.date)}` : ''}>
      {/* One persistent dialog keeps focus and stale-form conflict protection
          intact while the confirmation temporarily hides the review draft. */}
      {remove && <div className="form-actions"><Button variant="danger" loading={pending} onClick={() => save('UNRESOLVED')}>إزالة الحضور</Button><Button variant="secondary" autoFocus disabled={pending} onClick={() => setRemove(false)}>إلغاء</Button></div>}
      {editing && <form hidden={remove} style={remove ? { display: 'none' } : undefined} className="stack" onSubmit={event => { event.preventDefault(); if (!remove) save(); }}>
        <div className="detail-grid"><div className="detail-item"><span className="muted">الحالة الحالية</span><Badge tone={statusTone(editing.record.status)}>{statusLabel(editing.record.status)}</Badge></div><div className="detail-item"><span className="muted">بدء الدوام</span><b dir="ltr">{time(editing.day.startTime)}</b></div></div>
        {editing.record.reason && <div className="notice">سبب آخر تعديل: {editing.record.reason}</div>}
        {locked ? <div className="notice notice-warning">هذا السجل محمي ضمن الشهر المؤرشف. لا يمكن تعديله قبل إعادة فتح الشهر.</div> : <>
          {editing.day.state === 'CLOSED' && <div className="notice notice-warning">هذا اليوم مغلق. سيُسجل التعديل التاريخي في سجل العمليات، ويمكنك إضافة ملاحظة اختيارية.</div>}
          <label className={styles.checkChoice}><input type="checkbox" checked={editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED'} onChange={event => setEditStatus(event.target.checked ? 'EXCUSED' : 'UNRESOLVED')} />غائب</label>
          {editStatus !== 'EXCUSED' && editStatus !== 'UNEXCUSED' && <Field label="الحالة الجديدة"><Select value={editStatus} onChange={event => setEditStatus(event.target.value as AttendanceStatus)}><option value="PRESENT">حاضر</option><option value="UNRESOLVED">غير محسوم</option><option value="EXEMPT">مستثنى / لا يوجد دوام</option></Select></Field>}
          {(editStatus === 'EXCUSED' || editStatus === 'UNEXCUSED') && <fieldset className={styles.fieldset}><legend>نوع الغياب</legend><div className={styles.departmentChoices}><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'EXCUSED'} onChange={() => setEditStatus('EXCUSED')} />غياب بعذر</label><label className={styles.checkChoice}><input type="radio" name="absence-type" checked={editStatus === 'UNEXCUSED'} onChange={() => setEditStatus('UNEXCUSED')} />غياب بدون عذر</label></div></fieldset>}
          {editStatus === 'PRESENT' && <Field label="وقت الحضور" required hint="توقيت بغداد. يُعاد احتساب التأخير بالثواني دون خصم تلقائي."><Input type="time" step="1" required value={checkIn} onChange={event => setCheckIn(event.target.value)} /></Field>}
          <Field label="ملاحظة / سبب" hint="اختياري"><Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="يمكن إضافة ملاحظة توضيحية (اختياري)" /></Field>
          {monthRecord?.state === 'REOPENED' && <div className="notice notice-warning">الحفظ يعدّل سجل الحضور فقط. تطبيق التعديل على الرواتب والتقارير يتطلب إعادة الاحتساب الصريحة من صفحة الرواتب بالقواعد المؤرشفة.</div>}
          {error && <p role="alert" className="text-danger">{error}</p>}<div className="form-actions"><Button loading={pending} type="submit">حفظ التعديل</Button><Button disabled={pending} variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button></div>
          {editing.record.status === 'PRESENT' && <Button variant="danger" disabled={pending} onClick={() => setRemove(true)}>إزالة تسجيل الحضور</Button>}
        </>}
      </form>}
    </Dialog>
  );
}
