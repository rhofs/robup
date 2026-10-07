'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { HierarchySpace, HierarchyWorkspace } from '../../store/useTaskStore';
import { getOrderedListIds } from '../../lib/folderTree';

type Props = {
  open: boolean;
  onClose: () => void;
  spaces: HierarchySpace[];
  visibleListIds: Set<string>;
  onToggleList: (listId: string) => void;
  onToggleSpace: (space: HierarchySpace) => void;
  // Every workspace, since the Planner shows them all at once; `spaces` are the current one's.
  workspaces: HierarchyWorkspace[];
  currentWorkspaceId: string | null;
  isWorkspaceVisible: (ws: HierarchyWorkspace) => boolean;
  onToggleWorkspace: (ws: HierarchyWorkspace) => void;
};

// Mobile equivalent of the desktop sidebar's calendar-visibility checkboxes (FolderTree.tsx,
// toggleCalendarList/toggleCalendarSpace in app/page.tsx) — same flat, folder-nesting-skipped
// scope decision as MobileSpacesSheet.tsx, since this is a multi-select filter, not the full
// Space/Folder/List tree.
export default function MobileCalendarFilterSheet({
  open,
  onClose,
  spaces,
  visibleListIds,
  onToggleList,
  onToggleSpace,
  workspaces,
  currentWorkspaceId,
  isWorkspaceVisible,
  onToggleWorkspace,
}: Props) {
  const current = workspaces.find((w) => w.id === currentWorkspaceId);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="relative bg-neutral-900 border-t border-neutral-800/80 rounded-t-2xl px-4 pt-3 max-h-[75vh] flex flex-col"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-sm font-medium text-neutral-300">Filter Planner</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto pb-2">
              {workspaces.length > 1 && (
                <div className="mb-4 pb-3 border-b border-neutral-800/80">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Workspaces</p>
                  {workspaces.map((ws) => {
                    const on = isWorkspaceVisible(ws);
                    return (
                      <button
                        key={ws.id}
                        onClick={() => onToggleWorkspace(ws)}
                        className="w-full flex items-center gap-2 px-1 py-2 text-[13px] font-medium rounded hover:bg-neutral-800/40 cursor-pointer"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                            on ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                          }`}
                        >
                          {on && <Check className="w-3 h-3" />}
                        </span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ws.color || '#6b7280' }} />
                        <span className="truncate">{ws.isPersonal ? 'Personal' : ws.name}</span>
                        {ws.id === currentWorkspaceId && <span className="ml-auto text-[11px] font-normal text-neutral-500">current</span>}
                      </button>
                    );
                  })}
                  {current && (
                    <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Spaces in {current.isPersonal ? 'Personal' : current.name}
                    </p>
                  )}
                </div>
              )}
              {spaces.map((space) => {
                const orderedListIds = getOrderedListIds(space).filter((id) => !space.lists.find((l) => l.id === id)?.archived);
                const allChecked = orderedListIds.length > 0 && orderedListIds.every((id) => visibleListIds.has(id));
                return (
                  <div key={space.id} className="mb-3">
                    <button
                      onClick={() => onToggleSpace(space)}
                      className="w-full flex items-center gap-2 px-1 py-2 text-[13px] font-medium rounded hover:bg-neutral-800/40 cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                          allChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                        }`}
                      >
                        {allChecked && <Check className="w-3 h-3" />}
                      </span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: space.color }} />
                      <span>{space.name}</span>
                    </button>
                    <div className="flex flex-col gap-0.5">
                      {orderedListIds.map((listId) => {
                        const list = space.lists.find((l) => l.id === listId);
                        if (!list) return null;
                        const checked = visibleListIds.has(list.id);
                        return (
                          <button
                            key={list.id}
                            onClick={() => onToggleList(list.id)}
                            className="flex items-center gap-2 text-left pl-8 pr-2 py-2 rounded text-[13px] text-neutral-300 hover:bg-neutral-800/60 cursor-pointer"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                              }`}
                            >
                              {checked && <Check className="w-2.5 h-2.5" />}
                            </span>
                            {list.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
