import { prisma } from '@/lib/prisma';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

// null = not a member of this workspace at all (distinct from 'member', the lowest real tier).
export async function getWorkspaceRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return (membership?.role as WorkspaceRole | undefined) ?? null;
}

// Owner or Admin — the two tiers that can create Roles, mark things private, manage other
// members' Admin status. Only 'owner' can delete the workspace itself (checked separately,
// inline, wherever that route lives — it's the one capability Admin deliberately doesn't get).
export function canManageWorkspace(role: WorkspaceRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export type AccessJsonEntry = { type: 'user' | 'role'; id: string };

export function parseAccessJson(accessJson: string): AccessJsonEntry[] {
  try {
    const parsed = JSON.parse(accessJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type AccessContext = {
  userId: string;
  role: WorkspaceRole | null;
  isManager: boolean; // owner or admin
  isMember: boolean;
  heldRoleIds: string[]; // Role ids this user belongs to, within this one workspace
};

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

// Space/Folder/List/Task all share this exact isPrivate/accessJson shape (see the schema
// comments) — one shared, synchronous check for all four rather than four near-identical async
// DB round-trips per row. Owner/Admin always pass regardless of accessJson, same as how a
// Discord server admin sees every channel regardless of that channel's own permission
// overwrites. Filtering a *string* JSON column directly in a Prisma `where` (SQLite has no
// native JSON column type here) would mean fragile substring matching that can't express
// role-based grants correctly — this in-memory check after a normal fetch is the practical,
// correct alternative, and cheap at this app's scale (one workspace's tree, not a global scan).
export function canSee(resource: { isPrivate: boolean; accessJson: string }, ctx: AccessContext): boolean {
  if (!resource.isPrivate) return true;
  if (ctx.isManager) return true;
  if (!ctx.isMember) return false;
  const entries = parseAccessJson(resource.accessJson);
  return entries.some((e) => (e.type === 'user' && e.id === ctx.userId) || (e.type === 'role' && ctx.heldRoleIds.includes(e.id)));
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

type FolderLike = { id: string; parentId: string | null; isPrivate: boolean; accessJson: string };

// Folders nest arbitrarily deep, and any one of them could independently be private (see the
// "each level independent" design decision in PLANNING.md) — a List or child Folder isn't
// private itself, but if it sits *inside* a private-and-inaccessible ancestor Folder, it must
// still be hidden. `folders` should be the FULL, unfiltered set for whatever scope is being
// checked (one Space's folders, or every Folder across a user's workspaces) — the returned
// function walks parentId chains against that map, entirely in memory, so checking N rows costs
// one query total instead of an N+1 walk.
export function buildFolderChainVisibility(folders: FolderLike[]) {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  return (folderId: string | null, ctx: AccessContext): boolean => {
    let current = folderId;
    while (current) {
      const f = folderById.get(current);
      if (!f) break;
      if (!canSee(f, ctx)) return false;
      current = f.parentId;
    }
    return true;
  };
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
