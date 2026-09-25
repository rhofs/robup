import type { AppUser, HierarchyWorkspace, Task } from '../store/useTaskStore';
import { buildFolderChainVisibility, canManageWorkspace, canSee, type AccessContext } from './auth/visibility';

// Who can be picked for something that lives in a workspace — an assignee, an attendee, a doc owner.
//
// The store's `users` is everyone you share ANY workspace with, plus your connections (GET
// /api/users), which is right for chat and wrong for every person-picker on a task: it let a task
// in one company be assigned to someone who only exists in another. The picker has to ask which
// workspace the thing belongs to, and offer only that workspace's members.
//
// Drawn from `users` rather than from `workspace.members` so a person's latest name and colour (the
// store patches `users` in place) are what the picker shows. `keepIds` are people already on the
// thing: someone who has since left the workspace must still appear, or they could never be removed.

export function workspaceIdForList(workspaces: HierarchyWorkspace[], listId: string | null | undefined): string | null {
  if (!listId) return null;
  return workspaces.find((w) => w.spaces.some((sp) => sp.lists.some((l) => l.id === listId)))?.id ?? null;
}

export function workspaceIdForSpace(workspaces: HierarchyWorkspace[], spaceId: string | null | undefined): string | null {
  if (!spaceId) return null;
  return workspaces.find((w) => w.spaces.some((sp) => sp.id === spaceId))?.id ?? null;
}

export function pickableMembers(
  workspaces: HierarchyWorkspace[],
  users: AppUser[],
  workspaceId: string | null | undefined,
  keepIds: string[] = []
): AppUser[] {
  const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined;
  const allowed = new Set([...(ws?.members.map((m) => m.id) ?? []), ...keepIds]);
  return users.filter((u) => allowed.has(u.id));
}

// Who can open this task — the client-side twin of getTaskAudience in lib/auth/access.ts, built from
// the same canSee and Folder-chain rules (lib/auth/visibility.ts) over the hierarchy the store already
// holds. The chain is always there to walk: anyone looking at this task can see every level above it.
// Null when the task's place cannot be found in the store, which the callers read as "no filter".
export function taskAudience(workspaces: HierarchyWorkspace[], task: Pick<Task, 'listId' | 'isPrivate' | 'accessJson'>): Set<string> | null {
  for (const ws of workspaces) {
    for (const space of ws.spaces) {
      const list = space.lists.find((l) => l.id === task.listId);
      if (!list) continue;
      const folderChainVisible = buildFolderChainVisibility(space.folders);
      const heldByUser = new Map<string, string[]>();
      for (const r of ws.roles) for (const uid of r.memberIds) heldByUser.set(uid, [...(heldByUser.get(uid) ?? []), r.id]);
      const audience = new Set<string>();
      for (const m of ws.members) {
        const ctx: AccessContext = {
          userId: m.id,
          role: m.workspaceRole,
          isManager: canManageWorkspace(m.workspaceRole),
          isMember: true,
          heldRoleIds: heldByUser.get(m.id) ?? [],
        };
        if (canSee(space, ctx) && folderChainVisible(list.folderId, ctx) && canSee(list, ctx) && canSee(task, ctx)) audience.add(m.id);
      }
      return audience;
    }
  }
  return null;
}

// The people a task's pickers offer: members of its workspace who can open it. On a private task
// that leaves out everyone without access — assigning or mentioning them would reach no one. `keepIds`
// as in pickableMembers: someone already on the task stays listed so they can be removed.
export function taskPickableMembers(workspaces: HierarchyWorkspace[], users: AppUser[], task: Task, keepIds: string[] = []): AppUser[] {
  const members = pickableMembers(workspaces, users, workspaceIdForList(workspaces, task.listId), keepIds);
  const audience = taskAudience(workspaces, task);
  if (!audience) return members;
  const keep = new Set(keepIds);
  return members.filter((u) => audience.has(u.id) || keep.has(u.id));
}
