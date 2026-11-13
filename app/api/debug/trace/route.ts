import { NextResponse } from 'next/server';
import { appendFile, mkdir, rename, stat } from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth/session';

// Receives the temporary on-device frame traces from lib/perfTrace.ts and appends them, one JSON line
// each, to logs/client-traces.jsonl in the server's working directory (gitignored, so a reinstall's
// `git clean -fd` leaves it). Signed-in users only; capped so it cannot grow without bound.
//
// The cap used to be a full stop: past 2 MB every trace was answered `full` and dropped. The file
// filled on 2026-10-19 and nothing was recorded after that — found a month later, when a new report
// of stutter had no traces to go with it. So it rotates instead: the full file becomes
// client-traces.1.jsonl (replacing the previous one) and a new one starts. At most ~4 MB on disk,
// and the newest traces — the only ones anyone asks about — are always the ones kept.
// Remove together with lib/perfTrace.ts.
const FILE = path.join(process.cwd(), 'logs', 'client-traces.jsonl');
const PREVIOUS = path.join(process.cwd(), 'logs', 'client-traces.1.jsonl');

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const text = await req.text();
  if (text.length > 200_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
  await mkdir(path.dirname(FILE), { recursive: true });
  const size = await stat(FILE).then((s) => s.size).catch(() => 0);
  if (size > 2_000_000) await rename(FILE, PREVIOUS).catch(() => {});
  await appendFile(FILE, JSON.stringify({ at: new Date().toISOString(), userId, trace: JSON.parse(text) }) + '\n');
  return NextResponse.json({ ok: true });
}
