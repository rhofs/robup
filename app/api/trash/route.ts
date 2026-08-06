import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// A Space delete cascades deletedAt down through every Folder/List/Task/DocFolder/Doc
// nested inside it, so the Trash view shouldn't list all of those separately — that would
// turn deleting one Space into dozens or hundreds of rows. Instead: only show an item if its
// own immediate parent is NOT also trashed. If the parent is trashed too, this item is already
// covered by the parent's own Trash entry (and will come back together when that's restored).
export async function GET() {
  const [spaces, folders, lists, tasks, docFolders, docs] = await Promise.all([
    prisma.space.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, deletedAt: true } }),
    prisma.folder.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.list.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        folder: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.task.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        list: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.docFolder.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
    }),
    prisma.doc.findMany({
      where: { deletedAt: { not: null } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        folder: { select: { deletedAt: true } },
        task: { select: { title: true, deletedAt: true } },
        space: { select: { name: true, deletedAt: true } },
      },
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

  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  return NextResponse.json(items);
}
