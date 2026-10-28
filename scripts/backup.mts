import '../src/server/loadenv.ts';
import { backupNow } from '../src/server/backup.ts';
backupNow().then((r) => console.log('Backup written:\n' + r.files.join('\n'))).catch((e) => { console.error('Backup failed:', e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, 'postgres://…') : e); process.exit(1); });
