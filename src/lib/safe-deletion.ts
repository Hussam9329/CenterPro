/** Shared preview/server deletion planner. No browser-provided cascade or totals are trusted.
 * An explicit delete may remove dependent live records, never the audit trail. */
import { isAuditEmployee } from './evaluations';
import { hasEmployeePermission } from './permissions';
import type { DemoData, DemoSession } from './types';
import type { MutableCollection } from './server-contract';

export type DeletionCollection = MutableCollection;
export interface DeletionIntent {
  collection: DeletionCollection;
  id: string;
  reason: string;
  confirmation: 'حذف';
}
export interface DeletionPlan {
  collection: DeletionCollection;
  id: string;
  removals: Partial<Record<DeletionCollection, string[]>>;
  affectedOverrides: number;
  blockers: string[];
  warnings: string[];
  total: number;
  requiresTyping: boolean;
}

export const deletionLabels: Record<DeletionCollection, string> = {
  employees: 'موظف', departments: 'قسم', workdays: 'يوم حضور', attendance: 'سجل حضور',
  deductions: 'خصم', bonuses: 'مكافأة', months: 'أرشيف رواتب', payments: 'عملية صرف راتب',
  evaluationSeasons: 'موسم تقييم', evaluationCycles: 'دورة تقييم',
  evaluationExams: 'امتحان', examEvaluations: 'تقييم مصحح',
};

export function authorizeDeletion(data: DemoData, session: DemoSession | null, collection: DeletionCollection, id: string): void {
  if (!session || session.role === 'QR_DISPLAY') throw new Error('ليس لديك صلاحية الحذف.');
  if (session.role === 'SUPER_ADMIN') {
    if (collection === 'employees' && session.employeeId === id) throw new Error('لا يمكنك حذف حسابك أثناء استخدامه.');
    return;
  }
  if (session.role === 'ADMIN') {
    if (collection === 'deductions' || collection === 'bonuses') {
      const date = data[collection].find(item => item.id === id)?.date;
      if (date && data.months.some(item => item.month === date.slice(0, 7) && item.state === 'REOPENED')) {
        throw new Error('حذف التعديلات المالية لشهر معاد فتحه متاح للمشرف العام فقط.');
      }
    }
    if (collection === 'departments' || collection === 'months') throw new Error('حذف الأقسام وأرشيف الرواتب للمشرف العام فقط.');
    if (collection === 'employees') {
      const target = data.employees.find(item => item.id === id);
      if (!target || target.role !== 'EMPLOYEE' || target.id === session.employeeId) throw new Error('حذف حسابات الإدارة للمشرف العام فقط.');
    }
    return;
  }
  const employee = data.employees.find(item => item.id === session.employeeId && item.active && item.role === 'EMPLOYEE');
  if (collection === 'deductions' || collection === 'bonuses') {
    const feature = collection === 'deductions' ? 'DEDUCTIONS' : 'BONUSES';
    if (!hasEmployeePermission(employee, feature, 'delete')) throw new Error('ليس لديك صلاحية حذف هذا السجل.');
    const row = data[collection].find(item => item.id === id);
    if (!row) throw new Error('السجل غير موجود.');
    const state = data.months.find(item => item.month === row.date.slice(0, 7))?.state;
    if (state !== undefined && state !== 'OPEN') throw new Error('لا يمكن حذف سجل مالي من شهر مؤرشف أو معاد فتحه من حساب موظف.');
    return;
  }
  if (collection !== 'examEvaluations') throw new Error('هذا الحذف متاح للإدارة فقط.');
  if (!employee || !isAuditEmployee(data, employee) || !hasEmployeePermission(employee, 'AUDIT_REVIEW', 'delete')) throw new Error('لا يملك الحساب صلاحية حذف بيانات التدقيق.');
  const entry = data.examEvaluations.find(item => item.id === id);
  const exam = data.evaluationExams.find(item => item.id === entry?.examId);
  const cycle = data.evaluationCycles.find(item => item.id === exam?.cycleId);
  if (!entry || exam?.state !== 'OPEN' || cycle?.state !== 'OPEN' ||
    (cycle.seasonId && data.evaluationSeasons.find(item => item.id === cycle.seasonId)?.state !== 'OPEN')) {
    throw new Error('الحذف متاح ضمن امتحان ودورة مفتوحين فقط.');
  }
}

/** Read-only plan. Blocked operations are shown with a specific explanation. */
export function getDeletionPlan(data: DemoData, collection: DeletionCollection, id: string): DeletionPlan {
  const plan: DeletionPlan = { collection, id, removals: {}, affectedOverrides: 0, blockers: [], warnings: [], total: 0,
    requiresTyping: !['attendance', 'deductions', 'bonuses', 'examEvaluations'].includes(collection) };
  const target = data[collection].find(item => item.id === id);
  if (!target) { plan.blockers.push('هذا السجل لم يعد موجوداً. حدّث الصفحة.'); return plan; }
  const add = (key: DeletionCollection, ids: string[]) => {
    if (!ids.length) return;
    plan.removals[key] = [...new Set([...(plan.removals[key] ?? []), ...ids])];
  };
  add(collection, [id]);
  const blockMonth = (month: string, operation: string) => {
    const state = data.months.find(item => item.month === month)?.state;
    if (state && state !== 'OPEN') plan.blockers.push(`لا يمكن ${operation}: رواتب شهر ${month} مؤرشفة أو معاد فتحها. راجع أرشيف الرواتب أولاً.`);
    if (data.payments.some(item => item.month === month)) plan.blockers.push(`لا يمكن ${operation}: توجد عمليات صرف مسجلة لشهر ${month}.`);
  };
  const removeExams = (examIds: string[]) => {
    add('evaluationExams', examIds);
    add('examEvaluations', data.examEvaluations.filter(item => examIds.includes(item.examId)).map(item => item.id));
  };
  const removeCycles = (cycleIds: string[]) => {
    add('evaluationCycles', cycleIds);
    removeExams(data.evaluationExams.filter(item => cycleIds.includes(item.cycleId)).map(item => item.id));
  };
  switch (collection) {
    case 'employees': {
      const employee = data.employees.find(item => item.id === id)!;
      if (employee.role === 'SUPER_ADMIN' && data.employees.filter(item => item.role === 'SUPER_ADMIN' && item.id !== id).length === 0) plan.blockers.push('لا يمكن حذف آخر حساب مشرف عام.');
      if (data.payments.some(item => item.employeeId === id)) plan.blockers.push('للموظف عمليات صرف رواتب؛ لا تحذف هويته مع وجود سجل صرف مالي.');
      const paidMonths = new Set(data.payments.map(item => item.month));
      const paidDays = new Set(data.workdays.filter(day => paidMonths.has(day.date.slice(0, 7))).map(day => day.id));
      if (data.attendance.some(item => item.employeeId === id && paidDays.has(item.workdayId)) ||
        data.workdays.some(day => paidDays.has(day.id) && Object.hasOwn(day.overrides, id))) {
        plan.blockers.push('للموظف حضور أو استثناءات في شهر له عمليات صرف؛ لا يمكن تجاوز حماية الحضور بحذف الموظف.');
      }
      if (data.months.some(item => item.state !== 'OPEN' && (
        (item.snapshots && Object.hasOwn(item.snapshots, id)) ||
        item.sourceSnapshot?.employees?.some(employee => employee.id === id) ||
        data.attendance.some(record => record.employeeId === id && data.workdays.some(day => day.id === record.workdayId && day.date.startsWith(item.month))) ||
        data.deductions.some(record => record.employeeId === id && record.date.startsWith(item.month)) ||
        data.bonuses.some(record => record.employeeId === id && record.date.startsWith(item.month))
      ))) plan.blockers.push('للموظف بيانات مرتبطة بكشف رواتب مؤرشف أو معاد فتحه؛ لا يمكن حذف هويته وتاريخه المالي.');
      if (data.examEvaluations.some(item => item.employeeId === id && data.evaluationCycles.find(cycle => cycle.id === data.evaluationExams.find(exam => exam.id === item.examId)?.cycleId)?.state === 'ARCHIVED')) {
        plan.blockers.push('الموظف مرتبط بتدقيق دورة مؤرشفة. لا يمكن حذف سجل التدقيق مع بقاء أرشيف الدورة.');
      }
      const archivedDays = data.workdays.filter(day => Boolean(day.overrides[id]) && data.months.some(month => month.month === day.date.slice(0, 7) && month.state !== 'OPEN'));
      if (archivedDays.length) plan.blockers.push('للموظف استثناءات حضور في شهور مؤرشفة؛ لا يمكن تعديل تاريخها بالحذف.');
      add('attendance', data.attendance.filter(item => item.employeeId === id).map(item => item.id));
      add('deductions', data.deductions.filter(item => item.employeeId === id).map(item => item.id));
      add('bonuses', data.bonuses.filter(item => item.employeeId === id).map(item => item.id));
      add('examEvaluations', data.examEvaluations.filter(item => item.employeeId === id).map(item => item.id));
      plan.affectedOverrides = data.workdays.filter(day => Object.hasOwn(day.overrides, id)).length;
      plan.warnings.push('سيُلغى حساب دخول الموظف، وتُنهى جلساته المفتوحة.');
      break;
    }
    case 'departments': {
      const employees = data.employees.filter(item => item.departmentId === id).length;
      const days = data.workdays.filter(day => day.departmentIds.includes(id)).length;
      if (employees) plan.blockers.push(`القسم مرتبط بـ ${employees} موظف. انقل الموظفين أو احذفهم أولاً.`);
      if (days) plan.blockers.push(`القسم مستخدم في ${days} يوم حضور. عدّل الأيام أو احذفها أولاً.`);
      break;
    }
    case 'workdays': {
      const day = data.workdays.find(item => item.id === id)!;
      blockMonth(day.date.slice(0, 7), 'حذف يوم الحضور');
      add('attendance', data.attendance.filter(item => item.workdayId === id).map(item => item.id));
      plan.warnings.push('سيُحذف اليوم مع حالات حضور موظفيه، ويُعاد احتساب رواتب الشهر المفتوح.');
      break;
    }
    case 'attendance': {
      const record = data.attendance.find(item => item.id === id)!;
      const day = data.workdays.find(item => item.id === record.workdayId);
      if (!day) plan.blockers.push('يوم الحضور المرتبط بهذا السجل غير موجود.');
      else blockMonth(day.date.slice(0, 7), 'حذف سجل الحضور');
      plan.warnings.push('إذا كان الموظف مطلوباً بهذا اليوم، ستظهر حالته «غير محسوم» لحين تسجيلها من جديد.');
      break;
    }
    case 'deductions':
    case 'bonuses': {
      const row = data[collection].find(item => item.id === id)!;
      const state = data.months.find(item => item.month === row.date.slice(0, 7))?.state;
      if (state === 'ARCHIVED') plan.blockers.push('الشهر مؤرشف؛ افتحه للمراجعة من الرواتب أولاً.');
      plan.warnings.push('سيُعاد احتساب الراتب الحي. الشهر المعاد فتحه يحتاج إعادة احتساب صريحة.');
      break;
    }
    case 'months': {
      const row = data.months.find(item => item.id === id)!;
      if (data.payments.some(item => item.month === row.month)) plan.blockers.push('لا يمكن حذف أرشيف شهر لديه عمليات صرف. احذف عمليات الصرف بتأكيد منفصل أولاً.');
      plan.warnings.push('ستُحذف نسخة راتب الشهر المحفوظة. هذه العملية لا تحذف أيام الحضور أو الخصومات الأصلية.');
      break;
    }
    case 'payments':
      plan.warnings.push('هذه العملية تلغي قيد الصرف من حساب الراتب، لكنها لا تلغي أي تحويل مالي فعلي.');
      break;
    case 'evaluationSeasons':
      removeCycles(data.evaluationCycles.filter(item => item.seasonId === id).map(item => item.id));
      plan.warnings.push('سيُحذف الموسم بما فيه الدورات والامتحانات وبيانات التدقيق التابعة، حتى لو كانت مؤرشفة.');
      break;
    case 'evaluationCycles': {
      const cycle = data.evaluationCycles.find(item => item.id === id)!;
      if (data.evaluationSeasons.find(item => item.id === cycle.seasonId)?.state === 'ARCHIVED') plan.blockers.push('الدورة تتبع موسماً مؤرشفاً. للحفاظ على تطابق أرشيف الموسم، احذف الموسم بالكامل إذا لزم الأمر.');
      removeExams(data.evaluationExams.filter(item => item.cycleId === id).map(item => item.id));
      plan.warnings.push('سيُحذف أرشيف الدورة وامتحاناتها وتقييماتها، ويُعاد ترتيب الموسم المفتوح.');
      break;
    }
    case 'evaluationExams': {
      const exam = data.evaluationExams.find(item => item.id === id)!;
      if (data.evaluationCycles.find(item => item.id === exam.cycleId)?.state === 'ARCHIVED') plan.blockers.push('الامتحان ضمن دورة مؤرشفة؛ احذف الدورة كاملة بدل تغيير أرشيفها الجزئي.');
      add('examEvaluations', data.examEvaluations.filter(item => item.examId === id).map(item => item.id));
      plan.warnings.push('ستُحذف بيانات تدقيق الامتحان وتُحدّث نقاط الدورة والموسم المفتوحين.');
      break;
    }
    case 'examEvaluations': {
      const evaluation = data.examEvaluations.find(item => item.id === id)!;
      const exam = data.evaluationExams.find(item => item.id === evaluation.examId);
      const cycle = data.evaluationCycles.find(item => item.id === exam?.cycleId);
      if (exam?.state !== 'OPEN') plan.blockers.push('هذا التقييم يتبع امتحاناً مغلقاً؛ لحماية النتائج المعلنة احذف الامتحان بالكامل بتأكيد منفصل إذا لزم الأمر.');
      if (cycle?.state === 'ARCHIVED') plan.blockers.push('تقييم دورة مؤرشفة محفوظ ضمن نتائجها. احذف الدورة كاملة إذا لزم الأمر.');
      plan.warnings.push('سيُطرح أثر هذا التقييم من نقاط الدورة والموسم المفتوحين.');
      break;
    }
  }
  plan.total = Object.values(plan.removals).reduce((sum, values) => sum + (values?.length ?? 0), 0);
  plan.requiresTyping ||= plan.total > 1;
  return plan;
}

/** Mutates only the selected records and their explicitly documented dependencies. */
export function applyDeletionPlan(draft: DemoData, plan: DeletionPlan): void {
  if (plan.blockers.length) throw new Error(plan.blockers[0]);
  for (const [key, ids] of Object.entries(plan.removals) as [DeletionCollection, string[]][]) {
    const selected = new Set(ids);
    // The union-safe assignment is checked by the static DeletionCollection type.
    const records = draft[key] as Array<{ id: string }>;
    (draft as unknown as Record<string, unknown>)[key] = records.filter(row => !selected.has(row.id));
  }
  if (plan.collection === 'employees') {
    for (const day of draft.workdays) delete day.overrides[plan.id];
  }
  delete draft.serverEvaluation;
}
