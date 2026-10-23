import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { copyTaskStatuses } from '@/lib/statusSets';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureTaskAccess } from '@/lib/auth/resourceAccess';
import { syncTaskForAllRelevantUsers } from '@/lib/google/calendarSync';
import { isValidTimeZone, shiftCustomDates, shiftInstant } from '@/lib/taskSeries';

// "Create next episodes": `count` copies of a task, the n-th with every date moved n × `shiftDays`
// days — its own start/due, every subtask's at any depth, and every date-type custom field — and the
// title the client worked out for it (the episode numbers counted up). A duplicate in all else: same
// List, same parent, status, assignees, field values, privacy and the subtask tree in its order (see
// app/api/tasks/[id]/duplicate). One transaction for the whole series, so it lands complete or not at
// all. See lib/taskSeries.ts for why days are calendar days in the person's time zone.
const MAX_COPIES = 60;

type Node = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number | null;
  startDate: Date | null;
  dueDate: Date | null;
  calendarLane: number | null;
  showInPlanner: boolean | null;
  customFieldValues: string;
  order: number;
  isPrivate: boolean;
  accessJson: string;
  assignees: { id: string }[];
};

const NODE_SELECT = {
  id: true, title: true, description: true, status: true, priority: true, startDate: true, dueDate: true,
  calendarLane: true, showInPlanner: true, customFieldValues: true, order: true, isPrivate: true, accessJson: true,
  assignees: { select: { id: true } },
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureTaskAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this task' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const count = Math.floor(Number(body.count));
  const shiftDays = Math.round(Number(body.shiftDays));
  if (!Number.isFinite(count) || count < 1 || count > MAX_COPIES) {
    return NextResponse.json({ error: `Between 1 and ${MAX_COPIES} copies` }, { status: 400 });
  }
  if (!Number.isFinite(shiftDays) || Math.abs(shiftDays) > 3650) return NextResponse.json({ error: 'A whole number of days' }, { status: 400 });
  const timeZone = isValidTimeZone(body.timeZone) ? body.timeZone : 'UTC';
  const titles: string[] = Array.isArray(body.titles) ? body.titles.map((t: unknown) => (typeof t === 'string' ? t.trim().slice(0, 500) : '')) : [];

  const source = await prisma.task.findFirst({
    where: { id, deletedAt: null },
    select: { ...NODE_SELECT, listId: true, parentId: true, list: { select: { spaceId: true } } },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Which custom fields hold dates — only those values move.
  const dateFieldIds = new Set(
    (await prisma.customField.findMany({ where: { spaceId: source.list.spaceId, type: 'date' }, select: { id: true } })).map((f) => f.id)
  );

  const createdIds = await prisma.$transaction(async (tx) => {
    const copyNode = async (node: Node, parentId: string | null, title: string, days: number): Promise<string> => {
      const copy = await tx.task.create({
        data: {
          title,
          description: node.description,
          status: node.status,
          priority: node.priority,
          startDate: node.startDate ? shiftInstant(node.startDate, days, timeZone) : null,
          dueDate: node.dueDate ? shiftInstant(node.dueDate, days, timeZone) : null,
          calendarLane: node.calendarLane,
          showInPlanner: node.showInPlanner,
          customFieldValues: shiftCustomDates(node.customFieldValues, dateFieldIds, days, timeZone),
          order: node.order,
          isPrivate: node.isPrivate,
          accessJson: node.accessJson,
          listId: source.listId,
          parentId,
          assignees: { connect: node.assignees.map((a) => ({ id: a.id })) },
        },
        select: { id: true },
      });
      await copyTaskStatuses(tx, node.id, copy.id);
      const children = await tx.task.findMany({
        where: { parentId: node.id, deletedAt: null },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: NODE_SELECT,
      });
      for (const child of children) await copyNode(child, copy.id, child.title, days);
      return copy.id;
    };

    const ids: string[] = [];
    for (let n = 1; n <= count; n++) {
      ids.push(await copyNode(source, source.parentId, titles[n - 1] || source.title, n * shiftDays));
    }
    return ids;
  }, { timeout: 60_000 });

  // Each copy belongs on its assignees' calendars, like any duplicate.
  for (const cid of createdIds) syncTaskForAllRelevantUsers(cid).catch(() => {});

  return NextResponse.json({ ids: createdIds });
}
