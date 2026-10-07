'use client';

import { useState } from 'react';
import { Check, ChevronDown, Lock } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import type { HierarchyWorkspace } from '../store/useTaskStore';
import { homeLabel, workspaceColor } from '../lib/whereIs';

// "Belongs to" for an event: one choice that says both which workspace it is in — who can see it, who
// can be on it — and, optionally, which Space (its colour). It replaces a Space picker that offered
// every workspace's Spaces while the workspace itself was silently whichever one was active, which is
// how a Bleep Show event ended up under CRRM Media, and a team evening ended up private.
//
// Picking a Space picks its workspace; the server holds to the same rule (app/api/events).

export type BelongsTo = { workspaceId: string; spaceId: string | null };

export default function BelongsToPicker({
  workspaces,
  value,
  onChange,
  full = false,
}: {
  workspaces: HierarchyWorkspace[];
  value: BelongsTo;
  onChange: (next: BelongsTo) => void;
  // Stretch to the container's width (forms), rather than sit as a chip.
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ws = workspaces.find((w) => w.id === value.workspaceId);
  const space = value.spaceId ? ws?.spaces.find((s) => s.id === value.spaceId) : undefined;
  const ordered = [...workspaces].sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));

  const pick = (next: BelongsTo) => {
    setOpen(false);
    if (next.workspaceId !== value.workspaceId || next.spaceId !== value.spaceId) onChange(next);
  };

  const row = (label: string, selected: boolean, onClick: () => void, lead: React.ReactNode, indent = false, hint?: string) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-left hover:bg-neutral-800 cursor-pointer ${indent ? 'pl-7' : 'pl-2'}`}
    >
      <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">{lead}</span>
      <span className={`flex-1 min-w-0 truncate text-[12.5px] ${indent ? 'text-neutral-300' : 'text-neutral-100 font-medium'}`}>{label}</span>
      {hint && <span className="shrink-0 text-[10.5px] text-neutral-500">{hint}</span>}
      {selected && <Check className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
    </button>
  );

  return (
    <FloatingPopover
      open={open}
      onClose={() => setOpen(false)}
      panelClassName="w-72 max-h-[60vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-1.5"
      anchor={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${full ? 'w-full' : 'max-w-full'} h-9 px-2.5 rounded-lg border border-neutral-700 hover:border-neutral-600 bg-neutral-950 flex items-center gap-2 text-left cursor-pointer`}
        >
          {ws?.isPersonal ? (
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: workspaceColor(ws) }} />
          )}
          <span className="flex-1 min-w-0 truncate text-[12.5px] text-app-strong">
            {homeLabel({ workspace: ws, space, personal: !!ws?.isPersonal })}
            {ws?.isPersonal && <span className="text-neutral-500"> — only you</span>}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        </button>
      }
    >
      {ordered.map((w, i) => {
        const spaces = w.spaces.filter((s) => !s.archived || s.id === value.spaceId);
        return (
          <div key={w.id} className={i > 0 ? 'mt-1 pt-1 border-t border-neutral-800' : ''}>
            {row(
              w.isPersonal ? 'Private' : w.name,
              value.workspaceId === w.id && !value.spaceId,
              () => pick({ workspaceId: w.id, spaceId: null }),
              w.isPersonal ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: workspaceColor(w) }} />
              ),
              false,
              w.isPersonal ? 'only you' : spaces.length ? 'no Space' : undefined
            )}
            {spaces.map((s) =>
              row(s.name, value.spaceId === s.id, () => pick({ workspaceId: w.id, spaceId: s.id }), (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color || '#6b7280' }} />
              ), true)
            )}
          </div>
        );
      })}
    </FloatingPopover>
  );
}
