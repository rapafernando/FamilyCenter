// All settings come from environment variables. Read lazily so `next build` works without them.
const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
};
const opt = (name: string, d = ''): string => process.env[name] ?? d;

export const env = {
  get databaseUrl() { return need('DATABASE_URL'); },
  get workerDatabaseUrl() { return opt('WORKER_DATABASE_URL') || need('DATABASE_URL'); },
  get authSecret() { const s = need('AUTH_SECRET'); if (s.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters.'); return s; },
  get encryptionKeys() { return need('APP_ENCRYPTION_KEYS'); },
  get baseUrl() { return opt('BASE_URL').replace(/\/$/, ''); },
  get secureCookies() { return opt('BASE_URL').startsWith('https://') || opt('COOKIE_SECURE') === 'true'; },
  get photoDir() { return opt('PHOTO_DIR', './data/photos'); },
  get googleClientId() { return opt('GOOGLE_CLIENT_ID'); },
  get googleClientSecret() { return opt('GOOGLE_CLIENT_SECRET'); },
  get googleOauthStatus() { return opt('GOOGLE_OAUTH_STATUS', 'testing') as 'testing' | 'production'; },
  // Overridable so tests can point at a local stand-in for Google.
  get googleAuthUrl() { return opt('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth'); },
  get googleTokenUrl() { return opt('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token'); },
  get googleRevokeUrl() { return opt('GOOGLE_REVOKE_URL', 'https://oauth2.googleapis.com/revoke'); },
  get googleApiBase() { return opt('GOOGLE_API_BASE', 'https://www.googleapis.com/calendar/v3'); },
  get allowDemo() { return opt('ALLOW_DEMO') === 'true'; },
  get adsDefaultOn() { return opt('ADS_DEFAULT_ON') === 'true'; },
  get allowPrivateAiUrls() { return opt('ALLOW_PRIVATE_AI_URLS', 'true') === 'true'; },
  smtp() {
    const host = opt('SMTP_HOST'); if (!host) return null;
    return { host, port: Number(opt('SMTP_PORT', '587')), user: opt('SMTP_USER'), pass: opt('SMTP_PASS'), from: opt('SMTP_FROM', 'Family Calendar <no-reply@localhost>') };
  },
  get aiDailyCallCap() { return Number(opt('AI_DAILY_CALL_CAP', '50')); },
};
