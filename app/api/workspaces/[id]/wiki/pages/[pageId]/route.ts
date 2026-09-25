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
    const parentId: string | null = body.parentId;
    if (parentId) {
      const parent = await prisma.doc.findFirst({ where: { id: parentId, wikiWorkspaceId: workspaceId, deletedAt: null }, select: { parentId: true } });
      if (!parent || parent.parentId) return NextResponse.json({ error: 'Pages can only go inside a chapter' }, { status: 400 });
      // A chapter with pages of its own cannot become a page — that would make a third level.
      const hasChildren = await prisma.doc.count({ where: { parentId: pageId, deletedAt: null } });
      if (hasChildren) return NextResponse.json({ error: 'Move this chapter\'s pages out first' }, { status: 400 });
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
