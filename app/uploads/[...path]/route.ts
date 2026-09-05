import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth/session';

// Serves the files written by POST /api/uploads/image.
//
// Those land in public/uploads/<context>/ at RUNTIME, and Next does not serve files that appear in
// public/ after the server started — verified directly rather than assumed: with one file present
// at build time and one written afterwards, the first returns 200 and the second 404. So every
// chat attachment and Doc image uploaded since the last restart was broken, while appearing to
// work right up until someone restarted the server and they silently began resolving again.
// Reported by a user whose screenshot upload showed an error and whose /uploads/chat/... URL
// returned "404 This page could not be found".
//
// A route handler reads the disk per request, so it has no such build-time notion. Files that DID
// exist at build time are still served by the static handler before this ever runs — this catches
// exactly the ones that would otherwise 404, which is why the stored URLs need no migration.
const ALLOWED_CONTEXTS = new Set(['docs', 'chat']);

// uuid.ext, matching exactly what the upload route generates. Anything else is refused outright
// rather than sanitized: the filename is machine-generated, so there is no legitimate shape other
// than this one, and an allowlist of the known-good form leaves no room for traversal sequences or
// surprising characters to be reasoned about at all.
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/;

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', mov: 'video/quicktime',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // Same bar proxy.ts already applies to this path today (it gates every non-API page route,
  // /uploads included) — restated here because a route handler is not covered by that matcher, and
  // losing the check silently while "only changing how the file is read" would be a real
  // regression.
  if (!(await getCurrentUserId())) return new NextResponse('Not found', { status: 404 });

  const { path: segments } = await params;
  if (segments.length !== 2) return new NextResponse('Not found', { status: 404 });
  const [context, filename] = segments;
  if (!ALLOWED_CONTEXTS.has(context) || !FILENAME_RE.test(filename)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', context, filename);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return new NextResponse('Not found', { status: 404 });
    const body = await readFile(filePath);
    const ext = filename.split('.').pop()!;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Content-Length': String(info.size),
        // Immutable: the name is a uuid generated per upload, so a given URL's bytes can never
        // change. Private, because these are only served to a signed-in caller and must not be
        // held in a shared cache.
        'Cache-Control': 'private, max-age=31536000, immutable',
        // Nothing here is ever meant to be interpreted as a document by the browser.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
