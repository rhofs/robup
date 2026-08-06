import type { HierarchySpace } from '../store/useTaskStore';

// Same small set of pure tree helpers as lib/folderTree.ts, rewritten against
// docFolders/spaceDocs instead of folders/lists — kept as a separate file rather than
// generalizing the original, since the two field names are the only thing that differs.

export const getChildDocFolders = (space: HierarchySpace, parentId: string | null) =>
  space.docFolders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

export const getSpaceDocsIn = (space: HierarchySpace, folderId: string | null) =>
  space.spaceDocs.filter((d) => d.folderId === folderId).sort((a, b) => a.order - b.order);

// All DocFolder ids nested anywhere under `folderId` (not including `folderId` itself). Pass
// `null` for the whole space.
export const collectDocFolderIdsUnder = (space: HierarchySpace, folderId: string | null): string[] => {
  const out: string[] = [];
  const walk = (parentId: string | null) => {
    for (const f of space.docFolders) {
      if (f.parentId === parentId) {
        out.push(f.id);
        walk(f.id);
      }
    }
  };
  walk(folderId);
  return out;
};

// Would moving `folderId` under `candidateParentId` create a cycle (dropping a folder onto its
// own descendant)? Mirrors lib/folderTree.ts's isDescendantOf.
export const isDescendantOfDocFolder = (space: HierarchySpace, candidateParentId: string, folderId: string): boolean => {
  if (candidateParentId === folderId) return true;
  return collectDocFolderIdsUnder(space, folderId).includes(candidateParentId);
};
