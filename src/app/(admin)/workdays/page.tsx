import { redirect } from 'next/navigation';

export default async function LegacyWorkdaysPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const query = await searchParams;
  redirect(query.open === 'new' ? '/attendance?open=new' : '/attendance');
}
