import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'הדמיית דירה מתכנית', description: 'מערכת עזר לשיווק ומכירות: הופכת תכנית אדריכלית PDF להדמיה תלת־ממדית ותכנית שיווקית' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
