import { create } from 'zustand';

// Each workspace's Wiki: its pages (title, place in the book, plain text for search) and what the
// current user may do there. A store of its own rather than a slice of useTaskStore: the wiki is
// loaded on its own schedule (when opened, and for the command palette's search), and nothing in the
// task store needs to know about it.

export type WikiPage = {
  id: string;
  title: string;
  parentId: string | null;
  order: number;
  text: string;
  updatedAt: string;
};

export type WikiEditorEntry = { type: 'user' | 'role'; id: string };

export type WikiState = {
  pages: WikiPage[];
  canEdit: boolean;
  isManager: boolean;
  editors: WikiEditorEntry[];
  feedbackListId: string | null;
};

type WikiStore = {
  byWorkspace: Record<string, WikiState | undefined>;
  loading: Record<string, boolean>;
  fetchWiki: (workspaceId: string) => Promise<void>;
  createPage: (workspaceId: string, title: string, parentId: string | null) => Promise<WikiPage | null>;
  updatePage: (workspaceId: string, pageId: string, patch: { title?: string; order?: number; parentId?: string | null }) => Promise<void>;
  deletePage: (workspaceId: string, pageId: string) => Promise<void>;
  saveSettings: (workspaceId: string, patch: { editors?: WikiEditorEntry[]; feedbackListId?: string | null }) => Promise<void>;
  sendFeedback: (workspaceId: string, kind: 'bug' | 'feature', title: string, details: string) => Promise<{ ok: true } | { error: string }>;
};

// Chapters in order, each with its pages in order — the book's reading order, which previous/next
// and the table of contents both follow.
export function wikiChapters(pages: WikiPage[]) {
  const byOrder = (a: WikiPage, b: WikiPage) => a.order - b.order;
  return pages
    .filter((p) => !p.parentId)
    .sort(byOrder)
    .map((chapter) => ({ chapter, pages: pages.filter((p) => p.parentId === chapter.id).sort(byOrder) }));
}

export function wikiReadingOrder(pages: WikiPage[]): WikiPage[] {
  return wikiChapters(pages).flatMap(({ chapter, pages: ps }) => [chapter, ...ps]);
}

const patchPages = (state: WikiState | undefined, fn: (pages: WikiPage[]) => WikiPage[]) => (state ? { ...state, pages: fn(state.pages) } : state);

export const useWikiStore = create<WikiStore>((set, get) => ({
  byWorkspace: {},
  loading: {},

  fetchWiki: async (workspaceId) => {
    set((s) => ({ loading: { ...s.loading, [workspaceId]: true } }));
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/wiki`);
      if (!res.ok) return;
      const data = (await res.json()) as WikiState;
      set((s) => ({ byWorkspace: { ...s.byWorkspace, [workspaceId]: data } }));
    } finally {
      set((s) => ({ loading: { ...s.loading, [workspaceId]: false } }));
    }
  },

  createPage: async (workspaceId, title, parentId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/wiki/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parentId }),
    });
    if (!res.ok) return null;
    const page = (await res.json()) as WikiPage;
    set((s) => ({ byWorkspace: { ...s.byWorkspace, [workspaceId]: patchPages(s.byWorkspace[workspaceId], (ps) => [...ps, page]) } }));
    return page;
  },

  // Optimistic — a rename or a move shows at once and is sent after; on failure the wiki is
  // re-fetched, so what is on screen never stays out of step with the server.
  updatePage: async (workspaceId, pageId, patch) => {
    set((s) => ({
      byWorkspace: {
        ...s.byWorkspace,
        [workspaceId]: patchPages(s.byWorkspace[workspaceId], (ps) => ps.map((p) => (p.id === pageId ? { ...p, ...patch } : p))),
      },
    }));
    const res = await fetch(`/api/workspaces/${workspaceId}/wiki/pages/${pageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) await get().fetchWiki(workspaceId);
  },

  deletePage: async (workspaceId, pageId) => {
    set((s) => ({
      byWorkspace: {
        ...s.byWorkspace,
        [workspaceId]: patchPages(s.byWorkspace[workspaceId], (ps) => ps.filter((p) => p.id !== pageId && p.parentId !== pageId)),
      },
    }));
    const res = await fetch(`/api/workspaces/${workspaceId}/wiki/pages/${pageId}`, { method: 'DELETE' });
    if (!res.ok) await get().fetchWiki(workspaceId);
  },

  saveSettings: async (workspaceId, patch) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/wiki`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const saved = (await res.json()) as { editors: WikiEditorEntry[]; feedbackListId: string | null };
    set((s) => {
      const cur = s.byWorkspace[workspaceId];
      return cur ? { byWorkspace: { ...s.byWorkspace, [workspaceId]: { ...cur, ...saved } } } : s;
    });
  },

  sendFeedback: async (workspaceId, kind, title, details) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/wiki/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title, details }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return { error: body.error ?? 'Could not send it — try again.' };
  },
}));
