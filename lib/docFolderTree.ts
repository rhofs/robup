import type { HierarchySpace, TaskDoc } from '../store/useTaskStore';

// Same small set of pure tree helpers as lib/folderTree.ts, rewritten against
// docFolders/spaceDocs instead of folders/lists — kept as a separate file rather than
// generalizing the original, since the two field names are the only thing that differs.

export const getChildDocFolders = (space: HierarchySpace, parentId: string | null) =>
  space.docFolders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

// Root-level docs only (parentId === null) — a subpage (nested under another Doc) always has
// folderId: null too, so without the parentId check it would wrongly show up at the space root
// alongside real root-level docs. Reached only via getChildDocs below, from its parent doc.
export const getSpaceDocsIn = (space: HierarchySpace, folderId: string | null) =>
  space.spaceDocs.filter((d) => d.folderId === folderId && d.parentId === null).sort((a, b) => a.order - b.order);

// Direct subpages of a given Doc, for the sidebar's expand-in-place and the book panel's tree.
export const getChildDocs = (space: HierarchySpace, parentDocId: string) =>
  space.spaceDocs.filter((d) => d.parentId === parentDocId).sort((a, b) => a.order - b.order);

// Walks parentId upward from `docId` to the top-most ancestor with no parent — the "book root"
// whose own subtree the DocSubpagesPanel shows in full, not just docId's own direct children.
export const getDocRoot = (space: HierarchySpace, docId: string): TaskDoc | null => {
  let cursor = space.spaceDocs.find((d) => d.id === docId) ?? null;
  while (cursor?.parentId) {
    const parent = space.spaceDocs.find((d) => d.id === cursor!.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor;
};

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
