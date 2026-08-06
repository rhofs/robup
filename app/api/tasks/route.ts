import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    include: { assignees: { select: publicUserSelect } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      ...(body.id ? { id: body.id } : {}),
      title: body.title,
      listId: body.listId,
      parentId: body.parentId ?? null,
      status: body.status ?? 'To Do',
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
    include: { assignees: { select: publicUserSelect } },
  });

  // Only a genuinely fresh interactive create logs activity — an id-based create is always
  // either a snapshot restore (which replays the original activity comments verbatim) or a
  // redo-of-create, neither of which should generate a second, synthetic one.
  if (!body.id) {
    await prisma.comment.create({
      data: {
        taskId: task.id,
        body: 'Oppgave opprettet',
        type: 'activity',
        activityKind: 'created',
        authorId: body.authorId ?? null,
      },
    });
    // A task created directly as a subtask also logs on its immediate parent — but only that
    // one level, never further up the chain (the parent's own parent doesn't hear about it).
    if (body.parentId) {
      await prisma.comment.create({
        data: {
          taskId: body.parentId,
          body: `Underoppgave lagt til: «${task.title}»`,
          type: 'activity',
          activityKind: 'subtaskAdded',
          authorId: body.authorId ?? null,
        },
      });
    }
  }

  return NextResponse.json(task);
}