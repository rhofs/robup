import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureSpaceAccess, ensureDocAccess } from '@/lib/auth/resourceAccess';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureSpaceAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this space' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // A subpage (parentId set) inherits spaceId from its parent doc server-side rather than trusting
  // whatever spaceId the client sent — the parent doc is the source of truth for which Space (and
  // therefore Workspace) the whole subtree belongs to. It also gets no folderId of its own; it's
  // reached only through the parent doc's own Subpages table/sidebar expansion, never the flat
  // folder listing.
  let spaceId = id;
  let folderId = body.folderId ?? null;
  let boardFolderId = body.boardFolderId ?? null;
  if (body.parentId) {
    // The parent doc can in principle live in a different Space than the one in the URL — check
    // the parent doc's own access directly rather than assuming the URL's already-checked space
    // covers it too, or a caller with access to Space A could smuggle a subpage into a private
    // Space B's doc tree just by naming one of its doc ids as parentId.
    if (!(await ensureDocAccess(body.parentId, userId))) {
      return NextResponse.json({ error: 'Not authorized for the parent doc' }, { status: 403 });
    }
    const parent = await prisma.doc.findUniqueOrThrow({ where: { id: body.parentId }, select: { spaceId: true } });
    spaceId = parent.spaceId ?? id;
    folderId = null;
    boardFolderId = null;
  }

  // Board-tab creation (boardFolderId explicitly present) interleaves with Lists at that same
  // Folder level (see lib/folderTree.ts's getBoardDocsIn + FolderTree.tsx's combined sort) — its
  // default order has to count Lists there too, not just Docs, or a fresh doc's order could tie
  // with an existing List's and land in a visually arbitrary spot instead of at the end.
  let order = body.order;
  if (order === undefined) {
    if (body.boardFolderId !== undefined) {
      const [listCount, docCount] = await Promise.all([
        prisma.list.count({ where: { spaceId, folderId: boardFolderId } }),
        prisma.doc.count({ where: { spaceId, boardFolderId, parentId: body.parentId ?? null } }),
      ]);
      order = listCount + docCount;
    } else {
      order = await prisma.doc.count({ where: { spaceId, folderId, parentId: body.parentId ?? null } });
    }
  }

  const doc = await prisma.doc.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      spaceId,
      folderId,
      boardFolderId,
      parentId: body.parentId ?? null,
      ownerId: userId,
      title: body.title || 'Untitled',
      content: body.content || '',
      order,
    },
  });
  return NextResponse.json(doc);
}
