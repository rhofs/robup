import { prisma } from './prisma';

// Archive/restore for a List or Doc — sibling to lib/trashCascade.ts's soft-delete pair, same
// "one function, opposite direction via a boolean flag" shape, but genuinely independent of
// deletedAt/Trash: archiving is a non-destructive "get this out of the way" state, not marked for
// deletion. `archived: true` archives (cascades down), `false` restores.

// A subpage (Doc.parentId set) carries no folderId of its own, only reached through its parent's
// parentId chain — same reasoning lib/trashCascade.ts's own collectDocSubtreeIds documents.
async function collectDocSubtreeIds(rootDocId: string): Promise<string[]> {
  const ids: string[] = [rootDocId];
  let frontier = [rootDocId];
  while (frontier.length > 0) {
    const children = await prisma.doc.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

export async function archiveList(listId: string, archived: boolean) {
  await prisma.$transaction([
    prisma.list.update({ where: { id: listId }, data: { archived } }),
    prisma.task.updateMany({ where: { listId }, data: { archived } }),
  ]);
}

export async function archiveDoc(docId: string, archived: boolean) {
  const docIds = await collectDocSubtreeIds(docId);
  await prisma.doc.updateMany({ where: { id: { in: docIds } }, data: { archived } });
}
