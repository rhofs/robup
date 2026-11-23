'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';

// Settings → Workspace → Agent activity: what members' AI agents have done in this workspace, one
// row per action (one thing an agent was asked to do, however many tasks it touched), with Undo.
// The server decides what each viewer may read and undo (app/api/workspaces/[id]/agent-actions).
type ActionRow = {
  id: string;
  summary: string;
  tokenName: string;
  user: { id: string; name: string };
  createdAt: string;
  status: 'done' | 'partial' | 'undone';
  undoneAt: string | null;
  undoneBy: string | null;
  changeCount: number;
  hiddenCount: number;
  changes: { label: string; outcome: string | null }[];
  canUndo: boolean;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AgentActivityLog({ workspaceId }: { workspaceId: string }) {
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workspaces/${workspaceId}/agent-actions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]));
  }, [workspaceId]);
  useEffect(load, [load]);

  const undo = async (row: ActionRow) => {
    const n = row.changeCount;
    if (!window.confirm(`Undo “${row.summary}”?\n\n${n} change${n === 1 ? '' : 's'} will be put back. Anything someone has changed since is left as it is.`)) return;
    setBusyId(row.id);
    setError(null);
    const res = await fetch(`/api/agent-actions/${row.id}/undo`, { method: 'POST' }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => null) : null;
      setError(data?.error ?? 'Could not undo — try again.');
      return;
    }
    setOpenId(row.id);
    load();
    // The board behind this panel is showing what was just put back.
    const store = useTaskStore.getState();
    void store.refetchTasks();
    void store.refetchEvents();
  };

  if (rows === null) return <p className="text-xs text-neutral-500 px-1 py-2">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-xs text-neutral-500 px-1 py-2 leading-relaxed">
        Nothing yet. When someone’s AI agent creates or changes something in this workspace, it is listed here — and
        can be undone from here.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <div key={row.id} className="rounded-xl border border-neutral-800">
            <div className="flex items-start gap-2 px-3 py-2.5">
              <button
                onClick={() => setOpenId(open ? null : row.id)}
                className="flex-1 min-w-0 flex items-start gap-2 text-left cursor-pointer"
              >
                {open ? (
                  <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-neutral-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-neutral-500 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className={`block text-xs ${row.status === 'undone' ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
                    {row.summary}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-neutral-500 mt-0.5">
                    <Bot className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {row.user.name} · {row.tokenName} · {when(row.createdAt)} · {row.changeCount} change
                      {row.changeCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  {row.status === 'partial' && (
                    <span className="block text-[11px] text-amber-400 mt-0.5">Stopped part-way — only these changes were made</span>
                  )}
                  {row.status === 'undone' && (
                    <span className="block text-[11px] text-neutral-500 mt-0.5">
                      Undone{row.undoneBy ? ` by ${row.undoneBy}` : ''}
                      {row.undoneAt ? ` · ${when(row.undoneAt)}` : ''}
                    </span>
                  )}
                </span>
              </button>
              {row.canUndo && (
                <button
                  onClick={() => undo(row)}
                  disabled={busyId === row.id}
                  className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-neutral-600 disabled:opacity-40 cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" /> {busyId === row.id ? 'Undoing…' : 'Undo'}
                </button>
              )}
            </div>
            {open && (
              <ul className="px-3 pb-2.5 pl-8 space-y-1">
                {row.changes.map((c, i) => (
                  <li key={i} className="text-[11px] text-neutral-400">
                    {c.label}
                    {c.outcome && <span className="block text-neutral-500">→ {c.outcome}</span>}
                  </li>
                ))}
                {row.hiddenCount > 0 && (
                  <li className="text-[11px] text-neutral-600">
                    {row.hiddenCount} change{row.hiddenCount === 1 ? '' : 's'} to things you do not have access to
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
