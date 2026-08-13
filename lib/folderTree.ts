import type { HierarchySpace } from '../store/useTaskStore';

export const getChildFolders = (space: HierarchySpace, parentId: string | null) =>
  space.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

// `archived` defaults to false (the normal sidebar view) — the "Archive"/"Viewing archive"
// toggle (app/page.tsx's showArchived) passes true to show only the archived ones instead,
// mirroring how the task table already flips between the two sets.
export const getListsIn = (space: HierarchySpace, folderId: string | null, archived = false) =>
  space.lists.filter((l) => l.folderId === folderId && l.archived === archived).sort((a, b) => a.order - b.order);

// Docs filed under a real Folder in the Tasks-tab sidebar — a second, independent axis from
// lib/docFolderTree.ts's getSpaceDocsIn (which reads folderId/DocFolder, the Docs tab's own
// tree). Root-level only (parentId === null), same reasoning as getSpaceDocsIn: a subpage's own
// boardFolderId is irrelevant, it's only ever reached through its parent doc.
export const getBoardDocsIn = (space: HierarchySpace, folderId: string | null, archived = false) =>
  space.spaceDocs
    .filter((d) => d.boardFolderId === folderId && d.parentId === null && d.archived === archived)
    .sort((a, b) => a.order - b.order);

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

// Every List id in the space, in the same depth-first order FolderTree.tsx actually renders them
// (folders before lists at each level, each folder's own children walked before moving to the
// next sibling) — used to resolve a Shift-click range selection into "everything visually
// between the anchor and the click," even across a currently-collapsed folder.
export const getOrderedListIds = (space: HierarchySpace, parentId: string | null = null): string[] => {
  const result: string[] = [];
  for (const folder of getChildFolders(space, parentId)) {
    result.push(...getOrderedListIds(space, folder.id));
  }
  result.push(...getListsIn(space, parentId).map((l) => l.id));
  return result;
};

// Would moving `folderId` under `candidateParentId` create a cycle (dropping a folder onto its own descendant)?
export const isDescendantOf = (space: HierarchySpace, candidateParentId: string, folderId: string): boolean => {
  if (candidateParentId === folderId) return true;
  return collectFolderIdsUnder(space, folderId).includes(candidateParentId);
};
