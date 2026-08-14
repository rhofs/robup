import { NextResponse } from 'next/server';
// Adjust this import to match how you fetch the Prisma client elsewhere in your project
// (usually a singleton in e.g. lib/prisma.ts)
import { prisma, publicUserSelect } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { getAccessContext, canSee, buildFolderChainVisibility } from '@/lib/auth/access';

export async function GET() {
  const userId = await getCurrentUserId();
  // No identity asserted -> no workspaces. Real login now backs this identity (see auth.ts) —
  // signed-out requests must not be a way to bypass every private workspace's membership check.
  if (!userId) return NextResponse.json([]);

  const workspaces = await prisma.workspace.findMany({
    where: { memberships: { some: { userId } } },
    include: {
      memberships: { include: { user: { select: publicUserSelect } } },
      roles: { orderBy: { createdAt: 'asc' }, include: { members: { select: { id: true } } } },
      rooms: { orderBy: { order: 'asc' } },
      spaces: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        include: {
          folders: {
            where: { deletedAt: null },
            select: { id: true, name: true, color: true, textColor: true, icon: true, spaceId: true, parentId: true, order: true, isPrivate: true, accessJson: true },
          },
          lists: {
            where: { deletedAt: null },
            select: { id: true, name: true, color: true, textColor: true, icon: true, folderId: true, order: true, archived: true, isPrivate: true, accessJson: true },
          },
          statuses: { orderBy: { order: 'asc' } },
          customFields: true,
          // Space.docs is already scoped by the spaceId foreign key — task-scoped docs (spaceId
          // null) never come back here, they stay reachable only via /api/tasks/[id]/docs.
          docFolders: { where: { deletedAt: null }, select: { id: true, name: true, color: true, icon: true, spaceId: true, parentId: true, order: true } },
          docs: { where: { deletedAt: null }, select: { id: true, title: true, content: true, color: true, textColor: true, order: true, taskId: true, spaceId: true, folderId: true, boardFolderId: true, parentId: true, ownerId: true, contributorIdsJson: true, archived: true, coverImageUrl: true, subtitle: true, pageWidth: true, showLastModified: true, createdAt: true, updatedAt: true } },
        },
      },
    },
  });

  const mapped = await Promise.all(
    workspaces.map(async (ws) => {
      // One access-context lookup per workspace (not per row) — see lib/auth/access.ts.
      const ctx = await getAccessContext(ws.id, userId);

      return {
        ...ws,
        members: ws.memberships.map((m) => ({ ...m.user, workspaceRole: m.role })),
        memberships: undefined,
        roles: ws.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, memberIds: r.members.map((m) => m.id) })),
        // Spaces/Folders/Lists a private-and-inaccessible caller can't see are dropped entirely
        // here, not just visually hidden client-side — matches how GET already returns [] for a
        // signed-out request rather than trusting the client to not render what it received.
        spaces: ws.spaces
          .filter((s) => canSee(s, ctx))
          .map(({ docs, folders, lists, ...s }) => {
            // A Folder or List nested inside a private-and-inaccessible ancestor Folder must stay
            // hidden even if it isn't independently marked private itself — folderChainVisible
            // walks the full (unfiltered) folders array's parentId chain to check that, not just
            // each row's own isPrivate flag (see lib/auth/access.ts's comment on why this needs
            // its own helper rather than a plain .filter(canSee)).
            const folderChainVisible = buildFolderChainVisibility(folders);
            return {
              ...s,
              folders: folders.filter((f) => canSee(f, ctx) && folderChainVisible(f.parentId, ctx)),
              lists: lists.filter((l) => canSee(l, ctx) && folderChainVisible(l.folderId, ctx)),
              // Prisma's relation is named `docs` (matching the Doc model's `space` relation) —
              // renamed here to `spaceDocs` to match HierarchySpace's frontend field and avoid any
              // confusion with the store's separate top-level `docs: Record<taskId, TaskDoc[]>` state.
              // Owner/contributor avatars are resolved client-side against this workspace's own
              // `members` list above rather than a nested `include` here, per the publicUserSelect
              // leak-avoidance precedent.
              spaceDocs: docs.map(({ contributorIdsJson, ...d }) => ({
                ...d,
                contributorIds: JSON.parse(contributorIdsJson) as string[],
              })),
              customFields: s.customFields.map((cf) => ({
                ...cf,
                options: JSON.parse(cf.options),
              })),
            };
          }),
      };
    })
  );

  return NextResponse.json(mapped);
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json();

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name || 'Untitled workspace',
      // The creator is always 'owner' — the one workspace-level tier that's permanent and
      // exclusive (see lib/auth/access.ts / PLANNING.md for why this couldn't stay a plain
      // implicit User<->Workspace M2M once a role tier needed attaching to the membership itself).
      memberships: { create: { userId, role: 'owner' } },
    },
    select: { id: true, name: true, messageOfTheDay: true, createdAt: true },
  });
  return NextResponse.json(workspace);
}
