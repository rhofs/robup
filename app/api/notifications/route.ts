import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Your notifications, newest first. Scoped to the signed-in user by the query itself rather than by
// a filter applied afterwards — there is no "whose notifications" parameter to get wrong.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    // Capped. A bell is for what happened recently; anything older than fifty entries is history
    // nobody scrolls to, and an uncapped list grows without limit on a phone.
    take: 50,
    include: { actor: { select: publicUserSelect } },
  });

  // Which workspace each one is from — "at man ser hvilken workspace den tilhører også" (2026-10-23).
  // Read through the task it is about; a chat mention has none and shows none (its title already says
  // which channel).
  const taskIds = [...new Set(notifications.map((n) => n.taskId).filter((id): id is string => !!id))];
  const tasks = taskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, list: { select: { space: { select: { workspace: { select: { id: true, name: true, isPersonal: true } } } } } } },
      })
    : [];
  const workspaceOf = new Map(tasks.map((t) => [t.id, t.list.space.workspace]));

  return NextResponse.json(notifications.map((n) => ({ ...n, workspace: (n.taskId && workspaceOf.get(n.taskId)) || null })));
}
