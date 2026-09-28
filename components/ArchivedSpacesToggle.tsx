'use client';

import { Archive } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';

// "Archived spaces (N)" at the foot of a Space list — brings archived Spaces back, at the bottom and
// dimmed, with everything in them browsable again (Everything, the Planner, search). Per device.
// Only there once the active workspace has something archived, or while they are being shown.
//
// One component for the desktop sidebar, the mobile Spaces sheet and Office's Spaces list, so the
// three cannot come to disagree about when it appears or what it says.
export default function ArchivedSpacesToggle({ className = '' }: { className?: string }) {
  const show = useTaskStore((s) => s.showArchivedSpaces);
  const setShow = useTaskStore((s) => s.setShowArchivedSpaces);
  const count = useTaskStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.archivedSpaceCount ?? 0);
  if (count === 0 && !show) return null;
  return (
    <button
      onClick={() => void setShow(!show)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] md:text-[11px] text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40 cursor-pointer ${className}`}
    >
      <Archive className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left">{show ? 'Hide archived spaces' : `Archived spaces (${count})`}</span>
    </button>
  );
}

// Live Spaces first, then archived ones (present only while shown) — the order every Space list uses.
export const archivedLast = <T extends { archived?: boolean; order: number }>(a: T, b: T) =>
  Number(!!a.archived) - Number(!!b.archived) || a.order - b.order;
