// Reads .env.local / .env the way `next dev` does, for scripts and the worker. Real environment variables win.
import * as ne from '@next/env';
const m = ne as unknown as { loadEnvConfig?: (d: string) => void; default?: { loadEnvConfig: (d: string) => void } };
(m.loadEnvConfig ?? m.default!.loadEnvConfig)(process.cwd());
