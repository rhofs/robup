import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { decryptFile } from '../lib/backup/crypto';

const run = promisify(execFile);

// Opens an off-site backup (.siqtbak, downloaded from the "Siqt backups" folder in Google Drive) into
// a plain folder:  siqt.db, uploads/, manifest.json.
//
//   npm run backup:restore -- <file.siqtbak> [output-folder]
//
// The passphrase comes from BACKUP_PASSPHRASE in the environment or in .env.backup — the same one
// that encrypted it. Works on any machine with Node and this repo, which is the point: if the server
// is gone, this is how the data comes back.
//
// It never touches the live database. What to do with the result is a separate, deliberate step:
// - whole-site rollback: stop the server, replace prisma/siqt.db with the restored siqt.db and
//   public/uploads with the restored uploads/, start it again;
// - one thing deleted by mistake: open the restored siqt.db (e.g. `npx prisma studio` with
//   DATABASE_URL pointing at it) and copy back only what is missing — a full rollback would also
//   throw away everyone's work since the backup was taken.
// (The hourly snapshots in backups/ are plain .db files and need none of this.)

function passphrase(): string {
  if (process.env.BACKUP_PASSPHRASE) return process.env.BACKUP_PASSPHRASE;
  const file = path.join(process.cwd(), '.env.backup');
  if (fs.existsSync(file)) {
    const m = fs.readFileSync(file, 'utf8').match(/^\s*BACKUP_PASSPHRASE\s*=\s*(.*?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('No passphrase: set BACKUP_PASSPHRASE, or put it in .env.backup.');
}

async function main() {
  const [input, outArg] = process.argv.slice(2);
  if (!input) {
    console.log('Usage: npm run backup:restore -- <file.siqtbak> [output-folder]');
    process.exitCode = 1;
    return;
  }
  const out = path.resolve(outArg ?? `restored-${path.basename(input, '.siqtbak')}`);
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw new Error(`${out} already exists and is not empty.`);
  fs.mkdirSync(out, { recursive: true });

  const archive = path.join(out, '.archive.tar.gz');
  await decryptFile(input, archive, passphrase());
  await run('tar', ['-xzf', archive, '-C', out]);
  fs.rmSync(archive);

  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  console.log(`Restored into ${out}`);
  console.log(`  taken:  ${manifest.createdAt}  (commit ${manifest.commit ?? '?'})`);
  console.log(`  counts: ${JSON.stringify(manifest.counts)}`);
  console.log(`  files:  ${fs.readdirSync(out).join(', ')}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
