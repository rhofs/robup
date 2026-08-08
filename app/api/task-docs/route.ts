import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Bulk read of every task-scoped Doc across the whole app — closes the Command palette's
// documented "can't search task-scoped Doc titles" gap, which existed only because those docs
// previously loaded per-task on modal-open (fetchDocs) and nowhere eagerly. Excludes docs
// belonging to a soft-deleted (trashed) task, same as the per-task route excludes trashed docs.
export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId');
  // Same "no identity, no data" rule as GET /api/tasks and /api/workspaces.
  if (!userId) return NextResponse.json([]);

  const docs = await prisma.doc.findMany({
    where: {
      taskId: { not: null },
      deletedAt: null,
      task: { deletedAt: null, list: { space: { workspace: { members: { some: { id: userId } } } } } },
    },
    orderBy: { order: 'asc' },
  });
  return NextResponse.json(docs);
}
