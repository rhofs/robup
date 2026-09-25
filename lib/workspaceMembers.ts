import type { AppUser, HierarchyWorkspace } from '../store/useTaskStore';

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
