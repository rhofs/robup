import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getWikiAccess } from '@/lib/auth/wikiAccess';
import { contentFromJSON, EMPTY_PAGE } from '@/lib/wiki/seed';

// A new chapter (no parentId), or a page under any existing page — a subpage can have subpages of its
// own. It was two levels (chapter, page) until the user brought a wiki whose templates are three deep
// (Mal-bibliotek → Ekstrem Gjemsel S3 → Deltakerkontrakt) and asked for subpages.
const MAX_DEPTH = 6;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const access = await getWikiAccess(workspaceId, userId);
  if (!access?.canEdit) return NextResponse.json({ error: 'Only wiki editors can add pages' }, { status: 403 });

  const body = await req.json();
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled';
  // An empty string is "no parent" too, not an id that will fail as a foreign key.
  const parentId: string | null = typeof body.parentId === 'string' && body.parentId ? body.parentId : null;
  if (parentId) {
    const parent = await prisma.doc.findFirst({ where: { id: parentId, wikiWorkspaceId: workspaceId, deletedAt: null }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: 'Parent page not found' }, { status: 404 });
    if ((await depthOf(parentId)) >= MAX_DEPTH) return NextResponse.json({ error: 'That is as deep as the wiki goes' }, { status: 400 });
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

// How deep a page sits: 1 for a chapter. Walks up the parent chain; a wiki is a few levels, not many.
async function depthOf(pageId: string): Promise<number> {
  let depth = 0;
  for (let id: string | null = pageId; id && depth < 50; depth++) {
    const row: { parentId: string | null } | null = await prisma.doc.findUnique({ where: { id }, select: { parentId: true } });
    id = row?.parentId ?? null;
  }
  return depth;
}
