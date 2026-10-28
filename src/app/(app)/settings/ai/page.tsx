'use client';
import { useState } from 'react';
import { errMsg, useNotice } from '@/lib/ctx';
import { data, IS_FAKE } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import type { AiProviderName } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, Field, Select } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';

const NAMES: Record<AiProviderName, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', openai_compatible: 'Other (OpenAI-compatible server)' };
const EMPTY = { provider: 'openai' as AiProviderName, label: '', model: '', baseUrl: '', apiKey: '' };

export default function AiSettings() {
  const notify = useNotice();
  const q = useQuery(() => data.listAiProviders(), []);
  const [f, setF] = useState(EMPTY); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [gone, setGone] = useState<string | null>(null);
  const [check, setCheck] = useState<Record<string, { ok: boolean; message: string }>>({});
  const guard = async (fn: () => Promise<unknown>, ok?: string) => { setErr(''); try { await fn(); if (ok) notify({ tone: 'success', title: ok }); q.reload(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <AdultGate>
      <PageHeader title="AI helper" back={{ href: '/settings', label: 'Settings' }} />
      <div className="flex max-w-[40rem] flex-col gap-5">
        <p className="text-base text-muted">AI features are off until you add your own key. You pay your provider directly for what you use. Without a key, the Assistant page and AI buttons are hidden.</p>
        {IS_FAKE && <Banner tone="info" title="Practice mode">The key is not sent anywhere yet, and answers are samples. Real calls come with the server.</Banner>}
        {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
        {q.data && q.data.length === 0 && <p className="rounded-lg border-2 border-dashed border-line-input p-5 text-center text-base text-muted">No key yet. AI is off.</p>}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {(q.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border-2 border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg text-ink">{p.label}</h2>{p.isDefault && <span className="rounded-pill bg-success-tint px-3 py-1 text-sm font-bold text-ink">In use</span>}</div>
              <p className="text-sm text-muted">{NAMES[p.provider]} · {p.model} · key ending {p.keyLast4 || '—'}</p>
              {check[p.id] && <Banner tone={check[p.id].ok ? 'success' : 'danger'} title={check[p.id].ok ? 'It works' : 'It did not work'}>{check[p.id].message}</Banner>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={async () => { try { const r = await data.verifyAiProvider(p.id); setCheck((c) => ({ ...c, [p.id]: r })); } catch (e) { setErr(errMsg(e)); } }}>Test it</Button>
                {!p.isDefault && <Button size="sm" variant="secondary" onClick={() => guard(() => data.setDefaultAiProvider(p.id), 'Now in use')}>Use this one</Button>}
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setGone(p.id)}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
        <form className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await guard(async () => { await data.saveAiProvider(f); setF(EMPTY); }, 'Key saved'); setBusy(false); }}>
          <h2 className="font-display text-lg text-ink">Add a key</h2>
          <Select label="Provider" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as AiProviderName })}>{Object.entries(NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Field label="Name for this key (optional)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Family key" />
          <Field label="Model" required value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} hint="Copy the model name from your provider’s documentation." />
          {f.provider === 'openai_compatible' && <Field label="Server address" required value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" />}
          <Field label={f.provider === 'openai_compatible' ? 'API key (if the server needs one)' : 'API key'} type="password" autoComplete="off" value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} />
          <div><Button type="submit" size="lg" loading={busy}>Save key</Button></div>
        </form>
      </div>
      <ChoiceDialog open={!!gone} danger title="Remove this key?" detail="AI features turn off if it is your only key." choices={[{ value: 'go', label: 'Remove key' }]} onChoose={() => { const id = gone!; setGone(null); guard(() => data.removeAiProvider(id), 'Key removed'); }} onCancel={() => setGone(null)} />
    </AdultGate>
  );
}
