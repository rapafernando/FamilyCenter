'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarSync, Users, MonitorSmartphone, SunMoon, Images, Sparkles, Home, UserCog, ChevronRight, LogOut } from 'lucide-react';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { useQuery } from '@/lib/data/hooks';
import { Button, Segmented } from '@/components/ui/controls';

const ITEMS = [
  { href: '/settings/profiles', label: 'People', hint: 'Names and colours', Icon: Users },
  { href: '/settings/calendars', label: 'Calendars', hint: 'Connect Google Calendar', Icon: CalendarSync },
  { href: '/settings/devices', label: 'Screens', hint: 'Link a tablet or wall display', Icon: MonitorSmartphone },
  { href: '/settings/display', label: 'Display and ads', hint: 'Theme, PIN, screensaver', Icon: SunMoon },
  { href: '/settings/photos', label: 'Photos', hint: 'Albums for the screensaver', Icon: Images },
  { href: '/settings/ai', label: 'AI helper', hint: 'Add your own AI key', Icon: Sparkles },
  { href: '/settings/household', label: 'Household', hint: 'Name, time zone, members', Icon: Home },
  { href: '/settings/account', label: 'Account', hint: 'Export or delete your data', Icon: UserCog },
] as const;

export default function Settings() {
  const { surface, setSurface, session } = useApp();
  const router = useRouter();
  const ai = useQuery(() => data.aiStatus(), []);
  return (
    <AdultGate>
      <PageHeader title="More" />
      <ul className="mb-6 flex max-w-[44rem] list-none flex-col gap-2 p-0">
        {[...(ai.data?.available ? [{ href: '/assistant', label: 'Assistant', hint: 'Plan meals, read a note, save a recipe', Icon: Sparkles }] : []), ...ITEMS].map(({ href, label, hint, Icon }) => (
          <li key={href}><Link href={href} className="flex min-h-primary items-center gap-4 rounded-lg border-2 border-line bg-surface p-3 hover:border-accent">
            <Icon aria-hidden className="h-7 w-7 shrink-0 text-accent" /><span className="flex-1"><span className="block text-lg font-bold text-ink">{label}</span><span className="text-base text-muted">{hint}</span></span><ChevronRight aria-hidden className="h-5 w-5 text-muted" />
          </Link></li>
        ))}
      </ul>
      <div className="flex max-w-[44rem] flex-col gap-4 rounded-lg border-2 border-line bg-surface p-4">
        <Segmented label="Layout on this screen" value={surface} onChange={(v) => setSurface(v === 'wall' ? 'wall' : null)} options={[{ value: 'handheld', label: 'Phone' }, { value: 'wall', label: 'Wall display' }]} />
        <p className="text-sm text-muted">Wall display uses bigger text and buttons for a screen you look at from across the room.</p>
        {session.user && <Button variant="secondary" onClick={async () => { await data.signOut(); router.push('/welcome'); }}><LogOut aria-hidden className="mr-2 inline h-5 w-5" />Sign out</Button>}
        {session.deviceId && <Button variant="secondary" onClick={async () => { await data.signOutDevice(); router.push('/welcome'); }}>Unlink this screen</Button>}
      </div>
    </AdultGate>
  );
}
