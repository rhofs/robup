import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWikiAccess } from '@/lib/auth/wikiAccess';
import { contentFromJSON, EMPTY_PAGE } from '@/lib/wiki/seed';

// A new chapter (no parentId) or a new page in a chapter. Two levels only — a book has chapters and
// pages; a page inside a page would be a folder tree, which is what Docs already is.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiAccess(workspaceId, userId);
  if (!access?.canEdit) return NextResponse.json({ error: 'Only wiki editors can add pages' }, { status: 403 });

  const body = await req.json();
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled';
  const parentId: string | null = typeof body.parentId === 'string' ? body.parentId : null;
  if (parentId) {
    const parent = await prisma.doc.findFirst({ where: { id: parentId, wikiWorkspaceId: workspaceId, deletedAt: null }, select: { parentId: true } });
    if (!parent) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    if (parent.parentId) return NextResponse.json({ error: 'Pages can only go inside a chapter' }, { status: 400 });
  }

  const last = await prisma.doc.findFirst({
    where: { wikiWorkspaceId: workspaceId, parentId, deletedAt: null },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const page = await prisma.doc.create({
    data: { wikiWorkspaceId: workspaceId, parentId, title, order: (last?.order ?? -1) + 1, ownerId: userId, ...contentFromJSON(EMPTY_PAGE) },
    select: { id: true, title: true, parentId: true, order: true, content: true, updatedAt: true },
  });
  const { content, ...rest } = page;
  return NextResponse.json({ ...rest, text: content });
}
