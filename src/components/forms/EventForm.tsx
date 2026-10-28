'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { cn } from '@/lib/cn';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { addDays, dateOfInstant, timeOfInstant, toInstant } from '@/lib/time';
import { buildRrule, parseRrule, type RepeatKind } from '@/lib/recurrence';
import { Banner } from '@/components/ui/misc';
import { Button, Field, ProfileChip, Select, Switch } from '@/components/ui/controls';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/AppShell';

type Scope = 'this' | 'following' | 'all';
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REPEATS: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }, { value: 'yearly', label: 'Every year' },
];
const REMINDERS = [{ v: '', l: 'No reminder' }, { v: '0', l: 'When it starts' }, { v: '5', l: '5 minutes before' }, { v: '10', l: '10 minutes before' }, { v: '30', l: '30 minutes before' }, { v: '60', l: '1 hour before' }];

export function EventForm({ eventId, rid, startDate }: { eventId?: string; rid?: string; startDate?: string }) {
  const { household, profiles, today, isAdult } = useApp();
  const tz = household.timezone;
  const router = useRouter(); const notify = useNotice();
  const editing = !!eventId;
  const ev = useQuery(() => (eventId ? data.getEvent(eventId) : Promise.resolve(null)), [eventId]);
  const occ = useQuery(async () => {
    if (!eventId || !rid) return null;
    const list = await data.listEvents({ from: DateTime.fromISO(rid).minus({ days: 1 }).toISO()!, to: DateTime.fromISO(rid).plus({ days: 2 }).toISO()! });
    return list.find((o) => o.eventId === eventId && o.recurrenceId === rid) ?? null;
  }, [eventId, rid]);
  const cats = useQuery(() => data.listCategories(), []);
  const conns = useQuery(async () => ({ c: await data.listConnections(), k: await data.listSyncedCalendars() }), []);

  const [f, setF] = useState({ title: '', profileId: '', allDay: false, date: startDate || today, endDate: startDate || today, start: '09:00', end: '10:00', repeat: 'none' as RepeatKind, weekdays: [] as number[], categoryId: '', location: '', description: '', alert: '', saveTo: '' });
  const [ready, setReady] = useState(!editing);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | 'save' | 'delete'>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!editing || !ev.data || ready || occ.loading) return;
    const e = ev.data, o = occ.data ?? { ...e, recurrenceId: e.startsAt, repeats: !!e.rrule };
    const rr = parseRrule(e.rrule);
    const s = dateOfInstant(o.startsAt, tz); const endExclusive = dateOfInstant(o.endsAt, tz);
    setF({ title: o.title, profileId: o.profileId, allDay: e.allDay, date: s, endDate: e.allDay ? addDays(endExclusive, -1) : s, start: timeOfInstant(o.startsAt, tz), end: timeOfInstant(o.endsAt, tz),
      repeat: rr.kind, weekdays: rr.weekdays, categoryId: e.categoryId ?? '', location: o.location, description: o.description, alert: e.alertMinutes[0] !== undefined ? String(e.alertMinutes[0]) : '', saveTo: '' });
    setReady(true);
  }, [editing, ev.data, occ.data, occ.loading, ready, tz]);

  // new events go to the default Google calendar when there is a two-way one
  const twoWay = useMemo(() => (conns.data?.c ?? []).filter((c) => c.mode === 'two_way' && c.status !== 'needs_reauth').flatMap((c) => (conns.data?.k ?? []).filter((k) => k.connectionId === c.id && k.enabled)), [conns.data]);
  useEffect(() => { if (!editing && !f.saveTo) { const d = twoWay.find((k) => k.isDefaultTarget); if (d) set('saveTo', d.id); } }, [editing, twoWay]); // eslint-disable-line react-hooks/exhaustive-deps

  const synced = editing && ev.data?.source === 'synced' && !((conns.data?.k ?? []).some((k) => k.id === ev.data!.calendarId && (conns.data?.c ?? []).some((c) => c.id === k.connectionId && c.mode === 'two_way')));
  const recurring = !!ev.data?.rrule;

  const times = () => f.allDay
    ? { startsAt: toInstant(f.date, '00:00', tz), endsAt: toInstant(addDays(f.endDate < f.date ? f.date : f.endDate, 1), '00:00', tz) }
    : { startsAt: toInstant(f.date, f.start, tz), endsAt: toInstant(f.date, f.end, tz) };

  async function save(scope: Scope) {
    setBusy(true); setErr('');
    try {
      const rrule = buildRrule(f.repeat, f.repeat === 'weekly' ? f.weekdays : []);
      const common = { title: f.title, profileId: f.profileId, categoryId: f.categoryId || null, description: f.description, location: f.location, allDay: f.allDay, alertMinutes: f.alert === '' ? [] : [Number(f.alert)], ...times() };
      if (editing) { await data.updateEvent(eventId!, scope === 'all' || !recurring ? { ...common, rrule } : common, recurring ? scope : 'all', rid); notify({ tone: 'success', title: 'Event saved' }); }
      else { await data.createEvent({ ...common, tz, rrule, saveToCalendarId: f.saveTo || null }); notify({ tone: 'success', title: 'Event added', body: f.saveTo ? 'It will also appear in Google Calendar.' : undefined }); }
      router.push(`/calendar?date=${f.date}`);
    } catch (e) { setErr(errMsg(e)); setBusy(false); setAsk(null); }
  }
  async function remove(scope: Scope) {
    setBusy(true); setErr('');
    try { await data.deleteEvent(eventId!, recurring ? scope : 'all', rid); notify({ tone: 'success', title: 'Event deleted' }); router.push(`/calendar?date=${f.date}`); }
    catch (e) { setErr(errMsg(e)); setBusy(false); setAsk(null); }
  }

  if (editing && (ev.error || (!ev.loading && !ev.data))) return <><PageHeader title="Event" back={{ href: '/calendar', label: 'Calendar' }} /><Banner tone="warning" title="This event is gone">It may have been deleted on another screen.</Banner></>;
  if (!ready) return <><PageHeader title="Event" back={{ href: '/calendar', label: 'Calendar' }} /><SkeletonList rows={5} /></>;

  const viewerOnly = editing && !isAdult;
  const readOnly = synced || viewerOnly;
  const dis = readOnly;
  return (
    <form className="mx-auto flex max-w-[40rem] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (readOnly) return; if (editing && recurring) setAsk('save'); else save('all'); }}>
      <PageHeader title={editing ? 'Edit event' : 'New event'} back={{ href: '/calendar', label: 'Calendar' }} />
      {viewerOnly && <Banner tone="info" title="You can look but not change">Your role is view only. Ask the household owner if this needs to change.</Banner>}
      {synced && <Banner tone="info" title="This event comes from Google Calendar">It is read only here. Change it in Google Calendar, or switch the connection to two-way in More › Calendars.</Banner>}
      {err && <Banner tone="danger" title="Could not save">{err}</Banner>}
      <Field label="Title" required value={f.title} disabled={dis} onChange={(e) => set('title', e.target.value)} placeholder="Soccer practice" />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-bold">Who is it for?</legend>
        <div className="flex flex-wrap gap-2">
          {profiles.filter((p) => p.kind !== 'other').map((p) => <ProfileChip key={p.id} name={p.name} color={p.color} selected={f.profileId === p.id} onClick={dis ? undefined : () => set('profileId', p.id)} />)}
        </div>
        {!f.profileId && <p className="text-sm text-muted">Pick one person. Choose “Family” for everyone.</p>}
      </fieldset>
      <Switch label="All day" checked={f.allDay} onChange={dis ? () => {} : (v) => set('allDay', v)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={f.allDay ? 'First day' : 'Date'} type="date" required value={f.date} disabled={dis} onChange={(e) => { set('date', e.target.value); if (f.endDate < e.target.value) set('endDate', e.target.value); }} />
        {f.allDay ? <Field label="Last day" type="date" value={f.endDate} min={f.date} disabled={dis} onChange={(e) => set('endDate', e.target.value)} /> : <span />}
        {!f.allDay && <><Field label="Starts" type="time" required value={f.start} disabled={dis} onChange={(e) => { set('start', e.target.value); if (f.end <= e.target.value) set('end', DateTime.fromFormat(e.target.value, 'HH:mm').plus({ hours: 1 }).toFormat('HH:mm')); }} /><Field label="Ends" type="time" required value={f.end} disabled={dis} onChange={(e) => set('end', e.target.value)} /></>}
      </div>
      <Select label="Repeats" value={f.repeat} disabled={dis || (editing && recurring && false)} onChange={(e) => set('repeat', e.target.value as RepeatKind)}>
        {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </Select>
      {f.repeat === 'weekly' && (
        <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
          {DAY_LABELS.map((l, i) => { const on = f.weekdays.includes(i); return <button key={l} type="button" disabled={dis} aria-pressed={on} onClick={() => set('weekdays', on ? f.weekdays.filter((d) => d !== i) : [...f.weekdays, i])} className={cn('min-h-target min-w-target rounded-md border-2 px-2 font-bold', on ? 'border-accent bg-accent text-accent-on' : 'border-line-input bg-surface text-ink')}>{l}</button>; })}
        </div>
      )}
      <Select label="Reminder" value={f.alert} disabled={dis} onChange={(e) => set('alert', e.target.value)}>{REMINDERS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</Select>
      {(cats.data?.length ?? 0) > 0 && <Select label="Category" value={f.categoryId} disabled={dis} onChange={(e) => set('categoryId', e.target.value)}><option value="">None</option>{cats.data!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      <Field label="Where" value={f.location} disabled={dis} onChange={(e) => set('location', e.target.value)} />
      <div className="flex flex-col gap-1"><label htmlFor="notes" className="text-sm font-bold">Notes</label><textarea id="notes" rows={3} value={f.description} disabled={dis} onChange={(e) => set('description', e.target.value)} className="rounded-md border-2 border-line-input bg-surface p-3 text-base text-ink" /></div>
      {!editing && twoWay.length > 0 && (
        <Select label="Also save to Google Calendar" value={f.saveTo} onChange={(e) => set('saveTo', e.target.value)}><option value="">No, keep it here only</option>{twoWay.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {!readOnly && <Button type="submit" size="lg" loading={busy}>{editing ? 'Save changes' : 'Add event'}</Button>}
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {editing && !readOnly && <Button type="button" variant="ghost" onClick={() => (recurring ? setAsk('delete') : remove('all'))} className="ml-auto text-danger">Delete</Button>}
      </div>
      <ChoiceDialog<Scope> open={ask === 'save'} title="Change which events?" detail="This event repeats." choices={[{ value: 'this', label: 'Only this one' }, { value: 'following', label: 'This and the ones after it' }, { value: 'all', label: 'Every event in the series' }]} onChoose={(s) => save(s)} onCancel={() => setAsk(null)} />
      <ChoiceDialog<Scope> open={ask === 'delete'} danger title="Delete which events?" detail="This event repeats." choices={[{ value: 'this', label: 'Only this one' }, { value: 'following', label: 'This and the ones after it' }, { value: 'all', label: 'Every event in the series' }]} onChoose={(s) => remove(s)} onCancel={() => setAsk(null)} />
    </form>
  );
}
