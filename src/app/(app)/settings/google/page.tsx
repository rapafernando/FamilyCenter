'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data, IS_FAKE } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Button, Field, Select } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';

export default function GoogleSettings() {
  const { session } = useApp(); const notify = useNotice();
  return (
    <SettingsGate>
      <PageHeader title="Google connection" back={{ href: '/settings', label: 'Settings' }} />
      {!session.admin && !IS_FAKE
        ? <p className="max-w-[40rem] rounded-md bg-warning-tint p-4 text-ink">Only the person who set up this server can change the Google connection. Ask them, or sign in with their account.</p>
        : <Body notify={notify} />}
    </SettingsGate>
  );
}

function Body({ notify }: { notify: ReturnType<typeof useNotice> }) {
  const q = useQuery(() => data.getGoogleSetup(), []);
  const [id, setId] = useState(''); const [secret, setSecret] = useState(''); const [status, setStatus] = useState<'testing' | 'production'>('testing');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; warnings: string[] } | null>(null);
  const s = q.data;
  useEffect(() => { if (s) { setId(s.clientId); setStatus(s.status); } }, [s]);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); notify({ tone: 'success', title: 'Copied' }); } catch { notify({ tone: 'info', title: 'Select the address and copy it' }); } };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setResult(null); setBusy(true);
    try {
      const r = await data.saveGoogleSetup({ clientId: id, clientSecret: secret || undefined, status });
      setSecret(''); setResult({ ok: r.check.ok, message: r.check.message, warnings: r.warnings }); q.reload();
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  const test = async () => { setErr(''); setResult(null); setBusy(true); try { const r = await data.testGoogleSetup(); setResult({ ok: r.ok, message: r.message, warnings: [] }); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  const remove = async () => { setAsk(false); setErr(''); try { await data.clearGoogleSetup(); setId(''); setSecret(''); setResult(null); q.reload(); notify({ tone: 'success', title: 'Saved Google details removed' }); } catch (x) { setErr(errMsg(x)); } };

  return (
    <div className="flex max-w-[40rem] flex-col gap-5">
      <p className="text-base text-muted">Google Calendar and Google Photos sign in through a Google project that you own, so your family’s data never passes through anyone else. You set it up once. This takes about ten minutes.</p>
      {IS_FAKE && <Banner tone="info" title="Practice mode">Saving works on a real server only.</Banner>}
      {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
      {s && (
        <p className="rounded-md border-2 border-line bg-surface p-3 text-base text-ink" role="status">
          {s.source === 'none' && 'Not set up yet.'}
          {s.source === 'settings' && <>Set up. The secret ends in <b>{s.secretLast4}</b>.</>}
          {s.source === 'env' && 'Set up through the server’s settings file. Saving here replaces those values.'}
        </p>
      )}
      <section aria-label="Steps in Google" className="flex flex-col gap-2">
        <h2 className="font-display text-lg text-ink">Steps in Google</h2>
        <ol className="m-0 flex list-decimal flex-col gap-2 pl-6 text-base text-ink">
          <li>Open the <a className="font-bold text-accent underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project. Any name will do.</li>
          <li>Under APIs and Services, Library, turn on <b>Google Calendar API</b> and <b>Google Photos Picker API</b>.</li>
          <li>Under OAuth consent screen, choose External, fill in an app name and your email, and add your own Google account as a test user.</li>
          <li>Under Credentials, create an OAuth client ID of type <b>Web application</b>. In Authorised redirect URIs add this address exactly:
            <div className="mt-2 flex items-center gap-2">
              <input readOnly aria-label="Redirect address for Google" value={s?.redirectUri ?? ''} onFocus={(e) => e.currentTarget.select()} className="min-h-target w-full rounded-md border-2 border-line-input bg-surface px-3 text-sm text-ink" />
              <Button type="button" variant="secondary" onClick={() => copy(s?.redirectUri ?? '')}>Copy</Button>
            </div>
            {s && !s.https && <p className="mt-2 text-sm text-danger">This server’s address starts with http://. Google only accepts https addresses here, so sign-in will not work until the server is reached through https.</p>}
          </li>
          <li>Copy the client ID and the client secret into the boxes below.</li>
        </ol>
      </section>
      <form className="flex flex-col gap-4 rounded-lg border-2 border-line bg-surface p-4" onSubmit={save}>
        <Field label="Client ID" autoComplete="off" spellCheck={false} placeholder="123456789-abc.apps.googleusercontent.com" required value={id} onChange={(e) => setId(e.target.value)} />
        <Field label="Client secret" type="password" autoComplete="off" placeholder={s?.secretSaved ? `Saved, ending ${s.secretLast4}. Leave empty to keep it.` : 'Paste the secret'} value={secret} onChange={(e) => setSecret(e.target.value)} />
        <Select label="Google app status" value={status} onChange={(e) => setStatus(e.target.value as 'testing' | 'production')}>
          <option value="testing">Testing (Google ends each sign-in after 7 days)</option>
          <option value="production">Published and verified by Google</option>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>Save and check</Button>
          {s?.source === 'settings' && <Button type="button" variant="secondary" disabled={busy} onClick={test}>Check again</Button>}
          {s?.source === 'settings' && <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => setAsk(true)}>Remove saved details</Button>}
        </div>
      </form>
      {result && (
        <Banner tone={result.ok ? 'success' : 'danger'} title={result.ok ? 'Google accepts them' : 'Google did not accept them'}>
          {result.message}{result.warnings.map((w) => <span key={w} className="mt-1 block">{w}</span>)}
        </Banner>
      )}
      <p className="text-base text-muted">Next: <Link href="/settings/calendars" className="font-bold text-accent underline">connect a calendar</Link> or <Link href="/settings/photos" className="font-bold text-accent underline">pick photos for the screensaver</Link>.</p>
      <ChoiceDialog open={ask} danger title="Remove the saved Google details?" detail="Calendars and photo imports stop working until you add a client ID and secret again. Calendars you already connected will ask you to sign in again." choices={[{ value: 'go', label: 'Remove' }]} onChoose={remove} onCancel={() => setAsk(false)} />
    </div>
  );
}
