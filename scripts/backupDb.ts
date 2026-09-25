import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { maybeUploadOffsite } from '../lib/backup/offsite';

const prisma = new PrismaClient();

// Rotating on-disk snapshots of the live SQLite database. This is layer 1 of backup — protects
// against a bad deploy/migration or an accidental delete corrupting/losing data, since every
// snapshot is a separate file next to the live db. It does NOT protect against losing the whole
// VPS/volume — that needs Pterodactyl's own server-level Backups feature (or a remote copy)
// configured on top of this, see PLANNING.md.
const BACKUP_DIR = path.join(process.cwd(), 'backups');
// 200 (≈ 8 days of hourly snapshots) as the default, not only as the cron job's override. It was 14
// here while the hourly cron passed 200 — and `deploy:prod` runs this same script with no override,
// so every deploy pruned the history back to 14 files. With several deploys a day that left about
// 16 hours of history instead of 8 days, and nothing looked wrong: the folder was always full.
const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT ?? 200);

// --snapshot-only: the snapshot and nothing else. Used by deploy:prod, which runs on every start
// and should not hold the server's startup up on an upload.
// --offsite-now: upload off-site now even if one was made in the last day (to test the setup).
const SNAPSHOT_ONLY = process.argv.includes('--snapshot-only');
const OFFSITE_NOW = process.argv.includes('--offsite-now');
const FILE_PREFIX = 'siqt-backup-';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const fileName = `${FILE_PREFIX}${timestamp()}.db`;
  const backupPath = path.join(BACKUP_DIR, fileName);

  // `VACUUM INTO` is SQLite's own documented way to snapshot a live database consistently —
  // unlike a plain file copy, it can't land mid-write and produce a corrupt/torn backup, even
  // while the app is actively serving requests against the same file.
  const escapedPath = backupPath.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);

  const sizeKb = (fs.statSync(backupPath).size / 1024).toFixed(1);
  console.log(`Backup written: ${backupPath} (${sizeKb} KB)`);

  // Prune anything beyond RETENTION_COUNT, oldest first — filenames are ISO-timestamp-ordered,
  // so a plain sort is chronological with no need to parse dates back out.
  const existing = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.db'))
    .sort();

  const toDelete = existing.slice(0, Math.max(0, existing.length - RETENTION_COUNT));
  for (const f of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log(`Pruned old backup: ${f}`);
  }

  console.log(`Done — ${existing.length - toDelete.length} backup(s) retained.`);

  // Once a day, the off-site copy (lib/backup/offsite.ts). This script already runs every hour from
  // the host's cron, which is what drives it.
  if (!SNAPSHOT_ONLY) await maybeUploadOffsite({ prisma, snapshotPath: backupPath, backupDir: BACKUP_DIR, force: OFFSITE_NOW });
}

main()
  .catch((err) => {
    console.error('Backup failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
