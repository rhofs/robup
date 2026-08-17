import { prisma } from '@/lib/prisma';
import { loadDocJSONForExport } from '@/lib/collab/loadDocForExport';
import { docJSONToPlainText } from '@/lib/collab/docJSONToPlainText';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocAccess } from '@/lib/auth/resourceAccess';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Not authenticated', { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return new Response('Not authorized for this doc', { status: 403 });

  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return new Response('Not found', { status: 404 });

  const json = loadDocJSONForExport(doc);
  const title = doc.title || 'Untitled';
  const body = `${title}\n\n${docJSONToPlainText(json)}`;

  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}.txt"`,
      'Cache-Control': 'no-store',
    },
  });
}
