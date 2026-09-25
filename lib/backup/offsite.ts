import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { google } from 'googleapis';
import type { PrismaClient } from '@prisma/client';
import { createGoogleOAuthClient } from '../google/oauthClient';
import { encryptFile } from './crypto';

const run = promisify(execFile);

// The off-site half of the backup: once a day, the newest database snapshot and every uploaded file,
// packed into one archive, encrypted, and uploaded to a Google Drive folder called "Siqt backups".
//
// Why here and not a new cron job: the host's root crontab already runs `npm run backup:db:prod`
// every hour (PLANNING.md, "Infrastructure that lives outside this repo"), and adding a line to it
// needs root. Riding the hourly run and doing the upload only when the last success is older than
// OFFSITE_EVERY_HOURS gives one upload a day with nothing new to install — and a failed upload is
// retried the next hour by itself instead of waiting a day.
//
// Where it goes — two ways, the first preferred:
// 1. A company Shared Drive, through a Google service account (BACKUP_DRIVE_SERVICE_ACCOUNT +
//    BACKUP_DRIVE_FOLDER_ID). The backups then belong to the company, not to whoever set it up: they
//    survive that person leaving, changing password or disconnecting Google, and they use the
//    company's storage. A service account sees only what has been shared with it — the one folder.
//    This is what the user asked for ("heller ha det på New Game Media som har 14TB"), after first
//    seeing it would otherwise land in their private Gmail.
// 2. A person's own Drive, through the app's existing Google connection (BACKUP_GOOGLE_EMAIL): the
//    `drive.file` grant the Docs export already holds, which only reaches files this app created.
//    Kept as a fallback; it ties the company's backups to one person's account.
//
// What is in the archive (enough to rebuild everything a user can see):
//   siqt.db        — the whole database: tasks, subtasks, comments, docs (their content is the
//                    ydoc column), events, chat, spaces/lists/folders, custom fields, users
//   uploads/       — public/uploads: chat files, task attachments, images in docs, avatars
//   manifest.json  — when, which commit, and row counts, so a restore can be sanity-checked
//
// Configuration lives in /home/container/.env.backup (gitignored by `.env*`, so a reinstall's
// `git clean -fd` spares it), NOT in the panel's startup variables, which a client API key cannot
// add:
//   BACKUP_PASSPHRASE=...     encrypts the archive. Keep a copy in a password manager: without it
//                             every off-site backup is unreadable, by design.
//   BACKUP_DRIVE_SERVICE_ACCOUNT=./.env.backup-service-account.json   the service account's JSON key.
//                             Named `.env.*` on purpose: that pattern was already gitignored on the
//                             live checkout, so the key is spared by `git clean -fd` even by a
//                             reinstall running an older .gitignore.
//   BACKUP_DRIVE_FOLDER_ID=...   the folder in the Shared Drive — the id at the end of its URL
// or, instead of those two:
//   BACKUP_GOOGLE_EMAIL=...   whose in-app Google connection to upload with
const OFFSITE_EVERY_HOURS = 20;
const DRIVE_FOLDER_NAME = 'Siqt backups';
const DRIVE_KEEP = Number(process.env.BACKUP_DRIVE_KEEP ?? 30);

type OffsiteState = { lastSuccessAt?: string; lastFile?: string; lastBytes?: number; lastAttemptAt?: string; lastError?: string | null };

export function offsiteStatePath(backupDir: string) {
  return path.join(backupDir, 'offsite-state.json');
}

function readState(backupDir: string): OffsiteState {
  try {
    return JSON.parse(fs.readFileSync(offsiteStatePath(backupDir), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(backupDir: string, state: OffsiteState) {
  fs.writeFileSync(offsiteStatePath(backupDir), JSON.stringify(state, null, 2));
}

// KEY=VALUE lines, # comments. Deliberately tiny: dotenv is not a direct dependency here, and this
// file is written by hand.
function readBackupEnv(cwd: string): Record<string, string> {
  const file = path.join(cwd, '.env.backup');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function gitCommit(cwd: string): Promise<string | null> {
  try {
    return (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd })).stdout.trim();
  } catch {
    return null;
  }
}

export async function maybeUploadOffsite({
  prisma,
  snapshotPath,
  backupDir,
  cwd = process.cwd(),
  force = false,
}: {
  prisma: PrismaClient;
  snapshotPath: string;
  backupDir: string;
  cwd?: string;
  force?: boolean;
}): Promise<void> {
  const env = {
    ...readBackupEnv(cwd),
    ...pick(process.env, ['BACKUP_PASSPHRASE', 'BACKUP_GOOGLE_EMAIL', 'BACKUP_DRIVE_SERVICE_ACCOUNT', 'BACKUP_DRIVE_FOLDER_ID']),
  };
  const serviceAccount = env.BACKUP_DRIVE_SERVICE_ACCOUNT && env.BACKUP_DRIVE_FOLDER_ID;
  if (!env.BACKUP_PASSPHRASE || (!serviceAccount && !env.BACKUP_GOOGLE_EMAIL)) {
    console.log(
      'Off-site backup: not configured (.env.backup needs BACKUP_PASSPHRASE, and either BACKUP_DRIVE_SERVICE_ACCOUNT + ' +
        'BACKUP_DRIVE_FOLDER_ID or BACKUP_GOOGLE_EMAIL) — skipped.'
    );
    return;
  }

  const state = readState(backupDir);
  const hoursSince = state.lastSuccessAt ? (Date.now() - new Date(state.lastSuccessAt).getTime()) / 3_600_000 : Infinity;
  if (!force && hoursSince < OFFSITE_EVERY_HOURS) {
    console.log(`Off-site backup: last upload ${hoursSince.toFixed(1)}h ago — not due yet.`);
    return;
  }

  const attemptAt = new Date().toISOString();
  const work = path.join(backupDir, '.offsite-work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const stamp = attemptAt.replace(/[:.]/g, '-');
  const archive = path.join(work, `siqt-${stamp}.tar.gz`);
  const encrypted = path.join(work, `siqt-${stamp}.siqtbak`);

  try {
    const counts = await buildEncryptedArchive({ prisma, snapshotPath, cwd, work, archive, encrypted, passphrase: env.BACKUP_PASSPHRASE });
    const bytes = fs.statSync(encrypted).size;

    const drive = serviceAccount
      ? serviceAccountDrive(path.resolve(cwd, env.BACKUP_DRIVE_SERVICE_ACCOUNT))
      : await driveFor(prisma, env.BACKUP_GOOGLE_EMAIL);
    const folderId = serviceAccount ? env.BACKUP_DRIVE_FOLDER_ID : await ensureFolder(drive);
    await drive.files.create({
      requestBody: { name: path.basename(encrypted), parents: [folderId], description: `Siqt backup ${attemptAt} — ${JSON.stringify(counts)}` },
      media: { mimeType: 'application/octet-stream', body: fs.createReadStream(encrypted) },
      fields: 'id',
      // Required for a Shared Drive, harmless for a personal one.
      supportsAllDrives: true,
    });
    const pruned = await pruneFolder(drive, folderId);

    writeState(backupDir, { lastSuccessAt: attemptAt, lastFile: path.basename(encrypted), lastBytes: bytes, lastAttemptAt: attemptAt, lastError: null });
    console.log(
      `Off-site backup: uploaded ${path.basename(encrypted)} (${(bytes / 1024 / 1024).toFixed(1)} MB) to ` +
        `${serviceAccount ? 'the Shared Drive folder' : `Google Drive "${DRIVE_FOLDER_NAME}"`}` +
        `${pruned ? `, pruned ${pruned} old` : ''}.`
    );
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    writeState(backupDir, { ...state, lastAttemptAt: attemptAt, lastError: message.slice(0, 300) });
    console.error('Off-site backup FAILED:', message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}


// Packs and encrypts, without uploading — split out so the whole chain up to the upload can be
// tested on a scratch database, and restored with scripts/restoreBackup.ts to prove it round-trips.
export async function buildEncryptedArchive({
  prisma,
  snapshotPath,
  cwd,
  work,
  archive,
  encrypted,
  passphrase,
}: {
  prisma: PrismaClient;
  snapshotPath: string;
  cwd: string;
  work: string;
  archive: string;
  encrypted: string;
  passphrase: string;
}) {
  // Stage everything in one folder so tar needs a single -C (busybox tar, which a slim Node image
  // may have, does not reliably take several). Uploads are linked, not copied, and -h follows the
  // link — so a large uploads folder is read once, straight into the archive.
  fs.copyFileSync(snapshotPath, path.join(work, 'siqt.db'));
  const uploadsDir = path.join(cwd, 'public', 'uploads');
  const members = ['siqt.db', 'manifest.json'];
  if (fs.existsSync(uploadsDir)) {
    fs.symlinkSync(uploadsDir, path.join(work, 'uploads'));
    members.push('uploads');
  }
  const counts = await rowCounts(prisma);
  fs.writeFileSync(
    path.join(work, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), commit: await gitCommit(cwd), snapshot: path.basename(snapshotPath), counts }, null, 2)
  );
  await run('tar', ['-czhf', archive, '-C', work, ...members]);
  await encryptFile(archive, encrypted, passphrase);
  return counts;
}

function pick(src: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (src[k]) out[k] = src[k] as string;
  return out;
}

async function rowCounts(prisma: PrismaClient) {
  const [users, workspaces, tasks, comments, docs, events, messages] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.task.count(),
    prisma.comment.count(),
    prisma.doc.count(),
    prisma.event.count(),
    prisma.chatMessage.count(),
  ]);
  return { users, workspaces, tasks, comments, docs, events, messages };
}

async function driveFor(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { googleEmail: email }] },
    select: { googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken) {
    throw new Error(`No connected Google account for ${email} — connect Google in the app (Settings) with that account first.`);
  }
  const auth = createGoogleOAuthClient();
  auth.setCredentials({ refresh_token: user.googleRefreshToken });
  return google.drive({ version: 'v3', auth });
}

type Drive = ReturnType<typeof google.drive>;

// The full `drive` scope, which sounds broader than it is: a service account owns no files of its
// own and sees only what has been shared with it — here, the one backup folder. `drive.file` would
// not do, because it cannot see a folder a human created and shared.
function serviceAccountDrive(keyFile: string): Drive {
  if (!fs.existsSync(keyFile)) throw new Error(`Service account key not found at ${keyFile}.`);
  const auth = new google.auth.GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}

async function ensureFolder(drive: Drive): Promise<string> {
  const found = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id!;
}

// Keeps the newest DRIVE_KEEP archives (30 ≈ a month of dailies). Only files named *.siqtbak in the
// backup folder are ever considered, so nothing else put there by a person is touched.
async function pruneFolder(drive: Drive, folderId: string): Promise<number> {
  const list = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name contains '.siqtbak'`,
    orderBy: 'createdTime desc',
    fields: 'files(id,name)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const old = (list.data.files ?? []).slice(DRIVE_KEEP);
  // Trashed, not deleted. On a Shared Drive a Content manager ("Innholdsansvarlig" — the role the
  // service account was given, on purpose the least that works) may trash but not delete; only a
  // Manager can, and a backup job has no business holding that. Drive empties a Shared Drive's trash
  // by itself after 30 days, and until then a pruned backup can still be pulled back out.
  for (const f of old) await drive.files.update({ fileId: f.id!, requestBody: { trashed: true }, supportsAllDrives: true });
  return old.length;
}
