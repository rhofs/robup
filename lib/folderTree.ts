import type { HierarchySpace } from '../store/useTaskStore';

export const getChildFolders = (space: HierarchySpace, parentId: string | null) =>
  space.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

// `archived` defaults to false (the normal sidebar view) — the "Archive"/"Viewing archive"
// toggle (app/page.tsx's showArchived) passes true to show only the archived ones instead,
// mirroring how the task table already flips between the two sets.
// A Doc's own Lists (docId set — made from a task-list block in that Doc) are never part of the tree.
export const getListsIn = (space: HierarchySpace, folderId: string | null, archived = false) =>
  space.lists.filter((l) => l.folderId === folderId && l.archived === archived && !l.docId).sort((a, b) => a.order - b.order);

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
// (Folders, Lists and Docs in their shared order at each level, each Folder's own children walked
// before moving to the next sibling) — used to resolve a Shift-click range selection into
// "everything visually between the anchor and the click," even across a currently-collapsed folder.
export const getOrderedListIds = (space: HierarchySpace, parentId: string | null = null): string[] => {
  const shownLists = new Set(getListsIn(space, parentId).map((l) => l.id));
  const result: string[] = [];
  for (const item of sidebarSiblings(space, parentId)) {
    if (item.type === 'folder') result.push(...getOrderedListIds(space, item.id));
    else if (item.type === 'list' && shownLists.has(item.id)) result.push(item.id);
  }
  return result;
};

// Would moving `folderId` under `candidateParentId` create a cycle (dropping a folder onto its own descendant)?
export const isDescendantOf = (space: HierarchySpace, candidateParentId: string, folderId: string): boolean => {
  if (candidateParentId === folderId) return true;
  return collectFolderIdsUnder(space, folderId).includes(candidateParentId);
};

// One level of a Space's sidebar (components/FolderTree.tsx) — its Folders, Lists and Docs in their
// one shared order, so a List can sit between two Folders or above one: "det går ikke an å legge de
// mellom 2 folders, eller over folders" (2026-10-21). Ties keep Folders, then Lists, then Docs, which
// is how they were drawn when each kind had an order of its own (and why every Folder was given a
// negative order when the orders were joined — migration 20261021120000_folders_share_sidebar_order).
export type SidebarItemType = 'folder' | 'list' | 'doc';
export type SidebarSibling = { type: SidebarItemType; id: string; order: number };
export const sidebarSiblings = (space: HierarchySpace, parentId: string | null): SidebarSibling[] =>
  [
    ...space.folders.filter((f) => f.parentId === parentId).map((f) => ({ type: 'folder' as const, id: f.id, order: f.order })),
    ...space.lists.filter((l) => l.folderId === parentId && !l.docId).map((l) => ({ type: 'list' as const, id: l.id, order: l.order })),
    ...space.spaceDocs
      .filter((d) => d.boardFolderId === parentId && d.parentId === null)
      .map((d) => ({ type: 'doc' as const, id: d.id, order: d.order })),
  ].sort((a, b) => a.order - b.order);

// The Folder an item sits in on that sidebar (null = the Space's top level).
export const sidebarParentOf = (space: HierarchySpace, item: { type: SidebarItemType; id: string }): string | null =>
  item.type === 'folder'
    ? space.folders.find((f) => f.id === item.id)?.parentId ?? null
    : item.type === 'list'
      ? space.lists.find((l) => l.id === item.id)?.folderId ?? null
      : space.spaceDocs.find((d) => d.id === item.id)?.boardFolderId ?? null;

// Where a dragged item ends up (app/page.tsx placeSidebarItem): next to `target` (above/below), or
// last inside the Folder `target` (inside). Returns the Folder it will be in, whether that is a move
// (another Folder or Space) rather than a reorder, and the level's new order with the dragged item in
// it (its order NaN: it always has to be written). Null when it cannot go there — a Folder into
// itself or anywhere under it, or a target that is not where it was looked for.
export function planSidebarPlacement(
  sourceSpace: HierarchySpace,
  dragged: { type: SidebarItemType; id: string },
  targetSpace: HierarchySpace,
  target: { type: SidebarItemType; id: string },
  position: 'above' | 'below' | 'inside'
): { newParent: string | null; moving: boolean; next: SidebarSibling[] } | null {
  if (dragged.type === target.type && dragged.id === target.id) return null;
  if (position === 'inside' && target.type !== 'folder') return null;
  const newParent = position === 'inside' ? target.id : sidebarParentOf(targetSpace, target);
  if (
    dragged.type === 'folder' &&
    targetSpace.id === sourceSpace.id &&
    newParent !== null &&
    (newParent === dragged.id || isDescendantOf(sourceSpace, newParent, dragged.id))
  )
    return null;
  const moving = sourceSpace.id !== targetSpace.id || sidebarParentOf(sourceSpace, dragged) !== newParent;
  const siblings = sidebarSiblings(targetSpace, newParent).filter((s) => !(s.type === dragged.type && s.id === dragged.id));
  let insertAt = siblings.length;
  if (position !== 'inside') {
    const targetIndex = siblings.findIndex((s) => s.type === target.type && s.id === target.id);
    if (targetIndex === -1) return null;
    insertAt = position === 'below' ? targetIndex + 1 : targetIndex;
  }
  return { newParent, moving, next: [...siblings.slice(0, insertAt), { ...dragged, order: Number.NaN }, ...siblings.slice(insertAt)] };
}
