import type { HierarchySpace } from '../store/useTaskStore';

export const getChildFolders = (space: HierarchySpace, parentId: string | null) =>
  space.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

export const getListsIn = (space: HierarchySpace, folderId: string | null) =>
  space.lists.filter((l) => l.folderId === folderId).sort((a, b) => a.order - b.order);

// All folder ids nested anywhere under `folderId` (not including `folderId` itself). Pass `null` for the whole space.
export const collectFolderIdsUnder = (space: HierarchySpace, folderId: string | null): string[] => {
  const out: string[] = [];
  const walk = (parentId: string | null) => {
    for (const f of space.folders) {
      if (f.parentId === parentId) {
        out.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(folderId);
  return out;
};

// All List ids living anywhere under `folderId` (recursively), plus its own direct lists. Pass `null` for the whole space.
export const collectListIdsUnder = (space: HierarchySpace, folderId: string | null): string[] => {
  const folderIds = folderId === null ? [null, ...collectFolderIdsUnder(space, null)] : [folderId, ...collectFolderIdsUnder(space, folderId)];
  const idSet = new Set(folderIds);
  return space.lists.filter((l) => idSet.has(l.folderId)).map((l) => l.id);
};

// Would moving `folderId` under `candidateParentId` create a cycle (dropping a folder onto its own descendant)?
export const isDescendantOf = (space: HierarchySpace, candidateParentId: string, folderId: string): boolean => {
  if (candidateParentId === folderId) return true;
  return collectFolderIdsUnder(space, folderId).includes(candidateParentId);
};
