import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWikiPageAccess } from '@/lib/auth/wikiAccess';
import { cascadeDoc } from '@/lib/trashCascade';

// Rename, reorder or move a wiki page. Content is not accepted here — it belongs to the collab
// server, same rule as /api/docs/[id].
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id: workspaceId, pageId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiPageAccess(pageId, userId);
  if (!access || access.doc.wikiWorkspaceId !== workspaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ error: 'Only wiki editors can change pages' }, { status: 403 });

  const body = await req.json();
  const data: { title?: string; order?: number; parentId?: string | null } = {};
  if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200) || 'Untitled';
  if (typeof body.order === 'number') data.order = body.order;
  if (body.parentId !== undefined) {
    const parentId: string | null = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
    if (parentId) {
      const parent = await prisma.doc.findFirst({ where: { id: parentId, wikiWorkspaceId: workspaceId, deletedAt: null }, select: { id: true } });
      if (!parent) return NextResponse.json({ error: 'Parent page not found' }, { status: 404 });
      // Not under itself or anything beneath it — that would cut the page and its subtree off from
      // the book in a loop.
      for (let id: string | null = parentId, guard = 0; id && guard < 50; guard++) {
        if (id === pageId) return NextResponse.json({ error: 'A page cannot go inside its own subpages' }, { status: 400 });
        const row: { parentId: string | null } | null = await prisma.doc.findUnique({ where: { id }, select: { parentId: true } });
        id = row?.parentId ?? null;
      }
    }
    data.parentId = parentId;
  }
  const page = await prisma.doc.update({ where: { id: pageId }, data, select: { id: true, title: true, parentId: true, order: true, updatedAt: true } });
  return NextResponse.json(page);
}

// Moves the page — and a chapter's pages with it — to the trash (deletedAt), the same soft delete
// every other Doc gets. Recoverable from the database and its backups; the wiki itself shows no
// trash yet.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const { id: workspaceId, pageId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiPageAccess(pageId, userId);
  if (!access || access.doc.wikiWorkspaceId !== workspaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ error: 'Only wiki editors can delete pages' }, { status: 403 });
  await cascadeDoc(pageId, new Date());
  return NextResponse.json({ ok: true });
}
