import type { HierarchySpace, TaskDoc } from '../store/useTaskStore';

// Same small set of pure tree helpers as lib/folderTree.ts, rewritten against
// docFolders/spaceDocs instead of folders/lists — kept as a separate file rather than
// generalizing the original, since the two field names are the only thing that differs.

export const getChildDocFolders = (space: HierarchySpace, parentId: string | null) =>
  space.docFolders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order);

// Root-level docs only (parentId === null) — a subpage (nested under another Doc) always has
// folderId: null too, so without the parentId check it would wrongly show up at the space root
// alongside real root-level docs. Reached only via getChildDocs below, from its parent doc.
// Archived docs never show here — the Docs tab has no Archive-browsing concept of its own; the
// only place to see/restore one is the Tasks-tab sidebar's existing Archive toggle (see
// lib/folderTree.ts's getBoardDocsIn, which does take an `archived` param for that).
export const getSpaceDocsIn = (space: HierarchySpace, folderId: string | null) =>
  space.spaceDocs.filter((d) => d.folderId === folderId && d.parentId === null && !d.archived).sort((a, b) => a.order - b.order);

// Docs created from inside a Space's Task-Folder tree (getBoardDocsIn, lib/folderTree.ts) have
// `boardFolderId` set but `folderId` left null — meaning they never show up anywhere in *this*
// tree at all, which is exactly what "kun 1 doc, men det er flere i workspacet" turned out to be:
// two genuinely separate doc trees that don't share content. Per explicit direction ("alle docs
// synes i docs fanen, men de kan eksistere i Spaces også") these are surfaced flattened at the
// Docs tab's own root level (DocsBrowser.tsx only calls this for folderId === null) rather than
// mixed into the folder hierarchy — they have no matching DocFolder location to slot into, and a
// doc that happens to have *both* folderId and boardFolderId set already appears via its folderId
// above, so it's deliberately excluded here to avoid listing it twice.
export const getUnfiledBoardDocs = (space: HierarchySpace) =>
  space.spaceDocs
    .filter((d) => d.boardFolderId !== null && d.folderId === null && d.parentId === null && !d.archived)
    .sort((a, b) => a.order - b.order);

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

export type WorkspaceDocEntry = { doc: TaskDoc; space: HierarchySpace };

// Every real, top-level doc across every Space in a workspace, flattened into one list — the
// Docs tab's own data source now, replacing the old "pick a Space first" per-Space DocFolder
// browse (per direct feedback: "every single space has its own docs folder... I want that
// removed... the docs tab should list all docs in the workspace"). A Doc's own spaceId/folderId
// are untouched by this — it still genuinely "lives" wherever it was filed (a Space's DocFolder
// tree, or a board Folder via boardFolderId) — this just reads across every Space at once instead
// of requiring one to be selected first, the same way CommandPalette.tsx's own search index
// already loops every space's spaceDocs for its "doc" results. Root-level only (parentId === null,
// matching getSpaceDocsIn/getUnfiledBoardDocs above) — a subpage is reached through its parent doc,
// not listed here as its own top-level entry. Sorted most-recently-updated first, since a flat
// cross-space list has no folder structure left to browse by.
export const getAllWorkspaceDocs = (spaces: HierarchySpace[]): WorkspaceDocEntry[] => {
  const out: WorkspaceDocEntry[] = [];
  for (const space of spaces) {
    for (const doc of space.spaceDocs) {
      if (doc.parentId !== null || doc.archived) continue;
      out.push({ doc, space });
    }
  }
  return out.sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime());
};
