import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// When each of my tasks was assigned to me — for My Assigned Tasks' "Recently assigned" sort. There
// is no timestamp on the assignment itself (Task.assignees is an implicit many-to-many), so it is
// read off what assigning leaves behind: the "assigned you a task" notification (exact, per person)
// and, for assignments that never notified (assigning yourself), the task's "Tildelt: …" activity
// entry naming me. The latest wins. Tasks with neither fall back to when they were created, client side.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({}, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const myTaskIds = (
    await prisma.task.findMany({ where: { assignees: { some: { id: userId } }, deletedAt: null }, select: { id: true } })
  ).map((t) => t.id);
  if (myTaskIds.length === 0) return NextResponse.json({});

  const [notes, activity] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, type: 'task_assigned', taskId: { in: myTaskIds } },
      select: { taskId: true, createdAt: true },
    }),
    me?.name
      ? prisma.comment.findMany({
          where: { taskId: { in: myTaskIds }, type: 'activity', activityKind: 'assigned', body: { contains: me.name } },
          select: { taskId: true, createdAt: true },
        })
      : Promise.resolve([] as { taskId: string | null; createdAt: Date }[]),
  ]);

  const at: Record<string, string> = {};
  for (const row of [...notes, ...activity]) {
    if (!row.taskId) continue;
    const iso = row.createdAt.toISOString();
    if (!at[row.taskId] || at[row.taskId] < iso) at[row.taskId] = iso;
  }
  return NextResponse.json(at);
}
