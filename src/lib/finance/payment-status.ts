import type { DemoData, PayrollResult } from '../types';

export function applyPaymentStatus(data: DemoData, result: PayrollResult): PayrollResult {
  const payments = data.payments.filter((item) => item.employeeId === result.employeeId && item.month === result.month);
  const latest = [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return { ...result, paymentStatus: 'UNPAID', paidAmount: 0, difference: 0 };
  return {
    ...result,
    paymentStatus: latest.salaryAtPayment === result.finalSalary ? 'PAID' : 'REVIEW',
    paidAmount: latest.amount,
    difference: result.finalSalary - latest.amount,
  };
}

export const paymentLabels = { UNPAID: 'غير مصروف', PAID: 'تم الصرف', REVIEW: 'يحتاج مراجعة' } as const;
