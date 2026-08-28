'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, ListChecks, FileText, UserCircle, List as ListIcon, Layers, MessageSquare } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import { useChatStore } from '../store/useChatStore';
import { useSessionStore } from '../store/useSessionStore';
import { scoreMatch } from '../lib/search';

// Searches everything already loaded eagerly client-side: Task titles, both standalone (Docs-tab)
// AND task-scoped Doc titles (the latter bulk-loaded into `docs` via GET /api/task-docs at
// startup, same field the task modal's Documents tab lazily refreshes per-task), People names,
// Space/List names, and Chat channels/DMs (also fetched eagerly at app mount — app/page.tsx's own
// unread-badge polling effect — not just once Chat's own sidebar has been opened).
type PaletteResult =
  | { kind: 'task'; id: string; label: string; sub?: string; score: number }
  | {
      kind: 'doc';
      id: string;
      label: string;
      sub?: string;
      score: number;
      // Standalone (Docs-tab) docs carry spaceId/folderId; task-scoped docs carry taskId instead —
      // exactly one of the two is ever set, dispatched on in `activate()`.
      spaceId?: string;
      folderId?: string | null;
      taskId?: string;
    }
  | { kind: 'person'; id: string; label: string; sub?: string; score: number }
  | { kind: 'space'; id: string; label: string; sub?: string; score: number }
  | { kind: 'list'; id: string; label: string; spaceId: string; sub?: string; score: number }
  | { kind: 'channel'; id: string; label: string; sub?: string; score: number; isDm: boolean };

const CATEGORY_LABEL: Record<PaletteResult['kind'], string> = {
  task: 'Tasks',
  doc: 'Docs',
  person: 'People',
  space: 'Spaces',
  list: 'Lists',
  channel: 'Chats & Channels',
};

const CATEGORY_ICON: Record<PaletteResult['kind'], typeof Search> = {
  task: ListChecks,
  doc: FileText,
  person: UserCircle,
  space: Layers,
  list: ListIcon,
  channel: MessageSquare,
};

const MAX_PER_CATEGORY = 5;
// Higher cap when scopeKind narrows the results to just one category — no other categories are
// competing for the same result-list space, so there's room to actually browse more than 5.
const MAX_PER_SCOPED_CATEGORY = 20;

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  // When set, only this one category's results are shown/searched — used by the Docs tab's own
  // search bar (app/page.tsx passes 'doc' whenever activeView === 'docs') so a docs-only screen
  // gets docs-only search instead of the full task/people/space/list index every other screen
  // wants. undefined (the default) searches everything, unchanged.
  scopeKind?: PaletteResult['kind'];
};

export default function CommandPalette({ open, onClose, onOpenTask, scopeKind }: CommandPaletteProps) {
  const { tasks, users, workspaces, docs, activeWorkspaceId, setActiveView, setNavigation, setDocsNavigation, setActiveOfficeUserId } = useTaskStore();
  const { channelsByWorkspace, dms, setActiveChannelId, setActiveChatSidebarTab } = useChatStore();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // The input isn't mounted yet on the render that flips `open` true — wait a tick.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const byCategory: Record<PaletteResult['kind'], PaletteResult[]> = { task: [], doc: [], person: [], space: [], list: [], channel: [] };

    for (const t of tasks) {
      const score = scoreMatch(t.title, q);
      if (score !== null) byCategory.task.push({ kind: 'task', id: t.id, label: t.title, sub: t.archived ? 'Archived' : undefined, score });
    }
    for (const u of users) {
      const score = scoreMatch(u.name, q);
      if (score !== null) byCategory.person.push({ kind: 'person', id: u.id, label: u.name, score });
    }
    for (const taskId in docs) {
      const owningTask = tasks.find((t) => t.id === taskId);
      for (const doc of docs[taskId]) {
        const docScore = scoreMatch(doc.title, q);
        if (docScore !== null) {
          byCategory.doc.push({
            kind: 'doc',
            id: doc.id,
            label: doc.title || 'Untitled',
            taskId,
            sub: owningTask?.title,
            score: docScore,
          });
        }
      }
    }
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        const spaceScore = scoreMatch(space.name, q);
        if (spaceScore !== null) byCategory.space.push({ kind: 'space', id: space.id, label: space.name, score: spaceScore });
        for (const list of space.lists) {
          const listScore = scoreMatch(list.name, q);
          if (listScore !== null) {
            byCategory.list.push({ kind: 'list', id: list.id, label: list.name, spaceId: space.id, sub: space.name, score: listScore });
          }
        }
        for (const doc of space.spaceDocs) {
          const docScore = scoreMatch(doc.title, q);
          if (docScore !== null) {
            byCategory.doc.push({
              kind: 'doc',
              id: doc.id,
              label: doc.title || 'Untitled',
              spaceId: space.id,
              folderId: doc.folderId,
              sub: space.name,
              score: docScore,
            });
          }
        }
      }
    }

    // Channels (current workspace only, matching ChatSidebar's own scoping) + DMs (all, workspace-
    // agnostic — Connections can span workspaces entirely). A DM has no `name` of its own; its
    // label is built from its other members exactly like ChatSidebar.tsx's own DM row does, so a
    // search result reads the same as the list it came from.
    const currentChannels = activeWorkspaceId ? channelsByWorkspace[activeWorkspaceId] ?? [] : [];
    for (const c of currentChannels) {
      const score = scoreMatch(c.name ?? '', q);
      if (score !== null) byCategory.channel.push({ kind: 'channel', id: c.id, label: c.name ?? 'Untitled', score, isDm: false });
    }
    for (const dm of dms) {
      const others = (dm.members ?? []).map((m) => m.user).filter((u) => u.id !== currentUserId);
      const label = others.map((u) => u.name).join(', ') || 'Just you';
      const score = scoreMatch(label, q);
      if (score !== null) byCategory.channel.push({ kind: 'channel', id: dm.id, label, sub: 'DM', score, isDm: true });
    }

    const flat: PaletteResult[] = [];
    // scopeKind narrows this to one category — MAX_PER_SCOPED_CATEGORY (not the general
    // MAX_PER_CATEGORY) since there's no longer four other categories' worth of results competing
    // for the same limited list space.
    const kinds = scopeKind ? [scopeKind] : (['task', 'doc', 'person', 'space', 'list', 'channel'] as const);
    const cap = scopeKind ? MAX_PER_SCOPED_CATEGORY : MAX_PER_CATEGORY;
    for (const kind of kinds) {
      byCategory[kind]
        .sort((a, b) => a.score - b.score || a.label.length - b.label.length)
        .slice(0, cap)
        .forEach((r) => flat.push(r));
    }
    return flat;
  }, [query, tasks, users, workspaces, docs, scopeKind, activeWorkspaceId, channelsByWorkspace, dms, currentUserId]);

  const activate = (r: PaletteResult) => {
    if (r.kind === 'task') {
      onOpenTask(r.id);
    } else if (r.kind === 'doc') {
      if (r.taskId) {
        // No deep-link straight to this specific doc tab within the modal (the task-modal's
        // auto-select-first-doc effect would need a "pending doc" hook to not stomp on it) —
        // landing on the task itself, doc tab visible right there, is enough to fix "I couldn't
        // find this doc via search at all."
        onOpenTask(r.taskId);
      } else if (r.spaceId !== undefined) {
        setActiveView('docs');
        setNavigation(r.spaceId, []);
        setDocsNavigation(r.folderId ?? null, r.id);
      }
    } else if (r.kind === 'person') {
      setActiveView('office');
      setActiveOfficeUserId(r.id);
    } else if (r.kind === 'space') {
      setActiveView('board');
      setNavigation(r.id, []);
    } else if (r.kind === 'list') {
      setActiveView('board');
      setNavigation(r.spaceId, [r.id]);
    } else if (r.kind === 'channel') {
      setActiveView('chat');
      setActiveChatSidebarTab(r.isDm ? 'dms' : 'channels');
      setActiveChannelId(r.id);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIndex];
      if (r) activate(r);
    }
  };

  // Category headers are rendered inline as we walk the flat list, only when the category changes.
  let lastKind: PaletteResult['kind'] | null = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-neutral-950/70 backdrop-blur-xs pt-[15vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
              <Search className="w-4 h-4 text-neutral-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  scopeKind === 'doc'
                    ? 'Search docs...'
                    : scopeKind === 'channel'
                    ? 'Search chats and channels...'
                    : 'Search tasks, docs, people, spaces & lists...'
                }
                className="flex-1 bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
              />
            </div>

            <div className="max-h-96 overflow-y-auto py-1">
              {query.trim() && results.length === 0 && (
                <p className="text-xs text-neutral-500 px-4 py-6 text-center">No results for "{query.trim()}".</p>
              )}
              {results.map((r, i) => {
                const showHeader = r.kind !== lastKind;
                lastKind = r.kind;
                const Icon = CATEGORY_ICON[r.kind];
                return (
                  <div key={`${r.kind}-${r.id}`}>
                    {showHeader && (
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-4 pt-2.5 pb-1">
                        {CATEGORY_LABEL[r.kind]}
                      </div>
                    )}
                    <button
                      onClick={() => activate(r)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full text-left px-4 py-1.5 flex items-center justify-between gap-2 cursor-pointer ${
                        i === selectedIndex ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/60'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0 truncate">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-xs">{r.label}</span>
                      </span>
                      {r.sub && <span className="text-[10px] text-neutral-500 shrink-0">{r.sub}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
