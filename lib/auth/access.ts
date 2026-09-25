import { prisma } from '@/lib/prisma';
import { buildFolderChainVisibility, canManageWorkspace, canSee, type AccessContext, type WorkspaceRole } from './visibility';

export * from './visibility';

// null = not a member of this workspace at all (distinct from 'member', the lowest real tier).
export async function getWorkspaceRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return (membership?.role as WorkspaceRole | undefined) ?? null;
}

// One-time, per-request lookup — two small queries total (role tier + held Role ids), regardless
// of how many Space/Folder/List/Task rows get checked against it afterward via canSee(). Avoids
// re-querying per row, which a naive "check each row independently" version would do.
export async function getAccessContext(workspaceId: string, userId: string): Promise<AccessContext> {
  const role = await getWorkspaceRole(workspaceId, userId);
  const isManager = canManageWorkspace(role);
  const isMember = role !== null;
  const heldRoleIds = isMember
    ? (
        await prisma.role.findMany({
          where: { workspaceId, members: { some: { id: userId } } },
          select: { id: true },
        })
      ).map((r) => r.id)
    : [];
  return { userId, role, isManager, isMember, heldRoleIds };
}

// Every member's AccessContext for one workspace, in two queries total. getAccessContext answers
// "can THIS caller see it"; a mention asks the reverse — "which of everyone here can see it" — and
// calling that per member would be two queries per person on every message that says @everyone.
export async function getWorkspaceAccessContexts(workspaceId: string): Promise<Map<string, AccessContext>> {
  const [memberships, roles] = await Promise.all([
    prisma.workspaceMembership.findMany({ where: { workspaceId }, select: { userId: true, role: true } }),
    prisma.role.findMany({ where: { workspaceId }, select: { id: true, members: { select: { id: true } } } }),
  ]);
  const heldByUser = new Map<string, string[]>();
  for (const r of roles) {
    for (const m of r.members) heldByUser.set(m.id, [...(heldByUser.get(m.id) ?? []), r.id]);
  }
  return new Map(
    memberships.map((m) => {
      const role = m.role as WorkspaceRole;
      return [
        m.userId,
        { userId: m.userId, role, isManager: canManageWorkspace(role), isMember: true, heldRoleIds: heldByUser.get(m.userId) ?? [] },
      ] as const;
    })
  );
}

// Convenience wrapper for the single-row case (a resource's own mutation route checking "can
// this caller even see the thing they're trying to edit") — does its own getAccessContext lookup
// rather than making every call site build one by hand.
export async function canAccessResource(
  resource: { isPrivate: boolean; accessJson: string },
  workspaceId: string,
  userId: string
): Promise<boolean> {
  if (!resource.isPrivate) return true;
  const ctx = await getAccessContext(workspaceId, userId);
  return canSee(resource, ctx);
}

// Shared setup for the two flat, cross-workspace task-scoped GET routes (app/api/tasks,
// app/api/task-docs) — both need the same "does this caller's per-workspace access context, plus
// the full Folder-ancestor chain, actually let them see this task" logic, so it's built once
// here instead of duplicated. Returns null when the caller isn't a member of any workspace at
// all (the route should just return [] in that case).
export async function getTaskVisibilityContext(userId: string) {
  const memberships = await prisma.workspaceMembership.findMany({ where: { userId }, select: { workspaceId: true } });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) return null;

  const ctxEntries = await Promise.all(workspaceIds.map(async (wid) => [wid, await getAccessContext(wid, userId)] as const));
  const ctxByWorkspace = new Map<string, AccessContext>(ctxEntries);

  const spaceIds = (await prisma.space.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((s) => s.id);
  const allFolders = await prisma.folder.findMany({
    where: { spaceId: { in: spaceIds } },
    select: { id: true, parentId: true, isPrivate: true, accessJson: true },
  });
  const folderChainVisible = buildFolderChainVisibility(allFolders);

  const isTaskVisible = (task: {
    isPrivate: boolean;
    accessJson: string;
    list: { isPrivate: boolean; accessJson: string; folderId: string | null; space: { isPrivate: boolean; accessJson: string; workspaceId: string } };
  }): boolean => {
    const ctx = ctxByWorkspace.get(task.list.space.workspaceId);
    if (!ctx) return false;
    if (!canSee(task.list.space, ctx)) return false;
    if (!folderChainVisible(task.list.folderId, ctx)) return false;
    if (!canSee(task.list, ctx)) return false;
    return canSee(task, ctx);
  };

  return { workspaceIds, isTaskVisible };
}

// Assignees and attendees must be members of the workspace the task or event lives in. The pickers
// only offer members, but the API took any user id it was given, so a stale client or a hand-made
// request could put someone from another workspace onto a task they cannot even see. Unknown ids
// are dropped rather than rejected, so one bad id cannot fail a whole edit. `alreadyOn` is kept: a
// person who has since left the workspace stays assigned until someone removes them, instead of
// being silently dropped by an unrelated edit.
export async function keepWorkspaceMembers(workspaceId: string, ids: unknown, alreadyOn: string[] = []): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  if (wanted.length === 0) return [];
  const members = await prisma.workspaceMembership.findMany({
    where: { workspaceId, userId: { in: wanted } },
    select: { userId: true },
  });
  const allowed = new Set([...members.map((m) => m.userId), ...alreadyOn]);
  return wanted.filter((id) => allowed.has(id));
}

// Everyone who can open one task: the Space, the whole Folder chain, the List and the Task itself,
// each checked with canSee for every member of the task's workspace. Three queries however large the
// workspace. Used where the question is "who may this task reach" — mention recipients, and which
// people can be assigned to it.
export async function getTaskAudience(taskId: string): Promise<{ workspaceId: string; userIds: Set<string>; assigneeIds: string[] } | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      isPrivate: true,
      accessJson: true,
      assignees: { select: { id: true } },
      list: {
        select: {
          isPrivate: true,
          accessJson: true,
          folderId: true,
          space: { select: { id: true, isPrivate: true, accessJson: true, workspaceId: true } },
        },
      },
    },
  });
  if (!task) return null;
  const { space } = task.list;
  const [contexts, folders] = await Promise.all([
    getWorkspaceAccessContexts(space.workspaceId),
    prisma.folder.findMany({ where: { spaceId: space.id }, select: { id: true, parentId: true, isPrivate: true, accessJson: true } }),
  ]);
  const folderChainVisible = buildFolderChainVisibility(folders);
  const userIds = new Set(
    [...contexts.values()]
      .filter((ctx) => canSee(space, ctx) && folderChainVisible(task.list.folderId, ctx) && canSee(task.list, ctx) && canSee(task, ctx))
      .map((ctx) => ctx.userId)
  );
  return { workspaceId: space.workspaceId, userIds, assigneeIds: task.assignees.map((a) => a.id) };
}
