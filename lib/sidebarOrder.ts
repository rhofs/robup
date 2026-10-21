import { prisma } from '@/lib/prisma';

// Where a new Folder, List or Doc goes in a Space's sidebar: last at its level. Folders, Lists and
// Docs there share one order (lib/folderTree.ts sidebarSiblings), so "last" is one past the highest
// of all three — a count of one kind (the old way) could land a new item in the middle of the others,
// or tie with one of them.
export async function nextSidebarOrder(spaceId: string, parentId: string | null): Promise<number> {
  const [lists, folders, docs] = await Promise.all([
    prisma.list.aggregate({ where: { spaceId, folderId: parentId, docId: null }, _max: { order: true } }),
    prisma.folder.aggregate({ where: { spaceId, parentId }, _max: { order: true } }),
    prisma.doc.aggregate({ where: { spaceId, boardFolderId: parentId, parentId: null }, _max: { order: true } }),
  ]);
  return Math.max(lists._max.order ?? -1, folders._max.order ?? -1, docs._max.order ?? -1) + 1;
}
