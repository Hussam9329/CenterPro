import Link from 'next/link';
export default function NotFound() { return <main className="app-loading"><h1>الصفحة غير موجودة</h1><p className="muted">تأكد من الرابط أو ارجع إلى مساحة العمل.</p><Link className="btn btn-primary" href="/">العودة إلى CenterPro</Link></main>; }
