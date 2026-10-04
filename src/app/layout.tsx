import type { Metadata, Viewport } from 'next';
import { DemoProvider } from '@/components/demo-provider';
import { PwaRegistration } from '@/components/pwa-registration';
import { ThemeProvider } from '@/components/theme-provider';
import { WelcomeProvider } from '@/components/welcome-provider';
import './globals.css';
export const metadata: Metadata = { title: { default: 'CenterPro — إدارة المركز', template: '%s | CenterPro' }, description: 'منصة CenterPro لإدارة الموظفين والحضور والرواتب — معاينة الواجهات', manifest: '/manifest.webmanifest', icons: { icon: '/icons/favicon.ico', apple: '/icons/apple-touch-icon.png' }, appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CenterPro' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#A51C30', colorScheme: 'light' };
// Static, parser-blocking bootstrap applies only the saved choice before body paint.
const themeBootstrap = "(()=>{let t='light';try{if(localStorage.getItem('centerpro-theme')==='dark')t='dark'}catch{}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})()";
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl" data-theme="light" suppressHydrationWarning><head><script id="centerpro-theme-init" dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head><body>{process.env.VERCEL_ENV === 'production' ? <><a href="#main-content" className="skip-link">انتقل إلى المحتوى</a><main className="app-loading"><h1>CenterPro</h1><p>نسخة الواجهات متاحة عبر رابط المعاينة فقط. التشغيل الإنتاجي ينتظر اعتماد التصميم وربط الخدمات.</p></main></> : <ThemeProvider><WelcomeProvider><a href="#main-content" className="skip-link">انتقل إلى المحتوى</a><DemoProvider><PwaRegistration/>{children}</DemoProvider></WelcomeProvider></ThemeProvider>}</body></html>;
}
