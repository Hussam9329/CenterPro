'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="app-loading"><h1>تعذر تحميل هذه الصفحة</h1><p className="muted">أعد المحاولة للعودة إلى مساحة العمل.</p><button className="btn btn-primary" onClick={reset}>إعادة المحاولة</button></main>; }
