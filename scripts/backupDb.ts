import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Rotating on-disk snapshots of the live SQLite database. This is layer 1 of backup — protects
// against a bad deploy/migration or an accidental delete corrupting/losing data, since every
// snapshot is a separate file next to the live db. It does NOT protect against losing the whole
// VPS/volume — that needs Pterodactyl's own server-level Backups feature (or a remote copy)
// configured on top of this, see PLANNING.md.
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT ?? 14);
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
}

main()
  .catch((err) => {
    console.error('Backup failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
