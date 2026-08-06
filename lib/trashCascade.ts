import { prisma } from './prisma';

// Soft-delete / restore for the whole tree, one shared pair of "walk down and stamp
// deletedAt" helpers. `when: Date` soft-deletes (cascades the same timestamp down);
// `when: null` restores (clears it back down) — same function, opposite direction, so
// delete and restore can never drift out of sync with each other.
//
// Only Folder and DocFolder need an actual tree walk (parentId self-relation) to find
// "everything under this specific node" — List/Task/Doc are leaves or one level flat, and
// Space's descendants all carry spaceId directly, so those cases can filter in one query
// instead of recursing.

async function collectFolderSubtreeIds(rootFolderId: string): Promise<string[]> {
  const ids: string[] = [rootFolderId];
  let frontier = [rootFolderId];
  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

async function collectDocFolderSubtreeIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.docFolder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

export async function cascadeFolder(folderId: string, when: Date | null) {
  const folderIds = await collectFolderSubtreeIds(folderId);
  await prisma.$transaction([
    prisma.folder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: when } }),
    prisma.list.updateMany({ where: { folderId: { in: folderIds } }, data: { deletedAt: when } }),
    prisma.task.updateMany({ where: { list: { folderId: { in: folderIds } } }, data: { deletedAt: when } }),
  ]);
}

export async function cascadeList(listId: string, when: Date | null) {
  await prisma.$transaction([
    prisma.list.update({ where: { id: listId }, data: { deletedAt: when } }),
    prisma.task.updateMany({ where: { listId }, data: { deletedAt: when } }),
  ]);
}

export async function cascadeDocFolder(docFolderId: string, when: Date | null) {
  const folderIds = await collectDocFolderSubtreeIds(docFolderId);
  await prisma.$transaction([
    prisma.docFolder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: when } }),
    prisma.doc.updateMany({ where: { folderId: { in: folderIds } }, data: { deletedAt: when } }),
  ]);
}

async function collectTaskSubtreeIds(rootTaskId: string): Promise<string[]> {
  const ids: string[] = [rootTaskId];
  let frontier = [rootTaskId];
  while (frontier.length > 0) {
    const children = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

// Subtasks are normally one level deep in this app's UI, but the schema allows arbitrary
// self-nesting, so this walks the same way Folder/DocFolder do rather than assuming a fixed depth.
export async function cascadeTask(taskId: string, when: Date | null) {
  const taskIds = await collectTaskSubtreeIds(taskId);
  await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { deletedAt: when } });
}

export async function cascadeSpace(spaceId: string, when: Date | null) {
  await prisma.$transaction([
    prisma.space.update({ where: { id: spaceId }, data: { deletedAt: when } }),
    prisma.folder.updateMany({ where: { spaceId }, data: { deletedAt: when } }),
    prisma.list.updateMany({ where: { spaceId }, data: { deletedAt: when } }),
    prisma.task.updateMany({ where: { list: { spaceId } }, data: { deletedAt: when } }),
    prisma.docFolder.updateMany({ where: { spaceId }, data: { deletedAt: when } }),
    prisma.doc.updateMany({ where: { spaceId }, data: { deletedAt: when } }),
  ]);
}
