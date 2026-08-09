import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getTaskVisibilityContext } from '@/lib/auth/access';

export async function GET() {
  const userId = await getCurrentUserId();
  // Same "no identity, no data" rule as GET /api/workspaces — a private workspace's tasks must
  // never be sent to a request that isn't asserting a member's identity.
  if (!userId) return NextResponse.json([]);

  const visibility = await getTaskVisibilityContext(userId);
  if (!visibility) return NextResponse.json([]);

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, list: { space: { workspace: { memberships: { some: { userId } } } } } },
    include: {
      assignees: { select: publicUserSelect },
      list: { select: { isPrivate: true, accessJson: true, folderId: true, space: { select: { isPrivate: true, accessJson: true, workspaceId: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const visible = tasks.filter((t) => visibility.isTaskVisible(t)).map(({ list, ...t }) => t);

  return NextResponse.json(visible);
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