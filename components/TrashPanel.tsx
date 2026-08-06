'use client';

import { useEffect, useState } from 'react';
import { X, Layers, Folder as FolderIcon, List as ListIcon, CheckSquare, FolderOpen, FileText, Undo2, Trash2 } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';
import ConfirmDialog from './ConfirmDialog';

type TrashItem = {
  type: 'space' | 'folder' | 'list' | 'task' | 'docFolder' | 'doc';
  id: string;
  name: string;
  deletedAt: string;
  context: string;
};

const TYPE_ICON: Record<TrashItem['type'], typeof Layers> = {
  space: Layers,
  folder: FolderIcon,
  list: ListIcon,
  task: CheckSquare,
  docFolder: FolderOpen,
  doc: FileText,
};

// Matches the API's route path segments, not the display type names above.
const TYPE_TO_KIND: Record<TrashItem['type'], 'spaces' | 'folders' | 'lists' | 'tasks' | 'doc-folders' | 'docs'> = {
  space: 'spaces',
  folder: 'folders',
  list: 'lists',
  task: 'tasks',
  docFolder: 'doc-folders',
  doc: 'docs',
};

const timeAgo = (dateStr: string) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDay = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export default function TrashPanel({ onClose }: { onClose: () => void }) {
  const { restoreFromTrash, permanentlyDeleteFromTrash } = useTaskStore();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch('/api/trash')
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    await restoreFromTrash(TYPE_TO_KIND[item.type], item.id);
    setBusyId(null);
    load();
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setBusyId(purgeTarget.id);
    await permanentlyDeleteFromTrash(TYPE_TO_KIND[purgeTarget.type], purgeTarget.id);
    setBusyId(null);
    setPurgeTarget(null);
    load();
  };

  // Grouped by day (newest day first) — items within each day are already sorted newest-first
  // by the API, so a stable groupby preserves that order inside each group too.
  const groups: { day: string; items: TrashItem[] }[] = [];
  for (const item of items ?? []) {
    const day = formatDay(item.deletedAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.day === day) lastGroup.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-h-[70vh] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Trash
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {items === null ? (
            <div className="text-xs text-neutral-500 text-center py-10">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 text-center py-10">Trash is empty.</div>
          ) : (
            groups.map((group) => (
              <div key={group.day} className="mb-3">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">{group.day}</div>
                {group.items.map((item) => {
                  const Icon = TYPE_ICON[item.type];
                  const isBusy = busyId === item.id;
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="group flex items-center gap-2.5 px-2.5 py-2 rounded hover:bg-neutral-800/40 transition"
                    >
                      <Icon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-neutral-200 truncate">{item.name}</div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          {item.context} · deleted {timeAgo(item.deletedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => handleRestore(item)}
                          disabled={isBusy}
                          title="Restore"
                          className="text-[11px] text-neutral-300 hover:text-blue-400 px-2 py-1 rounded hover:bg-neutral-800 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        >
                          <Undo2 className="w-3 h-3" /> Restore
                        </button>
                        <button
                          onClick={() => setPurgeTarget(item)}
                          disabled={isBusy}
                          title="Delete forever"
                          className="text-[11px] text-neutral-400 hover:text-red-400 px-2 py-1 rounded hover:bg-neutral-800 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!purgeTarget}
        title="Delete forever?"
        message={purgeTarget ? `"${purgeTarget.name}" and everything nested inside it will be permanently deleted. This can't be undone.` : ''}
        confirmLabel="Delete forever"
        onConfirm={handlePurge}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}
