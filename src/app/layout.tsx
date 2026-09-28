import type { Metadata, Viewport } from 'next';
import { DemoProvider } from '@/components/demo-provider';
import { PwaRegistration } from '@/components/pwa-registration';
import { WelcomeProvider } from '@/components/welcome-provider';
import './globals.css';
export const metadata: Metadata = { title: { default: 'CenterPro — إدارة المركز', template: '%s | CenterPro' }, description: 'منصة CenterPro لإدارة الموظفين والحضور والرواتب — معاينة الواجهات', manifest: '/manifest.webmanifest', icons: { icon: '/icons/favicon.ico', apple: '/icons/apple-touch-icon.png' }, appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CenterPro' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#A51C30', colorScheme: 'light' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{process.env.VERCEL_ENV === 'production' ? <><a href="#main-content" className="skip-link">انتقل إلى المحتوى</a><main className="app-loading"><h1>CenterPro</h1><p>نسخة الواجهات متاحة عبر رابط المعاينة فقط. التشغيل الإنتاجي ينتظر اعتماد التصميم وربط الخدمات.</p></main></> : <WelcomeProvider><a href="#main-content" className="skip-link">انتقل إلى المحتوى</a><DemoProvider><PwaRegistration/>{children}</DemoProvider></WelcomeProvider>}</body></html>;
}
