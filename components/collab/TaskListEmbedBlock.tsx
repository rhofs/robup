'use client';

import { useMemo, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  ListChecks,
  Plus,
  PlusCircle,
  Search,
  ChevronDown,
  Repeat,
  X,
  Minimize2,
  Maximize2,
  CircleCheck,
  Trash2,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
import { useTaskStore, type Task, type StatusDef, type CustomFieldDef, type HierarchySpace } from '../../store/useTaskStore';
import TaskRow, { type ColumnDef } from '../TaskRow';
import FloatingPopover from '../FloatingPopover';
import Caret from '../Caret';
import type { TaskListEmbedExtensionOptions } from './taskListEmbedView';

// Node view for `taskListEmbed` (lib/collab/taskListEmbedNode.ts): tasks, live, inside a Doc.
//
// Rebuilt on 2026-10-02 to be "så likt som mulig" ClickUp's List-in-a-Doc (the user's four
// screenshots): a breadcrumb header with change / collapse / remove, a toolbar, tasks grouped by
// status under collapsible status pills, the List's own columns — custom fields included, editable in
// place — rows that select into a bulk bar, a ⊕ that shows, hides and creates fields, an "Add Task"
// per group, and subtasks folding out under their task. The rows ARE the app's TaskRow, the same
// component the List view uses, so every cell behaves exactly as it does there and nothing is
// maintained twice.
//
// Two ways to fill it, chosen on first insert (and again with "Change"):
//   - a List — a new one, owned by this Doc (List.docId, hidden from the sidebar), or an existing one;
//   - hand-picked tasks from anywhere (`taskIds`), shown flat with the common columns.
// "jeg vil gjerne at du også skal kunne velge andre tasker, eller lister".
//
// Column choice writes the List's own visibleColumnsJson — the same setting the List view reads, as in
// ClickUp, where a List's fields are the List's, wherever it is shown.

const FALLBACK_STATUSES: StatusDef[] = [
  { id: 'default-todo', name: 'To Do', color: '#8d97a5', order: 0 },
  { id: 'default-progress', name: 'In Progress', color: '#618cd1', order: 1 },
  { id: 'default-review', name: 'Review', color: '#9a61d1', order: 2 },
  { id: 'default-done', name: 'Done', color: '#349f7c', order: 3 },
];
const DEFAULT_COLUMNS = ['status', 'assignee', 'startDate', 'dueDate'];
const NAME_WIDTH = 260;
const COL_WIDTH = 130;

function parseColumns(json: string | null | undefined): string[] {
  if (!json) return DEFAULT_COLUMNS;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.every((k) => typeof k === 'string') ? v : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}
function parseWidths(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function parseIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type ListEntry = {
  id: string;
  name: string;
  path: string;
  color: string | null;
  docId: string | null;
  space: HierarchySpace;
  visibleColumnsJson: string | null;
  columnWidthsJson: string | null;
};

export default function TaskListEmbedBlock({ node, updateAttributes, deleteNode, editor, extension }: ReactNodeViewProps) {
  const { listId, taskIds: taskIdsJson } = node.attrs as { listId: string | null; taskIds: string | null };
  const pickedIds = useMemo(() => parseIds(taskIdsJson), [taskIdsJson]);
  const options = extension.options as TaskListEmbedExtensionOptions;
  const editable = editor.isEditable;

  const workspaces = useTaskStore((s) => s.workspaces);
  const allTasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.optimisticMoveTask);
  const archiveTask = useTaskStore((s) => s.optimisticArchiveTask);
  const deleteTask = useTaskStore((s) => s.optimisticDeleteTask);
  const createTask = useTaskStore((s) => s.optimisticCreateTask);
  const createList = useTaskStore((s) => s.createList);
  const setListVisibleColumns = useTaskStore((s) => s.setListVisibleColumns);
  const createCustomField = useTaskStore((s) => s.createCustomField);

  // ---- where everything lives ----
  const lists = useMemo(() => {
    const out: ListEntry[] = [];
    const several = workspaces.length > 1;
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        if (space.archived) continue;
        for (const l of space.lists) {
          // Another Doc's own List is not offered; this block's own one still resolves.
          if (l.archived || (l.docId && l.id !== listId)) continue;
          const folder = l.folderId ? space.folders.find((f) => f.id === l.folderId) : undefined;
          out.push({
            id: l.id,
            name: l.name,
            path: [several ? ws.name : null, space.name, folder?.name].filter(Boolean).join(' / '),
            color: l.color ?? space.color,
            docId: l.docId ?? null,
            space,
            visibleColumnsJson: l.visibleColumnsJson,
            columnWidthsJson: l.columnWidthsJson ?? null,
          });
        }
      }
    }
    return out;
  }, [workspaces, listId]);
  const spaceOfList = useMemo(() => {
    const m = new Map<string, HierarchySpace>();
    for (const ws of workspaces) for (const sp of ws.spaces) for (const l of sp.lists) m.set(l.id, sp);
    return m;
  }, [workspaces]);
  const list = listId ? lists.find((l) => l.id === listId) : undefined;
  const mode: 'list' | 'tasks' | 'setup' = listId ? 'list' : pickedIds.length ? 'tasks' : 'setup';

  // ---- view state ----
  const [setupOpen, setSetupOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState('');
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  // ---- columns ----
  const listSpace = list?.space;
  // Plain derivations, not memos: a handful of entries, and the compiler memoises the component.
  const listCustomFields: CustomFieldDef[] = (listSpace?.customFields ?? []).filter((f) => f.listId === null || f.listId === listId);
  const availableColumns: ColumnDef[] = [
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'assignee', label: 'Assignee', kind: 'assignee' },
    { key: 'startDate', label: 'Start date', kind: 'startDate' },
    { key: 'dueDate', label: 'Due date', kind: 'dueDate' },
    ...(mode === 'list' ? listCustomFields.map((f) => ({ key: f.id, label: f.name, kind: 'custom' as const, field: f })) : []),
  ];
  const visibleKeys = mode === 'list' ? parseColumns(list?.visibleColumnsJson) : ['status', 'assignee', 'dueDate'];
  const columns = visibleKeys.map((k) => availableColumns.find((c) => c.key === k)).filter((c): c is ColumnDef => !!c);
  const widths = parseWidths(list?.columnWidthsJson);
  const nameWidth = widths.name ?? NAME_WIDTH;
  const gridTemplate = `20px 28px ${nameWidth}px ${columns.map((c) => `${widths[c.key] ?? COL_WIDTH}px`).join(' ')} 32px`;
  const minWidth = 20 + 28 + nameWidth + columns.reduce((n, c) => n + (widths[c.key] ?? COL_WIDTH), 0) + 32;

  // ---- rows ----
  const visibleTask = (t: Task) => showDone || !t.archived;
  const matches = (t: Task) => !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase());
  const subtasksByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.parentId || !(showDone || !t.archived)) continue;
      const arr = m.get(t.parentId);
      if (arr) arr.push(t);
      else m.set(t.parentId, [t]);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return m;
  }, [allTasks, showDone]);
  const topTasks = useMemo(() => {
    if (mode === 'list') {
      return allTasks.filter((t) => t.listId === listId && !t.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    if (mode === 'tasks') {
      const byId = new Map(allTasks.map((t) => [t.id, t]));
      return pickedIds.map((id) => byId.get(id)).filter((t): t is Task => !!t);
    }
    return [];
  }, [allTasks, listId, mode, pickedIds]);
  const shownTop = topTasks.filter((t) => visibleTask(t) && matches(t));

  const flatten = (tops: Task[]) => {
    const rows: { task: Task; depth: number; subtaskCount: number }[] = [];
    const add = (task: Task, depth: number) => {
      const children = subtasksByParent.get(task.id) ?? [];
      rows.push({ task, depth, subtaskCount: children.length });
      if (depth < 12 && expanded.has(task.id)) for (const c of children) add(c, depth + 1);
    };
    for (const t of tops) add(t, 0);
    return rows;
  };

  const statuses: StatusDef[] = listSpace?.statuses?.length ? listSpace.statuses : FALLBACK_STATUSES;
  // Status groups, in the Space's own order; a status no longer defined still gets a group, after.
  const groups = (() => {
    if (mode !== 'list') return [];
    const out: { name: string; color: string; tasks: Task[] }[] = statuses.map((s) => ({ name: s.name, color: s.color, tasks: [] }));
    for (const t of shownTop) {
      let g = out.find((x) => x.name === t.status);
      if (!g) {
        g = { name: t.status, color: '#94A3B8', tasks: [] };
        out.push(g);
      }
      g.tasks.push(t);
    }
    // Empty groups beyond the first are left out, as ClickUp does; the first always shows so there is
    // somewhere to add the first task.
    return out.filter((g, i) => g.tasks.length > 0 || i === 0);
  })();

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const selectedIds = [...selected].filter((id) => allTasks.some((t) => t.id === id));
  const allShownSelected = shownTop.length > 0 && shownTop.every((t) => selected.has(t.id));

  const renderRow = ({ task, depth, subtaskCount }: { task: Task; depth: number; subtaskCount: number }) => {
    const sp = spaceOfList.get(task.listId);
    const rowStatuses = mode === 'list' ? statuses : sp?.statuses?.length ? sp.statuses : FALLBACK_STATUSES;
    return (
      <TaskRow
        key={task._localId || task.id}
        task={task}
        navScope={`doc-${node.attrs.listId ?? 'tasks'}`}
        onOpen={() => options.onOpenTask?.(task.id)}
        columns={columns}
        gridTemplate={gridTemplate}
        statuses={rowStatuses}
        selectable
        isSelected={selected.has(task.id)}
        onToggleSelect={() => setSelected((s) => toggle(s, task.id))}
        animateEntrance={false}
        depth={depth}
        subtaskCount={subtaskCount}
        expanded={expanded.has(task.id)}
        onToggleExpand={() => setExpanded((s) => toggle(s, task.id))}
      />
    );
  };

  const submitAdd = (status: string) => {
    const title = addDraft.trim();
    if (title && list) void createTask(title, list.id, list.space.id, null, null, null, undefined, status);
    setAddDraft('');
    if (!title) setAddingIn(null);
  };

  const header = (
    <div className="flex items-center gap-1.5 px-3 h-10 border-b border-neutral-800/80">
      <ListChecks className="w-4 h-4 shrink-0" style={{ color: list?.color ?? undefined }} />
      <div className="min-w-0 flex-1 text-[12.5px] truncate">
        {mode === 'list' && list ? (
          <>
            {!list.docId && <span className="text-neutral-500">{list.path} / </span>}
            <span className="font-semibold text-app-strong">{list.name}</span>
          </>
        ) : mode === 'tasks' ? (
          <span className="font-semibold text-app-strong">Selected tasks</span>
        ) : (
          <span className="text-neutral-400">{listId ? 'This List is not available' : 'Task list'}</span>
        )}
      </div>
      {editable && mode !== 'setup' && (
        <HeaderButton title="Change what this shows" onClick={() => setSetupOpen((v) => !v)}>
          <Repeat className="w-3.5 h-3.5" />
        </HeaderButton>
      )}
      {mode !== 'setup' && (
        <HeaderButton title={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
        </HeaderButton>
      )}
      {editable && (
        <HeaderButton title="Remove from doc" onClick={() => deleteNode()}>
          <X className="w-3.5 h-3.5" />
        </HeaderButton>
      )}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-1 px-3 h-10 border-b border-neutral-800/60">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-app-strong border-b-2 border-app-strong h-full px-1">
        <ListChecks className="w-3.5 h-3.5" /> List
      </span>
      <div className="flex-1" />
      {searchOpen ? (
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-lg bg-neutral-800/70">
          <Search className="w-3.5 h-3.5 text-neutral-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setSearchOpen(false))}
            onBlur={() => !query && setSearchOpen(false)}
            placeholder="Search tasks"
            className="w-36 bg-transparent text-[12px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
          />
        </div>
      ) : (
        <HeaderButton title="Search" onClick={() => setSearchOpen(true)}>
          <Search className="w-3.5 h-3.5" />
        </HeaderButton>
      )}
      <HeaderButton title={showDone ? 'Hide done tasks' : 'Show done tasks'} active={showDone} onClick={() => setShowDone((v) => !v)}>
        {showDone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </HeaderButton>
    </div>
  );

  const columnHeader = (
    <div
      className="grid items-center px-4 h-8 text-[11px] text-neutral-500 border-b border-neutral-800/60"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={allShownSelected}
          onChange={() => setSelected(allShownSelected ? new Set() : new Set(shownTop.map((t) => t.id)))}
          className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
          aria-label="Select all"
        />
      </div>
      <div />
      <div className="pl-1">Name</div>
      {columns.map((c) => (
        <div key={c.key} className="truncate pr-2">
          {c.label}
        </div>
      ))}
      <div className="flex justify-end">
        {mode === 'list' && editable && list && (
          <FloatingPopover
            open={fieldsOpen}
            onClose={() => setFieldsOpen(false)}
            panelClassName="w-72 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2"
            anchor={
              <button
                onClick={() => setFieldsOpen((v) => !v)}
                title="Fields & columns"
                className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            }
          >
            <FieldsPanel
              available={availableColumns}
              visible={visibleKeys}
              onToggle={(key) => {
                const next = visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key];
                void setListVisibleColumns(list.space.id, list.id, next);
              }}
              onCreate={async (name, type) => {
                const id = crypto.randomUUID();
                await createCustomField(list.space.id, name, type, [], id, list.id);
                void setListVisibleColumns(list.space.id, list.id, [...visibleKeys, id]);
              }}
            />
          </FloatingPopover>
        )}
      </div>
    </div>
  );

  const addRow = (status: string) =>
    !editable || !list ? null : addingIn === status ? (
      <div className="flex items-center gap-2 h-9 pl-[76px] pr-3 border-b border-neutral-800/40">
        <input
          autoFocus
          value={addDraft}
          onChange={(e) => setAddDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitAdd(status);
            }
            if (e.key === 'Escape') setAddingIn(null);
          }}
          onBlur={() => !addDraft.trim() && setAddingIn(null)}
          placeholder="Task name — Enter to add"
          className="flex-1 min-w-0 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
        />
      </div>
    ) : (
      <button
        onClick={() => {
          setAddDraft('');
          setAddingIn(status);
        }}
        className="w-full flex items-center gap-2 h-9 pl-[52px] text-[12.5px] text-neutral-500 hover:text-neutral-200 cursor-pointer transition"
      >
        <Plus className="w-3.5 h-3.5" /> Add Task
      </button>
    );

  const body =
    mode === 'list' && list ? (
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {columnHeader}
          {groups.map((g) => {
            const closed = closedGroups.has(g.name);
            return (
              <div key={g.name}>
                <div className="flex items-center gap-2 px-2 h-10">
                  <button
                    onClick={() => setClosedGroups((s) => toggle(s, g.name))}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800 cursor-pointer"
                  >
                    <Caret open={!closed} />
                  </button>
                  <span
                    className="flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${g.color}26`, color: g.color }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.name}
                  </span>
                  <span className="text-[11px] text-neutral-500">{g.tasks.length}</span>
                  {editable && (
                    <button
                      onClick={() => {
                        setClosedGroups((s) => {
                          const n = new Set(s);
                          n.delete(g.name);
                          return n;
                        });
                        setAddDraft('');
                        setAddingIn(g.name);
                      }}
                      title={`Add a task to ${g.name}`}
                      className="w-5 h-5 rounded flex items-center justify-center text-neutral-600 hover:text-neutral-200 hover:bg-neutral-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {!closed && (
                  <>
                    <div className="divide-y divide-neutral-800/50">{flatten(g.tasks).map(renderRow)}</div>
                    {addRow(g.name)}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ) : mode === 'tasks' ? (
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {columnHeader}
          <div className="divide-y divide-neutral-800/50">{flatten(shownTop).map(renderRow)}</div>
          {shownTop.length === 0 && <p className="px-4 py-3 text-[12px] text-neutral-500">None of the picked tasks are showing.</p>}
        </div>
      </div>
    ) : (
      <p className="px-4 py-3 text-[12px] text-neutral-500">
        {listId ? "It may have been deleted or archived, or you don't have access to it." : 'Nothing chosen yet.'}
      </p>
    );

  const bulkBar = selectedIds.length > 0 && (
    <div className="flex items-center gap-1 m-2 px-2 h-11 rounded-xl bg-neutral-800/90 border border-neutral-700/60 shadow-lg">
      <span className="flex items-center gap-2 h-8 pl-3 pr-2 rounded-lg border border-neutral-600/60 text-[12.5px] text-app-strong">
        {selectedIds.length} task{selectedIds.length === 1 ? '' : 's'} selected
        <button onClick={() => setSelected(new Set())} className="text-neutral-400 hover:text-app-strong cursor-pointer" aria-label="Clear selection">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
      <div className="flex-1" />
      {mode === 'list' && (
        <FloatingPopover
          open={bulkStatusOpen}
          onClose={() => setBulkStatusOpen(false)}
          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
          anchor={
            <BulkButton onClick={() => setBulkStatusOpen((v) => !v)}>
              <ChevronDown className="w-3.5 h-3.5" /> Status
            </BulkButton>
          }
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                selectedIds.forEach((id) => moveTask(id, s.name));
                setBulkStatusOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-neutral-300 hover:bg-neutral-800 cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </FloatingPopover>
      )}
      <BulkButton
        onClick={() => {
          selectedIds.forEach((id) => archiveTask(id, true));
          setSelected(new Set());
        }}
      >
        <CircleCheck className="w-3.5 h-3.5" /> Done
      </BulkButton>
      <BulkButton
        danger
        onClick={() => {
          if (!window.confirm(`Delete ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}?`)) return;
          selectedIds.forEach((id) => void deleteTask(id));
          setSelected(new Set());
        }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </BulkButton>
    </div>
  );

  return (
    <NodeViewWrapper as="div" contentEditable={false} className="siqt-task-embed my-3 not-prose">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        {header}
        {editable && (mode === 'setup' || setupOpen) ? (
          <Setup
            lists={lists}
            currentListId={listId}
            pickedIds={pickedIds}
            docSpaceId={options.spaceId}
            onUseList={(id) => {
              updateAttributes({ listId: id, taskIds: null });
              setSetupOpen(false);
            }}
            onUseTasks={(ids) => {
              updateAttributes({ listId: null, taskIds: JSON.stringify(ids) });
              setSetupOpen(false);
            }}
            onCreateList={async (spaceId, name) => {
              const id = crypto.randomUUID();
              // Owned by this Doc: it lives only here, not in the sidebar or the Space (List.docId).
              await createList(spaceId, name, null, id, options.docId ?? null);
              updateAttributes({ listId: id, taskIds: null });
              setSetupOpen(false);
              setAddDraft('');
              setAddingIn(FALLBACK_STATUSES[0].name);
            }}
            onCancel={mode === 'setup' ? undefined : () => setSetupOpen(false)}
          />
        ) : collapsed ? null : (
          <>
            {mode !== 'setup' && toolbar}
            {body}
            {bulkBar}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function HeaderButton({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
        active ? 'bg-blue-500/15 text-blue-400' : 'text-neutral-500 hover:text-app-strong hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

function BulkButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] cursor-pointer transition-colors ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-neutral-200 hover:bg-neutral-700/70'
      }`}
    >
      {children}
    </button>
  );
}

// The ⊕ panel: which columns this List shows (its own setting, shared with the List view), and a quick
// way to make a new custom field on it — ClickUp's "Fields" panel, trimmed to what this app has.
function FieldsPanel({
  available,
  visible,
  onToggle,
  onCreate,
}: {
  available: ColumnDef[];
  visible: string[];
  onToggle: (key: string) => void;
  onCreate: (name: string, type: CustomFieldDef['type']) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldDef['type']>('dropdown');
  const [busy, setBusy] = useState(false);
  const shown = available.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search fields"
        className="w-full h-8 px-2.5 mb-1.5 rounded-lg bg-neutral-800/70 text-[12px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
      />
      <div className="max-h-60 overflow-y-auto">
        {shown.map((c) => {
          const on = visible.includes(c.key);
          return (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12.5px] text-neutral-200 hover:bg-neutral-800 cursor-pointer"
            >
              <span className="flex-1 text-left truncate">{c.label}</span>
              <span className={`w-7 h-4 rounded-full p-0.5 transition-colors ${on ? 'bg-blue-500' : 'bg-neutral-700'}`}>
                <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-neutral-800 mt-1.5 pt-2 space-y-1.5">
        <p className="px-1 text-[10px] uppercase tracking-wider text-neutral-500">New field</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Field name"
          className="w-full h-8 px-2.5 rounded-lg bg-neutral-800/70 text-[12px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
        />
        <div className="flex gap-1.5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
            className="flex-1 h-8 px-2 rounded-lg bg-neutral-800/70 text-[12px] text-neutral-200 focus:outline-none cursor-pointer"
          >
            <option value="dropdown">Dropdown</option>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
          <button
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCreate(name.trim(), type);
                setName('');
              } finally {
                setBusy(false);
              }
            }}
            className="h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] font-semibold text-white cursor-pointer"
          >
            Create
          </button>
        </div>
        <p className="px-1 text-[10.5px] text-neutral-500">Dropdown options are added from the column, as in the List view.</p>
      </div>
    </div>
  );
}

// What the block shows: a new List (owned by this Doc), an existing List, or hand-picked tasks.
function Setup({
  lists,
  currentListId,
  pickedIds,
  docSpaceId,
  onUseList,
  onUseTasks,
  onCreateList,
  onCancel,
}: {
  lists: ListEntry[];
  currentListId: string | null;
  pickedIds: string[];
  docSpaceId?: string;
  onUseList: (id: string) => void;
  onUseTasks: (ids: string[]) => void;
  onCreateList: (spaceId: string, name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const allTasks = useTaskStore((s) => s.tasks);
  const [tab, setTab] = useState<'new' | 'existing' | 'tasks'>(currentListId ? 'existing' : pickedIds.length ? 'tasks' : 'new');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const spaces = useMemo(() => {
    const several = workspaces.length > 1;
    return workspaces.flatMap((ws) => ws.spaces.filter((sp) => !sp.archived).map((sp) => ({ id: sp.id, label: several ? `${ws.name} / ${sp.name}` : sp.name })));
  }, [workspaces]);
  const [spaceId, setSpaceId] = useState<string | null>(docSpaceId ?? null);
  const targetSpace = spaceId && spaces.some((s) => s.id === spaceId) ? spaceId : spaces[0]?.id ?? null;
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>(pickedIds);

  const query = q.trim().toLowerCase();
  const filteredLists = query ? lists.filter((l) => `${l.path} ${l.name}`.toLowerCase().includes(query)) : lists;
  const taskMatches = useMemo(() => {
    const open = allTasks.filter((t) => !t.archived);
    return (query ? open.filter((t) => t.title.toLowerCase().includes(query)) : open).slice(0, 60);
  }, [allTasks, query]);

  const create = async () => {
    if (!name.trim() || !targetSpace || busy) return;
    setBusy(true);
    try {
      await onCreateList(targetSpace, name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-2.5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex rounded-full bg-neutral-800/60 p-0.5">
          {(
            [
              ['new', 'New List'],
              ['existing', 'Existing List'],
              ['tasks', 'Pick tasks'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setTab(m);
                setQ('');
              }}
              className={`px-3 h-7 rounded-full text-[12px] font-semibold cursor-pointer transition-colors ${
                tab === m ? 'bg-blue-500/15 text-blue-400 shadow-[0_0_10px_0_rgb(59_130_246/0.25)]' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {onCancel && (
          <button onClick={onCancel} className="text-[12px] text-neutral-500 hover:text-neutral-200 cursor-pointer px-1.5">
            Cancel
          </button>
        )}
      </div>

      {tab === 'new' ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="Name the new List"
            className="w-full h-9 px-3 rounded-lg bg-neutral-800/60 text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-neutral-500 shrink-0">In</label>
            <select
              value={targetSpace ?? ''}
              onChange={(e) => setSpaceId(e.target.value)}
              className="min-w-0 flex-1 h-8 px-2 rounded-lg bg-neutral-800/60 text-[12px] text-neutral-200 focus:outline-none cursor-pointer"
            >
              {spaces.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void create()}
              disabled={!name.trim() || !targetSpace || busy}
              className="shrink-0 h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] font-semibold text-white cursor-pointer"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">The List lives only in this doc — it won&apos;t appear in the sidebar.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-2 h-9 rounded-lg bg-neutral-800/60 mb-1.5">
            <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tab === 'existing' && filteredLists[0]) {
                  e.preventDefault();
                  onUseList(filteredLists[0].id);
                }
              }}
              placeholder={tab === 'existing' ? 'Choose a List…' : 'Find tasks…'}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {tab === 'existing' ? (
              filteredLists.length === 0 ? (
                <p className="text-[12px] text-neutral-500 px-2 py-2">No Lists match.</p>
              ) : (
                filteredLists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onUseList(l.id)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/70 cursor-pointer ${
                      l.id === currentListId ? 'bg-neutral-800/50' : ''
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color ?? '#64748b' }} />
                    <span className="text-[13px] text-neutral-200 truncate">{l.name}</span>
                    <span className="text-[11px] text-neutral-500 truncate ml-auto">{l.docId ? 'This doc' : l.path}</span>
                  </button>
                ))
              )
            ) : taskMatches.length === 0 ? (
              <p className="text-[12px] text-neutral-500 px-2 py-2">No tasks match.</p>
            ) : (
              taskMatches.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/70 cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        on ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                      }`}
                    >
                      {on && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <span className="text-[13px] text-neutral-200 truncate">{t.title || 'Untitled'}</span>
                  </button>
                );
              })
            )}
          </div>
          {tab === 'tasks' && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <span className="text-[11px] text-neutral-500">{picked.length} picked</span>
              <button
                disabled={picked.length === 0}
                onClick={() => onUseTasks(picked)}
                className="h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-[12px] font-semibold text-white cursor-pointer"
              >
                Show these tasks
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
