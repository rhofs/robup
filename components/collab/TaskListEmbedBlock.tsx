'use client';

import { useMemo, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ListChecks, Plus, Search, ChevronDown, Repeat } from 'lucide-react';
import { useTaskStore, type Task, type AppUser } from '../../store/useTaskStore';
import type { TaskListEmbedExtensionOptions } from './taskListEmbedView';

// Node view for `taskListEmbed` (lib/collab/taskListEmbedNode.ts): one List's tasks, live, inside a doc
// — "ClickUp has this function in the Docs, where you can press +, and even add a 'Check list' with
// tasks". The rows are the store's own tasks, so a status changed here is changed on the board too,
// and a task added here lands in that List. Inserted without a List, it asks for one first.
//
// Only top-level, unarchived tasks, in the List's own order: the doc shows the List as a checklist of
// work, not its whole tree. Opening a task goes through the same jump a task mention uses.

const GRID = 'minmax(0,1fr) 120px 76px 64px';

type Picked = { id: string; name: string; spaceId: string; path: string; color: string | null };

function Avatar({ user }: { user: AppUser }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt={user.name} title={user.name} className="w-5 h-5 rounded-full border border-neutral-900 object-cover" />
  ) : (
    <span
      title={user.name}
      className="w-5 h-5 rounded-full border border-neutral-900 text-[9px] font-bold flex items-center justify-center text-white"
      style={{ backgroundColor: user.color }}
    >
      {user.initials}
    </span>
  );
}

function shortDate(iso: string | Date | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TaskListEmbedBlock({ node, updateAttributes, editor, extension }: ReactNodeViewProps) {
  const { listId } = node.attrs as { listId: string | null };
  const options = extension.options as TaskListEmbedExtensionOptions;
  const workspaces = useTaskStore((s) => s.workspaces);
  const allTasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.optimisticMoveTask);
  const createTask = useTaskStore((s) => s.optimisticCreateTask);
  const editable = editor.isEditable;

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);

  // Every List the viewer can see (the store only holds those), with where it lives, for the picker
  // and for finding this block's own List and its Space's statuses.
  const lists = useMemo(() => {
    const out: (Picked & { statuses: { name: string; color: string }[] })[] = [];
    const several = workspaces.length > 1;
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        if (space.archived) continue;
        for (const l of space.lists) {
          if (l.archived) continue;
          const folder = l.folderId ? space.folders.find((f) => f.id === l.folderId) : undefined;
          const path = [several ? ws.name : null, space.name, folder?.name].filter(Boolean).join(' / ');
          out.push({ id: l.id, name: l.name, spaceId: space.id, path, color: l.color ?? space.color, statuses: space.statuses });
        }
      }
    }
    return out;
  }, [workspaces]);

  const list = listId ? lists.find((l) => l.id === listId) : undefined;
  const tasks = useMemo(
    () =>
      listId
        ? allTasks
            .filter((t: Task) => t.listId === listId && !t.parentId && !t.archived)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : [],
    [allTasks, listId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? lists.filter((l) => `${l.path} ${l.name}`.toLowerCase().includes(q)) : lists;
  }, [lists, query]);

  const showPicker = editable && (!listId || picking);

  const submitDraft = () => {
    const title = draft?.trim();
    if (title && list) void createTask(title, list.id, list.spaceId);
    setDraft(title ? '' : null);
  };

  return (
    <NodeViewWrapper as="div" contentEditable={false} className="siqt-task-embed my-3 not-prose">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800/80">
          <ListChecks className="w-4 h-4 shrink-0" style={{ color: list?.color ?? undefined }} />
          <div className="min-w-0 flex-1 text-[12px] truncate">
            {list ? (
              <>
                <span className="text-neutral-500">{list.path} / </span>
                <span className="font-semibold text-app-strong">{list.name}</span>
                <span className="text-neutral-500 ml-1.5">{tasks.length}</span>
              </>
            ) : (
              <span className="text-neutral-400">{listId ? 'This List is not available' : 'Tasks from a List'}</span>
            )}
          </div>
          {editable && listId && (
            <button
              onClick={() => setPicking((v) => !v)}
              title="Show a different List"
              className="shrink-0 flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-800 cursor-pointer"
            >
              <Repeat className="w-3 h-3" /> Change
            </button>
          )}
        </div>

        {showPicker ? (
          <div className="p-2">
            <div className="flex items-center gap-2 px-2 h-9 rounded-lg bg-neutral-800/60 mb-1.5">
              <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered[0]) {
                    e.preventDefault();
                    updateAttributes({ listId: filtered[0].id });
                    setPicking(false);
                    setQuery('');
                  }
                  if (e.key === 'Escape') setPicking(false);
                }}
                placeholder="Choose a List…"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-[12px] text-neutral-500 px-2 py-2">No Lists match.</p>
              ) : (
                filtered.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      updateAttributes({ listId: l.id });
                      setPicking(false);
                      setQuery('');
                    }}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/70 cursor-pointer ${l.id === listId ? 'bg-neutral-800/50' : ''}`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color ?? '#64748b' }} />
                    <span className="text-[13px] text-neutral-200 truncate">{l.name}</span>
                    <span className="text-[11px] text-neutral-500 truncate ml-auto">{l.path}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : !list ? (
          <p className="px-3 py-3 text-[12px] text-neutral-500">
            {listId ? "It may have been deleted or archived, or you don't have access to it." : 'No List chosen yet.'}
          </p>
        ) : (
          <>
            <div
              className="hidden sm:grid gap-2 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-500"
              style={{ gridTemplateColumns: GRID }}
            >
              <span>Name</span>
              <span>Status</span>
              <span>Assignees</span>
              <span>Due</span>
            </div>
            {tasks.length === 0 && <p className="px-3 py-2 text-[12px] text-neutral-500">No tasks in this List yet.</p>}
            <div className="divide-y divide-neutral-800/50">
              {tasks.map((t) => {
                const status = list.statuses.find((s) => s.name === t.status);
                const color = status?.color ?? '#94A3B8';
                return (
                  <div key={t.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center px-3 py-1.5 hover:bg-neutral-800/30 transition sm:[grid-template-columns:var(--g)]" style={{ '--g': GRID } as React.CSSProperties}>
                    <button
                      onClick={() => options.onOpenTask?.(t.id)}
                      className="min-w-0 flex items-center gap-2 text-left cursor-pointer"
                    >
                      <span className="w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: color }} />
                      <span className="truncate text-[13px] text-neutral-200 hover:underline">{t.title || 'Untitled'}</span>
                    </button>
                    <div className="relative">
                      <button
                        disabled={!editable}
                        onClick={() => setStatusMenuFor((v) => (v === t.id ? null : t.id))}
                        className="max-w-full flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide cursor-pointer disabled:cursor-default"
                        style={{ backgroundColor: `${color}26`, color }}
                      >
                        <span className="truncate">{t.status}</span>
                        {editable && <ChevronDown className="w-3 h-3 shrink-0" />}
                      </button>
                      {statusMenuFor === t.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setStatusMenuFor(null)} />
                          <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1">
                            {list.statuses.map((s) => (
                              <button
                                key={s.name}
                                onClick={() => {
                                  moveTask(t.id, s.name);
                                  setStatusMenuFor(null);
                                }}
                                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-neutral-800 cursor-pointer ${
                                  s.name === t.status ? 'text-app-strong' : 'text-neutral-300'
                                }`}
                              >
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <span className="hidden sm:flex items-center -space-x-1.5">
                      {t.assignees.slice(0, 3).map((u) => (
                        <Avatar key={u.id} user={u} />
                      ))}
                      {t.assignees.length > 3 && <span className="text-[10px] text-neutral-500 pl-2.5">+{t.assignees.length - 3}</span>}
                    </span>
                    <span className="hidden sm:block text-[12px] text-neutral-400">{shortDate(t.dueDate)}</span>
                  </div>
                );
              })}
            </div>
            {editable &&
              (draft === null ? (
                <button
                  onClick={() => setDraft('')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-500 hover:text-blue-400 cursor-pointer transition border-t border-neutral-800/50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add task
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 border-t border-neutral-800/50">
                  <Plus className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitDraft();
                      }
                      if (e.key === 'Escape') setDraft(null);
                    }}
                    onBlur={() => !draft?.trim() && setDraft(null)}
                    placeholder="Task name — Enter to add"
                    className="flex-1 min-w-0 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none py-0.5"
                  />
                </div>
              ))}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
