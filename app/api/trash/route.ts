import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext, canSee, buildFolderChainVisibility, type AccessContext } from '@/lib/auth/access';

// A Space delete cascades deletedAt down through every Folder/List/Task/DocFolder/Doc
// nested inside it, so the Trash view shouldn't list all of those separately — that would
// turn deleting one Space into dozens or hundreds of rows. Instead: only show an item if its
// own immediate parent is NOT also trashed. If the parent is trashed too, this item is already
// covered by the parent's own Trash entry (and will come back together when that's restored).
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json([]);

  // Scoped to workspaces this identity is actually a member of — every query below previously had
  // no workspaceId filter at all, meaning any authenticated (or even unauthenticated, since this
  // route also had no getCurrentUserId check) caller could enumerate every deleted item across
  // every workspace in the whole app. This closes the cross-workspace leak; it does not yet also
  // hide a trashed *private* item from a workspace member who wouldn't normally have canSee access
  // to it — a narrower, further refinement, named here rather than silently assumed handled.
  const memberships = await prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } });
  const memberWorkspaceIds = memberships.map((m) => m.workspaceId);
  if (memberWorkspaceIds.length === 0) return NextResponse.json([]);

  // Narrowed further to ONE workspace when the caller names it. Membership alone meant the Trash
  // view mixed every workspace the person belongs to into a single list — including their own
  // personal "My Tasks" workspace. Nobody else's data was ever exposed, but opening Trash while
  // sitting in a shared workspace listed private deleted items alongside the team's, which is the
  // wrong thing to have on screen in an office. Raised by the user directly: "pass på at det ikke
  // lenker info fra private (my tasks) til offisielle workspaces når man sletter/arkiverer."
  //
  // The requested id is intersected with real memberships rather than trusted, so passing someone
  // else's workspace id returns nothing rather than their trash. Omitting the parameter keeps the
  // old membership-wide behaviour, so an older client mid-deploy still works.
  const requested = new URL(req.url).searchParams.get('workspaceId');
  const workspaceIds = requested
    ? memberWorkspaceIds.filter((id) => id === requested)
    : memberWorkspaceIds;
  if (workspaceIds.length === 0) return NextResponse.json([]);

  const [spaces, folders, lists, tasks, docFolders, docs, events] = await Promise.all([
    prisma.space.findMany({
      where: { deletedAt: { not: null }, workspaceId: { in: workspaceIds } },
      select: { id: true, name: true, deletedAt: true, workspaceId: true, isPrivate: true, accessJson: true },
    }),
    prisma.folder.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parentId: true,
        isPrivate: true,
        accessJson: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true, workspaceId: true, isPrivate: true, accessJson: true } },
      },
    }),
    prisma.list.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        folderId: true,
        isPrivate: true,
        accessJson: true,
        folder: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true, workspaceId: true, isPrivate: true, accessJson: true } },
      },
    }),
    prisma.task.findMany({
      where: { deletedAt: { not: null }, list: { space: { workspaceId: { in: workspaceIds } } } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        isPrivate: true,
        accessJson: true,
        parent: { select: { deletedAt: true } },
        list: {
          select: {
            name: true, deletedAt: true, folderId: true, isPrivate: true, accessJson: true,
            space: { select: { workspaceId: true, isPrivate: true, accessJson: true } },
          },
        },
      },
    }),
    prisma.docFolder.findMany({
      where: { deletedAt: { not: null }, space: { workspaceId: { in: workspaceIds } } },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        parent: { select: { deletedAt: true } },
        space: { select: { name: true, deletedAt: true, workspaceId: true, isPrivate: true, accessJson: true } },
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
        task: {
          select: {
            title: true, deletedAt: true, isPrivate: true, accessJson: true,
            list: {
              select: {
                isPrivate: true, accessJson: true,
                space: { select: { workspaceId: true, isPrivate: true, accessJson: true } },
              },
            },
          },
        },
        space: { select: { name: true, deletedAt: true, workspaceId: true, isPrivate: true, accessJson: true } },
      },
    }),
    // No parent-trashed check needed — an Event's spaceId is SetNull on Space delete, never
    // cascade-deleted, so it can never inherit a trashed ancestor the way List/Doc/Task can.
    prisma.event.findMany({
      where: { deletedAt: { not: null }, workspaceId: { in: workspaceIds } },
      select: { id: true, title: true, deletedAt: true, space: { select: { name: true } } },
    }),
  ]);

  // Access filtering. Until now Trash applied none: an item that was private *within* a shared
  // workspace — a private Space, Folder, List or Task — appeared in that workspace's Trash to every
  // member, even though the same item is hidden from them everywhere else in the app. Deleting
  // something therefore made it MORE visible than it was while it existed, which is the wrong way
  // round. Flagged in this file's own comment since August and closed here.
  //
  // One context per workspace, not per row: getAccessContext does real queries, and the row count
  // here is unbounded while the workspace count is small.
  const ctxByWorkspace = new Map<string, AccessContext>(
    await Promise.all(workspaceIds.map(async (id) => [id, await getAccessContext(id, userId)] as const))
  );

  // Folders are loaded UNFILTERED and in full, because chain visibility has to walk parents that
  // may themselves be invisible — the same reason GET /api/workspaces builds this rather than
  // filtering folder-by-folder. A List that is not itself private but sits inside a private Folder
  // must stay hidden, and checking only the row's own flag would let it through.
  const allFolders = await prisma.folder.findMany({
    where: { space: { workspaceId: { in: workspaceIds } } },
    select: { id: true, parentId: true, isPrivate: true, accessJson: true },
  });
  const folderChainVisible = buildFolderChainVisibility(allFolders);

  type Priv = { isPrivate: boolean; accessJson: string };
  // Anything whose workspace has no context (should not happen, since workspaceIds came from real
  // memberships) is treated as invisible rather than visible — failing closed is the only safe
  // default for a visibility check.
  const visible = (workspaceId: string | undefined, ...resources: (Priv | null | undefined)[]) => {
    const ctx = workspaceId ? ctxByWorkspace.get(workspaceId) : undefined;
    if (!ctx) return false;
    return resources.every((r) => !r || canSee(r, ctx));
  };
  const chainOk = (workspaceId: string | undefined, folderId: string | null) => {
    const ctx = workspaceId ? ctxByWorkspace.get(workspaceId) : undefined;
    return !!ctx && folderChainVisible(folderId, ctx);
  };

  type TrashItem = { type: string; id: string; name: string; deletedAt: string; context: string };
  const items: TrashItem[] = [];

  for (const s of spaces) {
    if (!visible(s.workspaceId, s)) continue;
    items.push({ type: 'space', id: s.id, name: s.name, deletedAt: s.deletedAt!.toISOString(), context: 'Space' });
  }

  for (const f of folders) {
    const parentTrashed = f.parent ? !!f.parent.deletedAt : !!f.space?.deletedAt;
    if (parentTrashed) continue;
    if (!visible(f.space?.workspaceId, f.space, f) || !chainOk(f.space?.workspaceId, f.parentId)) continue;
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
    if (!visible(l.space?.workspaceId, l.space, l) || !chainOk(l.space?.workspaceId, l.folderId)) continue;
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
    // Space, List and the task's own flag all have to pass — a task is only as visible as the
    // least visible thing above it, same rule getTaskVisibilityContext applies to live tasks.
    {
      const wsId = t.list?.space?.workspaceId;
      if (!visible(wsId, t.list?.space, t.list, t) || !chainOk(wsId, t.list?.folderId ?? null)) continue;
    }
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
    // DocFolder has no privacy flag of its own; it is as visible as the Space holding it.
    if (!visible(df.space?.workspaceId, df.space)) continue;
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
    // A Doc has no privacy flag either — it inherits from whichever side it hangs off, and
    // schema.prisma is explicit that taskId and spaceId are independent, so a doc attached to both
    // must satisfy both.
    if (d.task) {
      const wsId = d.task.list?.space?.workspaceId;
      if (!visible(wsId, d.task.list?.space, d.task.list, d.task)) continue;
    }
    if (d.space && !visible(d.space.workspaceId, d.space)) continue;
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
