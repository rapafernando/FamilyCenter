import { ApiError } from '@/lib/types';
import { seed } from '@/lib/data/state';
import { plain } from '../db';
import { env } from '../env';
import { hashPassword, randomToken } from '../crypto';
import { def, limit, registry, startSession } from '../rpc';
import { core, createHousehold } from './core';
import { calendar } from './calendar';
import { family } from './family';
import { media } from './media';
import { account } from './account';
import { connections } from '../google';
import { ai } from '../ai';
import { admin } from '../admin';
import { photoImports } from '../gphotos';
import { importState } from '../seed';

/** A throwaway household filled with made-up people, for trying the app. Off unless ALLOW_DEMO=true. */
const demo = {
  startDemo: def('public', [], async (c) => {
    if (!env.allowDemo) throw new ApiError('forbidden', 'The demo is not switched on here.');
    limit(`demo:${c.ip}`, 5, 3600_000);
    const s = seed();
    const who = s.members.find((m) => m.isYou)?.name ?? 'Sam';
    const u = await plain((t) => t.one<{ id: string; session_version: number }>('insert into users (email, name, password_hash) values ($1,$2,$3) returning id, session_version', [`demo-${randomToken(9).toLowerCase()}@demo.invalid`, who, null as unknown as string]));
    const hid = await createHousehold(u!.id, s.household.name, who, s.household.timezone);
    await importState(hid, s, who);
    startSession(c.jar, u!.id, hid, u!.session_version);
  }),
};
void hashPassword;

let ready = false;
export function ensureRegistry() {
  if (ready) return;
  ready = true;
  for (const group of [core, account, calendar, family, media, connections, ai, admin, photoImports, demo]) {
    for (const [name, d] of Object.entries(group)) {
      if (name in registry) throw new Error(`Two handlers are called ${name}`);
      registry[name] = d as never;
    }
  }
}
