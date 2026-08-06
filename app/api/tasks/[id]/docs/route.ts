import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docs = await prisma.doc.findMany({
    where: { taskId: id, deletedAt: null },
    orderBy: { order: 'asc' },
  });
  return NextResponse.json(docs);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const order = await prisma.doc.count({ where: { taskId: id } });
  const doc = await prisma.doc.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      taskId: id,
      title: body.title || 'Untitled',
      content: body.content || '',
      order: body.order ?? order,
    },
  });

  // Same rule as task creation: only a fresh interactive create logs — an id-based create is a
  // snapshot restore (which replays the original activity comments verbatim) or a redo.
  if (!body.id) {
    await prisma.comment.create({
      data: {
        taskId: id,
        body: `Dokument opprettet: «${doc.title}»`,
        type: 'activity',
        activityKind: 'docCreated',
        authorId: body.authorId ?? null,
      },
    });
  }

  return NextResponse.json(doc);
}