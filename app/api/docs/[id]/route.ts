import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.restore === true) {
    const doc = await prisma.doc.update({ where: { id }, data: { deletedAt: null } });
    return NextResponse.json(doc);
  }

  // `content` is deliberately not accepted here — once a doc has ever been opened in the
  // collaborative editor, its content is owned by server/collabServer.ts (the live Yjs doc plus
  // the plain-text mirror it writes on every persist). A raw PATCH here would race the sidecar's
  // own writes and could clobber live edits.
  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;
  if (body.taskId !== undefined) data.taskId = body.taskId;
  if (body.folderId !== undefined) data.folderId = body.folderId;
  if (body.spaceId !== undefined) data.spaceId = body.spaceId;

  const doc = await prisma.doc.update({
    where: { id },
    data,
  });
  return NextResponse.json(doc);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const authorId = url.searchParams.get('authorId');
  const permanent = url.searchParams.get('permanent') === 'true';
  const doc = permanent
    ? await prisma.doc.delete({ where: { id } })
    : await prisma.doc.update({ where: { id }, data: { deletedAt: new Date() } });
  // Activity & Comments is a task-scoped concept — a standalone (Space/DocFolder) doc has no
  // task to log against, so only write the activity entry when this doc actually belonged to one.
  if (doc.taskId) {
    await prisma.comment.create({
      data: {
        taskId: doc.taskId,
        body: `Dokument slettet: «${doc.title}»`,
        type: 'activity',
        activityKind: 'docDeleted',
        authorId: authorId || null,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
