import { prisma } from '@/lib/prisma';
import { getAccessContext, canSee, buildFolderChainVisibility } from '@/lib/auth/access';

// Same "ensureXAccess" contract as lib/auth/chatAccess.ts's ensureChannelAccess — authenticate,
// then confirm the caller can actually SEE the resource before a route does anything with it.
// This app's own access model is visibility-only, not permission bits (see the 2026-08-09
// access-control session in PLANNING.md): there's no separate "can edit" distinct from "can see,"
// so a single check covers every route method. Each helper returns the loaded resource (so the
// calling route doesn't need a second fetch) or null (caller returns 403/404). Every level below
// is checked independently — a List isn't private itself but sitting inside a private Folder must
// still be hidden, same "each level independent" design as everywhere else in this schema.
//
// Deliberately does NOT gate on deletedAt (Trash) at any level — every Task/Doc/Folder/List/Space
// PATCH route shares the same `body.restore === true` un-delete flag, which only ever targets an
// already-soft-deleted row. Whether something shows up in a *live list* (deletedAt: null) is each
// route's own separate concern; whether a specific known id is one this caller may act on at all
// is this file's only job, independent of trash state.

export async function ensureSpaceAccess(spaceId: string, userId: string) {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) return null;
  const ctx = await getAccessContext(space.workspaceId, userId);
  if (!ctx.isMember || !canSee(space, ctx)) return null;
  return { space, ctx };
}

export async function ensureFolderAccess(folderId: string, userId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return null;
  const spaceResult = await ensureSpaceAccess(folder.spaceId, userId);
  if (!spaceResult) return null;
  const { ctx } = spaceResult;
  if (folder.parentId) {
    const folders = await prisma.folder.findMany({
      where: { spaceId: folder.spaceId },
      select: { id: true, parentId: true, isPrivate: true, accessJson: true },
    });
    const folderChainVisible = buildFolderChainVisibility(folders);
    if (!folderChainVisible(folder.parentId, ctx)) return null;
  }
  if (!canSee(folder, ctx)) return null;
  return { folder, space: spaceResult.space, ctx };
}

export async function ensureListAccess(listId: string, userId: string) {
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list) return null;
  if (list.folderId) {
    const folderResult = await ensureFolderAccess(list.folderId, userId);
    if (!folderResult) return null;
    if (!canSee(list, folderResult.ctx)) return null;
    return { list, space: folderResult.space, ctx: folderResult.ctx };
  }
  const spaceResult = await ensureSpaceAccess(list.spaceId, userId);
  if (!spaceResult) return null;
  if (!canSee(list, spaceResult.ctx)) return null;
  return { list, space: spaceResult.space, ctx: spaceResult.ctx };
}

export async function ensureTaskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  const listResult = await ensureListAccess(task.listId, userId);
  if (!listResult) return null;
  if (!canSee(task, listResult.ctx)) return null;
  return { task, list: listResult.list, space: listResult.space, ctx: listResult.ctx };
}

// Doc has no isPrivate/accessJson of its own — it inherits visibility from whichever of its
// parents are actually set (see the schema's own comment on Doc). A Doc can in principle have
// more than one parent path at once; visible if ANY one of them is, matching how it's already
// exposed today through two independent listing endpoints (GET /api/workspaces's spaceDocs via
// the Space/Folder chain, GET /api/task-docs via the Task chain) — not a new stricter rule.
export async function ensureDocAccess(docId: string, userId: string) {
  const doc = await prisma.doc.findUnique({ where: { id: docId } });
  if (!doc) return null;

  if (doc.taskId) {
    const taskResult = await ensureTaskAccess(doc.taskId, userId);
    if (taskResult) return { doc, ctx: taskResult.ctx };
  }
  if (doc.boardFolderId) {
    const folderResult = await ensureFolderAccess(doc.boardFolderId, userId);
    if (folderResult) return { doc, ctx: folderResult.ctx };
  }
  if (doc.spaceId) {
    // doc.folderId (if set) points at a DocFolder, a separate unprivileged tree from Folder — only
    // the Space itself gates visibility here, same as DocFolder's own access helper below.
    const spaceResult = await ensureSpaceAccess(doc.spaceId, userId);
    if (spaceResult) return { doc, ctx: spaceResult.ctx };
  }
  return null;
}

// DocFolder (the Docs tab's own folder tree, unrelated to Folder/Task's tree) has no isPrivate of
// its own either — same as Doc, it inherits from its Space.
export async function ensureDocFolderAccess(docFolderId: string, userId: string) {
  const docFolder = await prisma.docFolder.findUnique({ where: { id: docFolderId } });
  if (!docFolder) return null;
  const spaceResult = await ensureSpaceAccess(docFolder.spaceId, userId);
  if (!spaceResult) return null;
  return { docFolder, ctx: spaceResult.ctx };
}
