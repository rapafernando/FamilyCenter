// Settings for the whole server (not one household), kept in the database so the person who runs it can change them from Settings.
// A value saved here wins over the same value in the environment file; with nothing saved, the environment file is used.
import { plain } from './db';
import { decrypt, encrypt } from './crypto';
import { env } from './env';

type Kind = 'app' | 'worker';
type Row = { value: string | null; secret_encrypted: Buffer | null; secret_key_id: number | null };

export async function getSetting(key: string, kind: Kind = 'app'): Promise<{ value: string | null; secret: string | null }> {
  const r = await plain((t) => t.one<Row>('select value, secret_encrypted, secret_key_id from instance_settings where key = $1', [key]), kind);
  if (!r) return { value: null, secret: null };
  return { value: r.value, secret: r.secret_encrypted && r.secret_key_id !== null ? decrypt(r.secret_encrypted, r.secret_key_id) : null };
}

export async function putSetting(key: string, o: { value?: string | null; secret?: string | null }, by: string | null = null) {
  const enc = o.secret ? encrypt(o.secret) : null;
  await plain((t) => t.exec(
    `insert into instance_settings (key, value, secret_encrypted, secret_key_id, updated_by) values ($1,$2,$3,$4,$5)
     on conflict (key) do update set value = $2, secret_encrypted = $3, secret_key_id = $4, updated_at = now(), updated_by = $5`,
    [key, o.value ?? null, enc?.data ?? null, enc?.keyId ?? null, by]));
}

export async function deleteSetting(key: string) { await plain((t) => t.exec('delete from instance_settings where key = $1', [key])); }

/* ------------------------------------------------------------------ Google sign-in client */
export type GoogleConfig = { clientId: string; clientSecret: string; status: 'testing' | 'production'; source: 'settings' | 'env' | 'none' };

/** The Google client the app signs in with: saved in Settings, or from the environment file, or neither. */
export async function googleConfig(kind: Kind = 'app'): Promise<GoogleConfig> {
  const id = await getSetting('google_client', kind);
  const st = await getSetting('google_status', kind);
  const status = (st.value === 'production' ? 'production' : st.value === 'testing' ? 'testing' : env.googleOauthStatus);
  if (id.value && id.secret) return { clientId: id.value, clientSecret: id.secret, status, source: 'settings' };
  if (env.googleClientId && env.googleClientSecret) return { clientId: env.googleClientId, clientSecret: env.googleClientSecret, status, source: 'env' };
  return { clientId: '', clientSecret: '', status, source: 'none' };
}
