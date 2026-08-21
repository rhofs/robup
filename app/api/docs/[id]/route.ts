import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cascadeDoc } from '@/lib/trashCascade';
import { archiveDoc } from '@/lib/archiveCascade';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureDocAccess } from '@/lib/auth/resourceAccess';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  if (body.restore === true) {
    await cascadeDoc(id, null);
    const doc = await prisma.doc.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(doc);
  }

  // Archiving/restoring cascades to every subpage in this doc's own subtree
  // (lib/archiveCascade.ts) — handled separately from the generic `data` update below, same
  // pattern as the `restore` branch just above.
  if (body.archived !== undefined) {
    await archiveDoc(id, body.archived);
    const doc = await prisma.doc.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(doc);
  }

  // `content` is deliberately not accepted here — once a doc has ever been opened in the
  // collaborative editor, its content is owned by server/collabServer.ts (the live Yjs doc plus
  // the plain-text mirror it writes on every persist). A raw PATCH here would race the sidecar's
  // own writes and could clobber live edits.
  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.color !== undefined) data.color = body.color;
  if (body.textColor !== undefined) data.textColor = body.textColor;
  if (body.order !== undefined) data.order = body.order;
  if (body.taskId !== undefined) data.taskId = body.taskId;
  if (body.folderId !== undefined) data.folderId = body.folderId;
  if (body.boardFolderId !== undefined) data.boardFolderId = body.boardFolderId;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;
  if (body.parentId !== undefined) data.parentId = body.parentId;
  if (body.ownerId !== undefined) data.ownerId = body.ownerId;
  if (body.contributorIds !== undefined) data.contributorIdsJson = JSON.stringify(body.contributorIds);
  if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle;
  if (body.pageWidth !== undefined) data.pageWidth = body.pageWidth;
  if (body.showLastModified !== undefined) data.showLastModified = body.showLastModified;

  const doc = await prisma.doc.update({
    where: { id },
    data,
  });
  return NextResponse.json(doc);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureDocAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this doc' }, { status: 403 });

  const url = new URL(req.url);
  const permanent = url.searchParams.get('permanent') === 'true';
  let doc;
  if (permanent) {
    // The FK's own onDelete: Cascade already hard-deletes the full subpage subtree.
    doc = await prisma.doc.delete({ where: { id } });
  } else {
    doc = await prisma.doc.findUniqueOrThrow({ where: { id } });
    await cascadeDoc(id, new Date());
  }
  // Activity & Comments is a task-scoped concept — a standalone (Space/DocFolder) doc has no
  // task to log against, so only write the activity entry when this doc actually belonged to one.
  if (doc.taskId) {
    await prisma.comment.create({
      data: {
        taskId: doc.taskId,
        body: `Dokument slettet: «${doc.title}»`,
        type: 'activity',
        activityKind: 'docDeleted',
        // The real signed-in caller, not a client-supplied ?authorId= query param this used to
        // trust directly — same spoofable-identity fix applied everywhere else this pattern was
        // found (see PLANNING.md's 2026-08-21 session entries).
        authorId: userId,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
