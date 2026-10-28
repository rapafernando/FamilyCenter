'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, ListChecks, ShoppingBasket, UtensilsCrossed, Settings, CloudSun, RefreshCw } from 'lucide-react';
import { Button, Fab, Field, Switch, Segmented, ProfileChip } from '@/components/ui/controls';
import { EventCard, Countdown } from '@/components/ui/calendar';
import { TaskRow, StarCounter, RewardCard, ChecklistItem, StarSticker } from '@/components/ui/tasks';
import { Banner, AlertDialog, MealTile, ConnectionCard, PromptPanel, SponsorSlide, PinPad, PairingCode } from '@/components/ui/misc';
import { MARKER_PRESETS } from '@/lib/markers.generated';
import { cn } from '@/lib/cn';

const FAMILY = [
  { name: 'Maya', color: 'grape' }, { name: 'Leo', color: 'sky' }, { name: 'Dad', color: 'grass' },
  { name: 'Mom', color: 'tangerine' }, { name: 'Grandma', color: '#FF2BA8' }, // imported from Google as a custom colour
];

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

function WallBoard() {
  const [done, setDone] = useState<Record<string, boolean>>({ a: true, b: false, c: false, d: true, e: true });
  const set = (k: string) => (v: boolean) => setDone((s) => ({ ...s, [k]: v }));
  return (
    <div className="overflow-x-auto rounded-lg border-2 border-line">
    <div className="grid min-w-[56rem] bg-bg" style={{ gridTemplateColumns: '6rem 1fr' }} data-testid="board">
      <nav aria-label="Main" className="flex flex-col items-center gap-2 border-r-2 border-line bg-surface py-4">
        {[[CalendarDays, 'Calendar', true], [ListChecks, 'Chores', false], [ShoppingBasket, 'Lists', false], [UtensilsCrossed, 'Meals', false], [Settings, 'Settings', false]].map(([Icon, label, on]) => {
          const I = Icon as typeof CalendarDays;
          return (
            <button key={label as string} type="button" aria-current={on ? 'page' : undefined}
              className={cn('flex min-h-primary w-[5rem] flex-col items-center justify-center gap-0.5 rounded-md text-xs font-bold', on ? 'bg-accent text-accent-on' : 'text-ink')}>
              <I aria-hidden className="h-6 w-6" />{label as string}
            </button>
          );
        })}
      </nav>
      <div className="flex flex-col gap-4 p-5">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-2xl text-ink">Wednesday</p>
            <p className="text-lg text-muted">October 28</p>
          </div>
          <p className="font-display text-clock text-ink">7:42</p>
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center gap-2 rounded-pill border-2 border-line bg-surface px-3 py-1 text-base text-ink"><CloudSun aria-hidden className="h-5 w-5" />72° and clear</span>
            <span className="inline-flex items-center gap-2 text-sm text-muted"><RefreshCw aria-hidden className="h-4 w-4" />Google synced 2 minutes ago</span>
          </div>
        </header>
        <div className="grid gap-5" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg text-ink">Today</h2>
            <EventCard title="Soccer practice" time="3:30 – 5:00 PM" person="Leo" color="sky" repeats />
            <EventCard title="Piano lesson" time="4:00 PM" person="Maya" color="grape" source="synced" alertDue />
            <EventCard title="Dentist" time="5:15 PM" person="Mom" color="tangerine" source="synced" />
            <EventCard title="Grandma visits" time="All day" person="Grandma" color="#FF2BA8" />
            <Countdown title="Beach weekend" days={9} color="teal" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg text-ink">Chores</h2>
            <ProfileChip name="Maya" color="grape" />
            <TaskRow title="Feed the cat" emoji="🐱" color="grape" done={done.a} stars={2} onToggle={set('a')} />
            <TaskRow title="Pack soccer bag" emoji="⚽" color="grape" done={done.b} stars={1} onToggle={set('b')} />
            <ProfileChip name="Leo" color="sky" />
            <TaskRow title="Set the table" emoji="🍽️" color="sky" done={done.c} stars={2} onToggle={set('c')} />
            <TaskRow title="Brush teeth" emoji="🪥" color="sky" done={done.d} onToggle={set('d')} />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export default function DesignClient() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [surface, setSurface] = useState<'handheld' | 'wall'>('handheld');
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [kind, setKind] = useState<'chore' | 'routine'>('chore');
  const [sw, setSw] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [grocery, setGrocery] = useState<Record<string, boolean>>({ Milk: true, Bananas: false, 'Pasta sauce': false });
  const [handoff, setHandoff] = useState(false);
  const [pinErr, setPinErr] = useState<string | undefined>();
  const [ai, setAi] = useState<'idle' | 'working' | 'review'>('idle');

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.dataset.surface = surface; }, [surface]);

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-8 p-4 pb-32">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Design system check</h1>
        <div className="flex flex-wrap gap-3">
          <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Segmented label="Screen" value={surface} onChange={setSurface} options={[{ value: 'handheld', label: 'Phone' }, { value: 'wall', label: 'Wall display' }]} />
        </div>
      </header>

      <Section title="Wall board"><WallBoard /></Section>

      <Section title="Person colours">
        <p className="max-w-prose text-base text-muted">Nine pens. Any other colour, such as the pink Grandma has in Google Calendar, is adjusted by the same rule so it stays readable.</p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(MARKER_PRESETS).map((n) => <ProfileChip key={n} name={n} color={n} selected />)}
          <ProfileChip name="Grandma" color="#FF2BA8" selected />
          <ProfileChip name="Pale yellow" color="#FFF3A0" selected />
        </div>
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Save</Button><Button variant="secondary">Cancel</Button><Button variant="ghost">Skip</Button><Button variant="danger">Delete task</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg">Add event</Button><Button size="sm" variant="secondary">Small (adult settings)</Button><Button loading>Saving</Button><Button disabled>Unavailable</Button>
          </div>
        </Section>
        <Section title="Form">
          <Field label="Event title" placeholder="Soccer practice" />
          <Field label="Parent PIN" error="Use 4 digits." defaultValue="12" />
          <Switch label="Repeats" checked={sw} onChange={setSw} />
          <Segmented label="Task type" value={kind} onChange={setKind} options={[{ value: 'chore', label: 'Chore' }, { value: 'routine', label: 'Routine' }]} />
          <Segmented label="Calendar view" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </Section>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Stars and rewards">
          <div className="flex flex-wrap items-center gap-3">
            <StarCounter name="Maya" color="grape" balance={14} />
            <StarSticker burst className="h-16 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RewardCard title="Movie night pick" cost={10} balance={14} color="grape" onRedeem={() => {}} />
            <RewardCard title="Ice cream trip" cost={25} balance={14} color="grape" onRedeem={() => {}} />
          </div>
        </Section>
        <Section title="Lists and meals">
          <div>
            {Object.entries(grocery).map(([t, d]) => <ChecklistItem key={t} text={t} done={d} color="grass" onToggle={(v) => setGrocery((g) => ({ ...g, [t]: v }))} />)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MealTile day="Wed" slot="Dinner" meals={['Tacos', 'Corn salad']} onAdd={() => {}} />
            <MealTile day="Thu" slot="Dinner" meals={[]} onAdd={() => {}} />
          </div>
        </Section>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Google Calendar">
          <ConnectionCard email="family@gmail.com" status="ok" mode="two_way" lastSynced="2 minutes ago" tokenChecked="Today, 3:15 AM" />
          <ConnectionCard email="family@gmail.com" status="needs_reauth" mode="two_way" lastSynced="Yesterday, 9:40 PM" tokenChecked="Today, 3:15 AM (refused)" />
          <Banner tone="warning" title="Google signs you out every 7 days">The Google project is in Testing. Switch it to In production to stop this.</Banner>
        </Section>
        <Section title="Notices">
          <Banner tone="info" title="Syncing your calendar">New events can take a few minutes to show up.</Banner>
          <Banner tone="success" title="Reward redeemed">Maya spent 10 stars on Movie night pick.</Banner>
          <Banner tone="danger" title="Not enough stars">Those stars were already spent, so this chore cannot be unchecked.</Banner>
          <div><Button variant="secondary" onClick={() => setDlg(true)}>Show event alert</Button></div>
          <AlertDialog open={dlg} title="Piano lesson starts now" detail="Maya · 4:00 PM" autoDismissSeconds={30} onClose={() => setDlg(false)} />
        </Section>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Photo screensaver with a sponsor">
          <SponsorSlide advertiser="Green Valley Dairy" headline="Fresh milk delivered Tuesdays" handoff={handoff} onTap={() => setHandoff(true)} onBack={() => setHandoff(false)}
            qr={<div role="img" aria-label="QR code" className="h-full w-full rounded-sm border-2 border-ink bg-surface" style={{ backgroundImage: 'repeating-conic-gradient(var(--color-text) 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' }} />}>
            <div className="h-full w-full bg-accent-tint" />
          </SponsorSlide>
        </Section>
        <Section title="AI helper (shown only when a key is set)">
          <PromptPanel title="Plan this week’s meals" placeholder="Four people, quick dinners, no fish" state={ai}
            onSubmit={() => { setAi('working'); setTimeout(() => setAi('review'), 1200); }} />
        </Section>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Parent PIN"><PinPad onComplete={(p) => setPinErr(p === '1234' ? undefined : 'That PIN did not match. Try again.')} error={pinErr} /></Section>
        <Section title="First run on the display"><PairingCode code="K7M4QX" /></Section>
      </div>

      <Fab label="Add" />
    </main>
  );
}
