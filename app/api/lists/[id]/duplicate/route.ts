import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { ensureListAccess, ensureSpaceAccess } from '@/lib/auth/resourceAccess';

// Duplicate a List, with `targetSpaceId` doubling as paste-into-another-Space. Same one-route,
// two-meanings shape as the Task duplicate — see that file for why this is server-side.
//
// Copies the list's own presentation (name/color/icon) and every live task in it, including
// subtask trees and assignees. Archived and trashed tasks are left behind: duplicating a list to
// reuse its structure shouldn't drag someone's old finished work along with it.
const COPY_SUFFIX = ' (copy)';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await ensureListAccess(id, userId))) return NextResponse.json({ error: 'Not authorized for this list' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const source = await prisma.list.findUnique({
    where: { id },
    select: {
      id: true, name: true, color: true, textColor: true, icon: true, folderId: true,
      spaceId: true, isPrivate: true, accessJson: true,
    },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const targetSpaceId = typeof body.targetSpaceId === 'string' && body.targetSpaceId ? body.targetSpaceId : source.spaceId;
  if (targetSpaceId !== source.spaceId && !(await ensureSpaceAccess(targetSpaceId, userId))) {
    return NextResponse.json({ error: 'Not authorized for the destination space' }, { status: 403 });
  }
  // A folder belongs to one Space, so a copy landing in a different Space can't stay in it.
  const folderId = targetSpaceId === source.spaceId ? source.folderId : null;

  const created = await prisma.$transaction(async (tx) => {
    // Appended, not inserted next to the original — `order` is a plain integer here and shifting
    // every sibling to make room is a much larger write for no real gain.
    const maxOrder = await tx.list.aggregate({ where: { spaceId: targetSpaceId }, _max: { order: true } });
    const list = await tx.list.create({
      data: {
        name: `${source.name}${COPY_SUFFIX}`,
        color: source.color,
        textColor: source.textColor,
        icon: source.icon,
        spaceId: targetSpaceId,
        folderId,
        isPrivate: source.isPrivate,
        accessJson: source.accessJson,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    const roots = await tx.task.findMany({
      where: { listId: id, parentId: null, deletedAt: null, archived: false },
      select: {
        id: true, title: true, description: true, status: true, priority: true, startDate: true,
        dueDate: true, calendarLane: true, customFieldValues: true, isPrivate: true,
        accessJson: true, assignees: { select: { id: true } },
      },
    });

    const copyTask = async (node: typeof roots[number], parentId: string | null) => {
      const copy = await tx.task.create({
        data: {
          title: node.title,
          description: node.description,
          status: node.status,
          priority: node.priority,
          startDate: node.startDate,
          dueDate: node.dueDate,
          calendarLane: node.calendarLane,
          customFieldValues: node.customFieldValues,
          isPrivate: node.isPrivate,
          accessJson: node.accessJson,
          listId: list.id,
          parentId,
          assignees: { connect: node.assignees.map((a) => ({ id: a.id })) },
        },
      });
      const children = await tx.task.findMany({
        where: { parentId: node.id, deletedAt: null, archived: false },
        select: {
          id: true, title: true, description: true, status: true, priority: true, startDate: true,
          dueDate: true, calendarLane: true, customFieldValues: true, isPrivate: true,
          accessJson: true, assignees: { select: { id: true } },
        },
      });
      for (const child of children) await copyTask(child, copy.id);
    };

    for (const root of roots) await copyTask(root, null);
    return list;
  });

  return NextResponse.json(created);
}
