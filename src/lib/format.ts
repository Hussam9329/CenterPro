export const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const money = (value: number) => `${number(value)} د.ع`;
export function date(value: string): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function englishMonthName(value: string): string {
  const d = new Date(`${value}-15T12:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', month: 'long' }).format(d);
}
export function attendanceDateLabel(value: string): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value);
  if (Number.isNaN(d.getTime())) return '—';
  const weekday = new Intl.DateTimeFormat('ar-IQ', { timeZone: 'Asia/Baghdad', weekday: 'long' }).format(d);
  const english = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return `${weekday} — ${english}`;
}
export function time(value: string): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `2026-09-28T${value}+03:00`);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(d);
}
export function monthLabel(value: string): string {
  const months = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
  const [year, month] = value.split('-');
  return `${months[Number(month) - 1] || ''} ${year}`;
}
export function duration(seconds: number): string {
  if (seconds === 0) return 'في الموعد';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return [h ? `${h} ساعة` : '', m ? `${m} دقيقة` : '', s ? `${s} ثانية` : ''].filter(Boolean).join(' و ');
}
