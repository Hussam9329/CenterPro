'use client';
import { useDemo } from '@/components/demo-provider';
import { AdjustmentsPage } from '@/components/finance/adjustments-page';
import { EmptyState } from '@/components/ui';
import { hasSessionAccountPermission } from '@/lib/permissions';
export default function EmployeeDeductionsPage() {
  const { data, session } = useDemo();
  if (!hasSessionAccountPermission(data, session, 'DEDUCTIONS', 'view')) return <EmptyState title="لا تملك صلاحية عرض الخصومات" />;
  return <AdjustmentsPage kind="deductions" />;
}
