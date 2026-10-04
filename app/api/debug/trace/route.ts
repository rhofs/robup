import { NextResponse } from 'next/server';
import { appendFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth/session';

// Receives the temporary on-device frame traces from lib/perfTrace.ts and appends them, one JSON line
// each, to logs/client-traces.jsonl in the server's working directory (gitignored, so a reinstall's
// `git clean -fd` leaves it). Signed-in users only; capped at 2 MB so it cannot grow without bound.
// Remove together with lib/perfTrace.ts.
const FILE = path.join(process.cwd(), 'logs', 'client-traces.jsonl');

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const text = await req.text();
  if (text.length > 200_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
  await mkdir(path.dirname(FILE), { recursive: true });
  const size = await stat(FILE).then((s) => s.size).catch(() => 0);
  if (size > 2_000_000) return NextResponse.json({ ok: false, reason: 'full' });
  await appendFile(FILE, JSON.stringify({ at: new Date().toISOString(), userId, trace: JSON.parse(text) }) + '\n');
  return NextResponse.json({ ok: true });
}
