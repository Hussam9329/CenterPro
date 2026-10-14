import { useState } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { getLatenessSeconds } from '@/lib/attendance';
import { getQuickPresentTime, getQuickReviewAction, QUICK_PRESENT_NOTE } from '@/lib/attendance-quick-review';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/types';
import { canEditDay, type AttendanceRow as Row } from './day-helpers';

/** Owns the shared quick/full-review draft and its single guarded mutation. */
export function useAttendanceReview(dayId: string) {
  const { data, session, updateData } = useDemo();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const day = data.workdays.find(item => item.id === dayId);
  const monthRecord = data.months.find(item => item.month === (day?.date.slice(0, 7) || ''));
  const locked = !day || !canEditDay(data, session, day);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = useState('14:00:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [remove, setRemove] = useState(false);
  const [quickPendingEmployeeId, setQuickPendingEmployeeId] = useState<string | null>(null);

  function openEdit(row: Row, target: AttendanceStatus = row.record.status) {
    if (pending) return;
    setEditing(row);
    setEditStatus(target);
    setReason('');
    setError('');
    setRemove(false);
    setCheckIn(getQuickPresentTime(row.record, row.day));
  }

  // Both the full review dialog and the quick dropdown use exactly the same
  // server-validated mutation, audit trail, monthly protection and salary rules.
  async function persistRecord(
    row: Row,
    target: AttendanceStatus,
    entered: string,
    note: string,
    removing = false,
    quick = false,
  ): Promise<boolean> {
    return mutate(async () => {
      if (locked) throw new Error('هذا اليوم محمي ولا يمكن تعديل سجلاته.');
      if (monthRecord?.state === 'REOPENED' && !monthRecord.snapshots?.[row.employee.id]) {
        throw new Error('لا توجد نسخة راتب مؤرشفة لهذا الموظف في الشهر المحدد. راجع بيانات الشهر قبل التعديل.');
      }
      if (target === 'PRESENT' && !/^\d{2}:\d{2}(:\d{2})?$/.test(entered)) {
        throw new Error('حدد وقت الحضور بالدقائق والثواني.');
      }
      const enteredTime = entered.length === 5 ? `${entered}:00` : entered;
      if (target === 'PRESENT' && !Number.isFinite(Date.parse(`${row.day.date}T${enteredTime}+03:00`))) {
        throw new Error('حدد وقت حضور صالحاً.');
      }
      const timestamp = target === 'PRESENT' ? new Date(`${row.day.date}T${enteredTime}+03:00`).toISOString() : null;
      const changed: AttendanceRecord = {
        id: row.record.id || crypto.randomUUID(),
        employeeId: row.employee.id,
        workdayId: row.day.id,
        status: target,
        checkIn: timestamp,
        latenessSeconds: timestamp ? getLatenessSeconds(timestamp, row.day.date, row.day.startTime) : 0,
        source: target === 'PRESENT' ? 'MANUAL' : null,
        reason: note.trim(),
        updatedAt: new Date().toISOString(),
      };
      await updateData(draft => {
        const index = draft.attendance.findIndex(record => record.workdayId === changed.workdayId && record.employeeId === changed.employeeId);
        if (index >= 0) draft.attendance[index] = changed;
        else draft.attendance.push(changed);
        const storedDay = draft.workdays.find(item => item.id === changed.workdayId);
        if (storedDay) {
          if (target === 'EXEMPT') storedDay.overrides[changed.employeeId] = 'EXCLUDE';
          else if (storedDay.overrides[changed.employeeId] === 'EXCLUDE') storedDay.overrides[changed.employeeId] = 'INCLUDE';
        }
      }, {
        action: removing ? 'إزالة تسجيل حضور' : quick ? 'تغيير سريع لحالة الحضور' : 'تعديل حالة الحضور',
        entity: 'الحضور',
        entityId: changed.id,
        employeeId: changed.employeeId,
        oldValues: { status: row.record.status, checkIn: row.record.checkIn, latenessSeconds: row.record.latenessSeconds },
        newValues: { status: changed.status, checkIn: changed.checkIn, latenessSeconds: changed.latenessSeconds, reason: changed.reason },
      });
    }, quick ? toast : setError);
  }

  async function save(target: AttendanceStatus = editStatus) {
    if (!editing) return;
    if (!await persistRecord(editing, target, checkIn, reason, remove)) {
      // Reveal the retained review draft and its inline error if a failed
      // removal was covered by the confirmation dialog.
      if (remove) setRemove(false);
      return;
    }
    setEditing(null);
    setRemove(false);
    toast('تم تحديث سجل الحضور.');
  }

  async function quickReview(row: Row, target: AttendanceStatus) {
    if (locked || pending) return;
    const action = getQuickReviewAction(row.record.status, target);
    if (action === 'NO_CHANGE') return;
    if (action === 'DETAILS') {
      // Absences and exemptions need the existing review dialog for their
      // classification, notes and optional reasons. Nothing is saved yet.
      openEdit(row, target);
      return;
    }
    if (action === 'CONFIRM_REMOVAL') {
      openEdit(row);
      setRemove(true);
      return;
    }
    setQuickPendingEmployeeId(row.employee.id);
    try {
      const firstManualCheckIn = target === 'PRESENT' && !row.record.checkIn;
      const saved = await persistRecord(
        row, target, getQuickPresentTime(row.record, row.day),
        firstManualCheckIn ? QUICK_PRESENT_NOTE : '', false, true,
      );
      if (saved) toast(firstManualCheckIn
        ? 'تم تسجيل الحضور بوقت بدء الدوام. يمكن تغيير الوقت من «مراجعة».'
        : 'تم تحديث حالة الحضور.');
    } finally {
      setQuickPendingEmployeeId(null);
    }
  }

  return {
    day, monthRecord, locked, pending, editing, editStatus, checkIn, reason,
    error, remove, quickPendingEmployeeId, openEdit, quickReview, save,
    setEditing, setEditStatus, setCheckIn, setReason, setRemove,
  };
}

export type AttendanceReview = ReturnType<typeof useAttendanceReview>;
