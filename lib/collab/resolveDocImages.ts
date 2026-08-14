import fs from 'fs/promises';
import path from 'path';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const PUBLIC_DIR = path.join(process.cwd(), 'public');

function collectImageSrcs(node: any, out: Set<string>) {
  if (!node) return;
  if (node.type === 'image' && node.attrs?.src) out.add(node.attrs.src);
  (node.content ?? []).forEach((child: any) => collectImageSrcs(child, out));
}

async function resolveOne(src: string): Promise<Buffer | null> {
  try {
    if (src.startsWith('data:')) {
      const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(src);
      return match ? Buffer.from(match[1], 'base64') : null;
    }
    if (src.startsWith('/')) {
      // A same-origin path — in practice always our own upload (see app/api/uploads/image), but
      // the URL-paste field accepts any string a user types, including a deliberately crafted
      // "/../../.env"-style path. `src` is untrusted, so guard against escaping public/ via a
      // resolved-path prefix check rather than trusting the leading slash alone.
      const diskPath = path.join(PUBLIC_DIR, src);
      if (!diskPath.startsWith(PUBLIC_DIR)) return null;
      const stat = await fs.stat(diskPath).catch(() => null);
      if (!stat || !stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null;
      return await fs.readFile(diskPath);
    }
    if (/^https?:\/\//.test(src)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length <= MAX_IMAGE_BYTES ? buf : null;
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Every real-image export path needs this same fetch-everything-up-front step, since the actual
// embed calls (pdfkit's doc.image()) are synchronous and the doc-JSON tree walk they run inside
// is otherwise synchronous too. Failed/unsupported/oversized images simply aren't in the returned
// map — callers fall back to their own placeholder for those srcs instead of throwing.
export async function resolveDocImages(json: { content?: any[] }): Promise<Map<string, Buffer>> {
  const srcs = new Set<string>();
  (json.content ?? []).forEach((node) => collectImageSrcs(node, srcs));
  const entries = await Promise.all(Array.from(srcs).map(async (src) => [src, await resolveOne(src)] as const));
  const map = new Map<string, Buffer>();
  for (const [src, buf] of entries) if (buf) map.set(src, buf);
  return map;
}
