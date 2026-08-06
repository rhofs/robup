import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.content !== undefined) data.content = body.content;
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
  const authorId = new URL(req.url).searchParams.get('authorId');
  const doc = await prisma.doc.delete({ where: { id } });
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
