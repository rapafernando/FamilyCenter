'use client';
import { Gate } from '@/lib/ctx';
import { AppShell } from '@/components/shell/AppShell';
import { AlertHost, IdleWatcher, ScreenSizeSync, ThemeSync } from '@/components/shell/Background';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Gate>
      <ThemeSync /><ScreenSizeSync /><IdleWatcher />
      <AppShell>{children}</AppShell>
      <AlertHost />
    </Gate>
  );
}
