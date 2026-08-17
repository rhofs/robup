import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth/session';

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const FILE_MAX_BYTES = 20 * 1024 * 1024;

// SVG deliberately excluded — it can carry inline <script>, unlike raster formats, and this
// endpoint writes straight into the public/ static folder with no further sanitization.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Non-image "file" attachments (chat only, see ALLOWED_CONTEXTS_FOR_FILES below) — an allowlist,
// not a denylist, specifically because this route writes straight into public/ with no per-file
// Content-Disposition control: anything a browser could execute inline if opened directly
// (html/htm/svg/js/xml) or the OS could execute (exe/msi/bat/cmd/sh/ps1/jar) is simply never on
// this list, same reasoning the image allowlist's own SVG exclusion already established. Extend
// this list deliberately, one type at a time — never widen it to "anything not obviously
// dangerous."
const ALLOWED_FILE_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

// Allowlisted, never taken as an arbitrary client-supplied path segment — this determines a real
// filesystem directory under public/uploads/, so anything not in this list is rejected outright
// rather than sanitized-and-allowed.
const ALLOWED_CONTEXTS = new Set(['docs', 'chat']);
// Non-image files are chat-only — Docs' image-insert modal has no "attach a file" concept, so
// there's no reason to widen its own upload surface just because chat now has one.
const CONTEXTS_ALLOWING_FILES = new Set(['chat']);

// Local-disk upload, shared by Docs (QA backlog #5, images only) and Chat (Phase 6 images, this
// pass's generic files). Files land under public/uploads/<context> (served statically by Next,
// same as any other public/ asset) named by a random uuid, never the client-supplied filename, so
// the returned URL is the only handle to the file and nothing about the original name/path is
// exposed. Route path kept as .../uploads/image for caller compatibility even though it now also
// serves non-image files — a URL segment, not a real behavioral constraint.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  // Defaults to 'docs' — the original, only caller before Phase 6 never sent a context at all.
  const contextRaw = form.get('context');
  const context = typeof contextRaw === 'string' && ALLOWED_CONTEXTS.has(contextRaw) ? contextRaw : 'docs';

  const imageExt = ALLOWED_IMAGE_TYPES[file.type];
  const fileExt = CONTEXTS_ALLOWING_FILES.has(context) ? ALLOWED_FILE_TYPES[file.type] : undefined;
  const kind: 'image' | 'file' = imageExt ? 'image' : 'file';
  const ext = imageExt ?? fileExt;

  if (!ext) {
    return NextResponse.json(
      { error: CONTEXTS_ALLOWING_FILES.has(context) ? 'Unsupported file type' : 'Unsupported image type — use PNG, JPEG, GIF, or WebP' },
      { status: 400 }
    );
  }
  const maxBytes = kind === 'image' ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)` }, { status: 413 });
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', context);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  return NextResponse.json({ url: `/uploads/${context}/${filename}`, kind });
}
