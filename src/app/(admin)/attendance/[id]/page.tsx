import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { AttendanceDayDetail } from '@/components/attendance/day-detail';

export default async function AttendanceDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="page-stack"><Skeleton /><Skeleton /></div>}><AttendanceDayDetail dayId={id} /></Suspense>;
}
