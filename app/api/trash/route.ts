import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// A Space delete cascades deletedAt down through every Folder/List/Task/DocFolder/Doc
// nested inside it, so the Trash view shouldn't list all of those separately — that would
// turn deleting one Space into dozens or hundreds of rows. Instead: only show an item if its
// own immediate parent is NOT also trashed. If the parent is trashed too, this item is already
// covered by the parent's own Trash entry (and will come back together when that's restored).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  // Scoped to workspaces this identity is actually a member of — every query below previously had
  // no workspaceId filter at all, meaning any authenticated (or even unauthenticated, since this
  // route also had no getCurrentUserId check) caller could enumerate every deleted item across
  // every workspace in the whole app. This closes the cross-workspace leak; it does not yet also
  // hide a trashed *private* item from a workspace member who wouldn't normally have canSee access
  // to it — a narrower, further refinement, named here rather than silently assumed handled.
  const memberships = await prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) return NextResponse.json([]);

  const [spaces, folders, lists, tasks, docFolders, docs, events] = await Promise.all([
    prisma.space.findMany({
      where: { deletedAt: { not: null }, workspaceId: { in: workspaceIds } },
      select: { id: true, name: true, deletedAt: true },
    }),
    prisma.folder.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.list.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        folder: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.task.findMany({
      where: { deletedAt: { not: null }, list: { space: { workspaceId: { in: workspaceIds } } } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        list: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.docFolder.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.doc.findMany({
      // A Doc's own workspace is reachable via either its Space or its Task's List's Space (see
      // the schema's own note that taskId/spaceId are independent, not mutually exclusive).
      where: {
        deletedAt: { not: null },
        OR: [{ space: { workspaceId: { in: workspaceIds } } }, { task: { list: { space: { workspaceId: { in: workspaceIds } } } } }],
      },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        folder: { select: { deletedAt: true } },
        task: { select: { title: true, deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    // No parent-trashed check needed — an Event's spaceId is SetNull on Space delete, never
    // cascade-deleted, so it can never inherit a trashed ancestor the way List/Doc/Task can.
    prisma.event.findMany({
      where: { deletedAt: { not: null }, workspaceId: { in: workspaceIds } },
      select: { id: true, title: true, deletedAt: true, space: { select: { name: true } } },
    }),
  ]);

  type TrashItem = { type: string; id: string; name: string; deletedAt: string; context: string };
  const items: TrashItem[] = [];

  for (const s of spaces) {
    items.push({ type: 'space', id: s.id, name: s.name, deletedAt: s.deletedAt!.toISOString(), context: 'Space' });
  }

  for (const f of folders) {
    const parentTrashed = f.parent ? !!f.parent.deletedAt : !!f.space?.deletedAt;
    if (parentTrashed) continue;
    items.push({
      type: 'folder',
      id: f.id,
      name: f.name,
      deletedAt: f.deletedAt!.toISOString(),
      context: `Folder in ${f.space?.name ?? 'a Space'}`,
    });
  }

  for (const l of lists) {
    const parentTrashed = l.folder ? !!l.folder.deletedAt : !!l.space?.deletedAt;
    if (parentTrashed) continue;
    items.push({
      type: 'list',
      id: l.id,
      name: l.name,
      deletedAt: l.deletedAt!.toISOString(),
      context: `List in ${l.space?.name ?? 'a Space'}`,
    });
  }

  for (const t of tasks) {
    const parentTrashed = (t.parent ? !!t.parent.deletedAt : false) || !!t.list?.deletedAt;
    if (parentTrashed) continue;
    items.push({
      type: 'task',
      id: t.id,
      name: t.title,
      deletedAt: t.deletedAt!.toISOString(),
      context: `Task in ${t.list?.name ?? 'a List'}`,
    });
  }

  for (const df of docFolders) {
    const parentTrashed = df.parent ? !!df.parent.deletedAt : !!df.space?.deletedAt;
    if (parentTrashed) continue;
    items.push({
      type: 'docFolder',
      id: df.id,
      name: df.name,
      deletedAt: df.deletedAt!.toISOString(),
      context: `Doc folder in ${df.space?.name ?? 'a Space'}`,
    });
  }

  for (const d of docs) {
    const parentTrashed = d.folder ? !!d.folder.deletedAt : d.task ? !!d.task.deletedAt : !!d.space?.deletedAt;
    if (parentTrashed) continue;
    items.push({
      type: 'doc',
      id: d.id,
      name: d.title,
      deletedAt: d.deletedAt!.toISOString(),
      context: d.task ? `Doc on task «${d.task.title}»` : `Doc in ${d.space?.name ?? 'a Space'}`,
    });
  }

  for (const e of events) {
    items.push({
      type: 'event',
      id: e.id,
      name: e.title,
      deletedAt: e.deletedAt!.toISOString(),
      context: e.space ? `Event in ${e.space.name}` : 'Event',
    });
  }

  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  return NextResponse.json(items);
}
