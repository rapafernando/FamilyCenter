'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data, IS_FAKE } from '@/lib/data';
import type { UpdateStatus } from '@/lib/data/fake';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Button } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

export default function Updates() {
  const { session } = useApp();
  return (
    <SettingsGate>
      <PageHeader title="Software updates" back={{ href: '/settings', label: 'Settings' }} />
      {!session.admin && !IS_FAKE
        ? <p className="max-w-[40rem] rounded-md bg-warning-tint p-4 text-ink">Only the person who set up this server can update it. Ask them, or sign in with their account.</p>
        : <Body />}
    </SettingsGate>
  );
}

const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

function Cmd({ text }: { text: string }) {
  const notify = useNotice();
  const copy = async () => { try { await navigator.clipboard.writeText(text); notify({ tone: 'success', title: 'Copied' }); } catch { notify({ tone: 'info', title: 'Select the command and copy it' }); } };
  return (
    <div className="flex items-center gap-2">
      <input readOnly aria-label={`Command: ${text}`} value={text} onFocus={(e) => e.currentTarget.select()} className="min-h-target w-full rounded-md border-2 border-line-input bg-surface px-3 font-mono text-base text-ink" />
      <Button type="button" variant="secondary" onClick={copy}>Copy</Button>
    </div>
  );
}

function Body() {
  const notify = useNotice();
  const [st, setSt] = useState<UpdateStatus | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(false);
  const [ask, setAsk] = useState<null | 'update' | 'rebuild'>(null);
  const [offline, setOffline] = useState(false);
  const stRef = useRef(st); stRef.current = st;

  const refresh = useCallback(async () => {
    try { const s = await data.getUpdateStatus(); setSt(s); setOffline(false); return s; }
    catch (e) {
      // While the server restarts the page cannot reach it. That is expected during an update; keep asking.
      const running = ['requested', 'running'].includes(stRef.current?.run?.state ?? '');
      if (running) setOffline(true); else setErr(errMsg(e));
      return null;
    }
  }, []);
  const check = useCallback(async () => {
    setChecking(true); setErr('');
    try { setSt(await data.checkForUpdate()); } catch (e) { setErr(errMsg(e)); } finally { setChecking(false); }
  }, []);

  useEffect(() => { void refresh().then((s) => { if (s && !['requested', 'running'].includes(s.run?.state ?? '')) void check(); }); }, [refresh, check]);
  const active = st?.pending || ['requested', 'running'].includes(st?.run?.state ?? '');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const go = async (rebuild: boolean) => {
    setAsk(null); setBusy(true); setErr('');
    try { await data.requestUpdate(rebuild ? { rebuild: true } : undefined); await refresh(); notify({ tone: 'success', title: 'Update started' }); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!st) return err ? <Banner tone="danger" title="That did not work">{err}</Banner> : <SkeletonList rows={3} />;
  const ck = st.check; const run = st.run;
  const offer = !!ck?.ok && !!ck.latest && !ck.upToDate;
  const finished = run && ['done', 'failed', 'rolled_back'].includes(run.state) && !active;

  return (
    <div className="flex max-w-[40rem] flex-col gap-5">
      <p className="text-base text-muted">This checks the project on GitHub (<b>{st.repo}</b>, branch <b>{st.branch}</b>) and, if there is something newer, updates this server. A backup is saved first. If the new version does not start, the old one is put back.</p>
      {IS_FAKE && <Banner tone="info" title="Practice mode">Updates work on a real server only.</Banner>}
      {err && <Banner tone="danger" title="That did not work">{err}</Banner>}

      <section aria-label="Version in use" className="rounded-lg border-2 border-line bg-surface p-4">
        <h2 className="font-display text-lg text-ink">Version in use</h2>
        {st.current.known
          ? <p className="mt-1 text-base text-ink">Version <b className="font-mono">{st.current.short}</b>{ck?.latest && ck.upToDate ? ' (the newest)' : ''}</p>
          : <p className="mt-1 text-base text-ink">This copy does not know which version it is, because it was not started by the updater. Press <b>Rebuild now</b> once and it will remember.</p>}
      </section>

      {active && (
        <section aria-label="Update in progress" className="flex flex-col gap-2 rounded-lg border-2 border-accent bg-accent-tint p-4" role="status">
          <h2 className="font-display text-lg text-ink">Updating</h2>
          <p className="text-base text-ink">{st.pending && !run?.message ? 'Waiting for the updater to start…' : run?.message || 'Working…'}</p>
          {offline && <p className="text-base text-muted">The server is restarting. This page keeps checking and will update by itself.</p>}
          {run && run.state === 'running' && !st.installed && <p className="text-base text-danger">The updater has not reported for a while. If this stays, look at it on the server: sudo systemctl status familycenter-updater</p>}
          <p className="text-sm text-muted">You can leave this page open. Screens go blank for about a minute while the server restarts.</p>
        </section>
      )}

      {finished && run.state === 'done' && (
        <Banner tone="success" title={run.to && run.from !== run.to ? `Updated to ${run.to}` : 'Nothing to update'} action={<Button variant="secondary" onClick={() => window.location.reload()}>Reload this page</Button>}>{run.message}</Banner>
      )}
      {finished && run.state === 'rolled_back' && <Banner tone="warning" title="The update did not work, so the old version is back">{run.message}</Banner>}
      {finished && run.state === 'failed' && <Banner tone="danger" title="The update stopped">{run.message}</Banner>}
      {finished && run.log.length > 0 && run.state !== 'done' && (
        <details className="rounded-md border-2 border-line bg-surface p-3"><summary className="cursor-pointer text-base font-bold text-ink">What the updater said</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-sm text-ink">{run.log.join('\n')}</pre></details>
      )}

      {!active && (
        <section aria-label="Check for updates" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Check for updates</h2>
          {checking && <p className="text-base text-muted" role="status">Asking GitHub…</p>}
          {!checking && ck && !ck.ok && <Banner tone="danger" title="Could not check">{ck.error}</Banner>}
          {!checking && ck?.ok && ck.upToDate && <Banner tone="success" title="You have the newest version">{ck.newerThanGithub ? 'This copy is newer than what GitHub has.' : `Checked ${when(ck.at)}.`}</Banner>}
          {!checking && offer && ck?.latest && (
            <div className="flex flex-col gap-2">
              <Banner tone="info" title={ck.behind ? `${ck.behind} ${ck.behind === 1 ? 'change is' : 'changes are'} ready` : 'A different version is on GitHub'}>
                Newest is <span className="font-mono">{ck.latest.short}</span>{ck.latest.date ? `, from ${when(ck.latest.date)}` : ''}.
                {ck.unrelated && ' GitHub does not recognise the version in use, so updating replaces it.'}
                {!st.current.known && ' Pressing Update now will also record the version.'}
              </Banner>
              {ck.changes.length > 0 && <ul className="m-0 list-disc pl-6 text-base text-ink">{ck.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
              {ck.changes.length === 0 && ck.latest.message && <p className="text-base text-ink">Latest change: {ck.latest.message}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={checking} onClick={check}>Check for updates</Button>
            {offer && <Button loading={busy} disabled={!st.installed || IS_FAKE} onClick={() => setAsk('update')}>Update now</Button>}
            {!st.current.known && !offer && <Button variant="secondary" loading={busy} disabled={!st.installed || IS_FAKE} onClick={() => setAsk('rebuild')}>Rebuild now</Button>}
          </div>
        </section>
      )}

      {!st.installed && !active && !IS_FAKE && (
        <section aria-label="Install the updater" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">One-time setup on the server</h2>
          <p className="text-base text-ink">Updating needs a small helper that runs on the server itself, because the web app is not allowed to control Docker. Install it once. In the server’s terminal, in the FamilyCenter folder:</p>
          {!st.folderReady && <Cmd text="mkdir -p updates && docker compose up -d" />}
          <Cmd text="sudo ./scripts/install-updater.sh" />
          <p className="text-base text-muted">Then come back to this page; it notices the helper within a minute.</p>
        </section>
      )}

      <ChoiceDialog open={!!ask} title={ask === 'rebuild' ? 'Rebuild this server now?' : 'Update this server now?'}
        detail="A backup is saved first. Every screen, including the wall screen, goes blank for about a minute while the server restarts. If the new version does not start, the old one is put back."
        choices={[{ value: 'go', label: ask === 'rebuild' ? 'Rebuild now' : 'Update now' }]} onChoose={() => go(ask === 'rebuild')} onCancel={() => setAsk(null)} />
    </div>
  );
}
