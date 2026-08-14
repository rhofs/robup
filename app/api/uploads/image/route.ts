import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getCurrentUserId } from '@/lib/auth/session';

const MAX_BYTES = 8 * 1024 * 1024;
// SVG deliberately excluded — it can carry inline <script>, unlike raster formats, and this
// endpoint writes straight into the public/ static folder with no further sanitization.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Local-disk image upload for Docs (QA backlog #5) — the image-insert modal was URL-only until
// now. Files land under public/uploads/docs (served statically by Next, same as any other public/
// asset) named by a random uuid, never the client-supplied filename, so the returned URL is the
// only handle to the file and nothing about the original name/path is exposed.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported image type — use PNG, JPEG, GIF, or WebP' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 8MB)' }, { status: 413 });
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', 'docs');
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  return NextResponse.json({ url: `/uploads/docs/${filename}` });
}
