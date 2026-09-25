// The pure half of the access rules — no database, so the client can run exactly the same checks
// the server does (the assignee and mention pickers ask "who can see this private task?"). Split out
// of lib/auth/access.ts rather than copied, so the two can never disagree about who sees what.
// access.ts re-exports all of it; server code keeps importing from there.

export type WorkspaceRole = 'owner' | 'admin' | 'member';

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
