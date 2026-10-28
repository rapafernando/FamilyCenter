import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/bricolage-grotesque';
import './globals.css';
import { NoticeProvider } from '@/lib/ctx';

export const metadata: Metadata = { title: 'Family calendar' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F2F5F7' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3 focus:font-bold">Skip to content</a>
        <NoticeProvider>{children}</NoticeProvider>
      </body>
    </html>
  );
}
