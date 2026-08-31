import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocAccess, ensureSpaceAccess } from '@/lib/auth/resourceAccess';

// Duplicate a Doc, with `targetSpaceId` doubling as paste-into-another-Space — same shape as the
// Task and List duplicate routes.
//
// Copies content, presentation, and the whole subpage tree. Two things deliberately don't come
// along:
//
// - `ydoc`, the Yjs collaborative-editing state. It encodes a document's own edit history and
//   client identities; cloning those bytes into a second document means two docs sharing one
//   history, which is genuinely undefined behavior for CRDT sync. Leaving it null makes the copy
//   initialise fresh from `content` on first open, which is exactly what a new document does.
// - Comments, since they're a conversation about the original.
const COPY_SUFFIX = ' (copy)';

const DOC_FIELDS = {
  id: true, title: true, content: true, color: true, textColor: true, order: true,
  coverImageUrl: true, subtitle: true, pageWidth: true, showLastModified: true,
  spaceId: true, folderId: true, boardFolderId: true, parentId: true, taskId: true,
  ownerId: true, contributorIdsJson: true,
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const source = await prisma.doc.findUnique({ where: { id }, select: DOC_FIELDS });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const targetSpaceId = typeof body.targetSpaceId === 'string' && body.targetSpaceId ? body.targetSpaceId : source.spaceId;
  if (targetSpaceId && targetSpaceId !== source.spaceId && !(await ensureSpaceAccess(targetSpaceId, userId))) {
    return NextResponse.json({ error: 'Not authorized for the destination space' }, { status: 403 });
  }
  // Both folder axes (the Docs-tab tree and the board's own Folder tree) are Space-scoped, so a
  // copy landing elsewhere starts at that Space's top level rather than pointing at a folder that
  // isn't there. See schema.prisma's own note on folderId vs boardFolderId being independent.
  const movedSpace = targetSpaceId !== source.spaceId;

  const created = await prisma.$transaction(async (tx) => {
    const copyDoc = async (node: typeof source, parentId: string | null, title: string) => {
      const copy = await tx.doc.create({
        data: {
          title,
          content: node.content,
          color: node.color,
          textColor: node.textColor,
          order: node.order,
          coverImageUrl: node.coverImageUrl,
          subtitle: node.subtitle,
          pageWidth: node.pageWidth,
          showLastModified: node.showLastModified,
          spaceId: targetSpaceId,
          folderId: movedSpace ? null : node.folderId,
          boardFolderId: movedSpace ? null : node.boardFolderId,
          // A duplicate is always a standalone doc, never re-attached to the original's task.
          taskId: null,
          parentId,
          // The person doing the duplicating owns the copy; contributors start empty, since
          // they're a record of who edited the original.
          ownerId: userId,
          contributorIdsJson: '[]',
        },
      });

      const children = await tx.doc.findMany({ where: { parentId: node.id, deletedAt: null }, select: DOC_FIELDS });
      for (const child of children) await copyDoc(child, copy.id, child.title);
      return copy;
    };

    return copyDoc(source, movedSpace ? null : source.parentId, `${source.title}${COPY_SUFFIX}`);
  });

  return NextResponse.json(created);
}
