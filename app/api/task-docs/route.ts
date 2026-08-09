import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getTaskVisibilityContext } from '@/lib/auth/access';

// Bulk read of every task-scoped Doc across the whole app — closes the Command palette's
// documented "can't search task-scoped Doc titles" gap, which existed only because those docs
// previously loaded per-task on modal-open (fetchDocs) and nowhere eagerly. Excludes docs
// belonging to a soft-deleted (trashed) task, same as the per-task route excludes trashed docs.
export async function GET() {
  const userId = await getCurrentUserId();
  // Same "no identity, no data" rule as GET /api/tasks and /api/workspaces.
  if (!userId) return NextResponse.json([]);

  const visibility = await getTaskVisibilityContext(userId);
  if (!visibility) return NextResponse.json([]);

  const docs = await prisma.doc.findMany({
    where: {
      taskId: { not: null },
      deletedAt: null,
      task: { deletedAt: null, list: { space: { workspace: { memberships: { some: { userId } } } } } },
    },
    include: {
      task: {
        select: { isPrivate: true, accessJson: true, list: { select: { isPrivate: true, accessJson: true, folderId: true, space: { select: { isPrivate: true, accessJson: true, workspaceId: true } } } } },
      },
    },
    orderBy: { order: 'asc' },
  });

  const visible = docs.filter((d) => d.task && visibility.isTaskVisible(d.task)).map(({ task, ...d }) => d);

  return NextResponse.json(visible);
}
