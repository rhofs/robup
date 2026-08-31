import { NextResponse } from 'next/server';
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess, ensureListAccess } from '@/lib/auth/resourceAccess';
import { syncTaskForAllRelevantUsers } from '@/lib/google/calendarSync';

// Duplicate a Task — and, with `targetListId`, the paste half of copy/paste too. They're the same
// operation with a different destination, so they share one route rather than drifting apart as
// two implementations of "copy everything that matters about a task."
//
// Done server-side deliberately. A client-side copy would need a create call per task plus one per
// subtask, each able to fail independently and leave a half-built tree behind; here the whole
// thing is one transaction that either lands or doesn't.
//
// What comes along: title, description, status, priority, dates, assignees, custom field values,
// privacy, and the full subtask tree. What doesn't: comments and the activity log (those describe
// what happened to the *original*), attached docs, chat channels, and Google sync rows (the copy
// earns its own on first sync). Archived/deleted state is dropped — a duplicate starts live.
const COPY_SUFFIX = ' (copy)';

type TaskNode = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  calendarLane: number | null;
  customFieldValues: string;
  isPrivate: boolean;
  accessJson: string;
  assignees: { id: string }[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const source = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, status: true, priority: true, startDate: true,
      dueDate: true, calendarLane: true, customFieldValues: true, isPrivate: true, accessJson: true,
      listId: true, parentId: true, assignees: { select: { id: true } },
    },
  });
  if (!source || (await prisma.task.findUnique({ where: { id }, select: { deletedAt: true } }))?.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pasting into a different list must be authorized against THAT list, not just the source task —
  // otherwise read access to a task would be enough to write into any list whose id you could
  // guess.
  const targetListId = typeof body.targetListId === 'string' && body.targetListId ? body.targetListId : source.listId;
  if (targetListId !== source.listId && !(await ensureListAccess(targetListId, userId))) {
    return NextResponse.json({ error: 'Not authorized for the destination list' }, { status: 403 });
  }

  // A copy landing in a different list can't keep its parent — the parent lives in the old list,
  // and a subtask whose parent is elsewhere isn't a shape the rest of the app expects.
  const parentId = targetListId === source.listId ? source.parentId : null;

  // Only the top-level copy gets the suffix; renaming every nested subtask "(copy)" is noise.
  const rename = body.keepName === true ? source.title : `${source.title}${COPY_SUFFIX}`;

  const created = await prisma.$transaction(async (tx) => {
    const copyNode = async (node: TaskNode, listId: string, newParentId: string | null, title: string) => {
      const copy = await tx.task.create({
        data: {
          title,
          description: node.description,
          status: node.status,
          priority: node.priority,
          startDate: node.startDate,
          dueDate: node.dueDate,
          calendarLane: node.calendarLane,
          customFieldValues: node.customFieldValues,
          isPrivate: node.isPrivate,
          accessJson: node.accessJson,
          listId,
          parentId: newParentId,
          assignees: { connect: node.assignees.map((a) => ({ id: a.id })) },
        },
      });

      // Depth-first, one level at a time — the tree is shallow in practice (this app only ever
      // shows one level of subtasks in the UI) and this keeps parent ids resolved before children
      // need them.
      const children = await tx.task.findMany({
        where: { parentId: node.id, deletedAt: null },
        select: {
          id: true, title: true, description: true, status: true, priority: true, startDate: true,
          dueDate: true, calendarLane: true, customFieldValues: true, isPrivate: true,
          accessJson: true, assignees: { select: { id: true } },
        },
      });
      for (const child of children) await copyNode(child, listId, copy.id, child.title);
      return copy;
    };

    return copyNode(source as TaskNode, targetListId, parentId, rename);
  });

  const full = await prisma.task.findUnique({ where: { id: created.id }, include: { assignees: { select: publicUserSelect } } });

  // The copy keeps the original's assignees and dates, so it belongs on their calendars too.
  syncTaskForAllRelevantUsers(created.id).catch(() => {});

  return NextResponse.json(full);
}
