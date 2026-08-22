'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import { getOrderedListIds } from '../../lib/folderTree';

type Props = {
  open: boolean;
  onClose: () => void;
  spaces: HierarchySpace[];
  activeSpaceId: string;
  activeListIds: Set<string>;
  onSelectList: (space: HierarchySpace, listId: string) => void;
};

// Mobile-only Spaces/Lists switcher — stands in for the desktop sidebar's always-visible
// FolderTree (components/FolderTree.tsx), which is hidden below md. Deliberately a flat list
// (space -> its lists, ordered via the same getOrderedListIds used for desktop shift-click range
// selection) rather than the full folder-nesting UI FolderTree renders — folder nesting isn't
// needed for "pick a list to view on my phone," and reusing FolderTree as-is here would drag in
// its drag-and-drop/context-menu/rename wiring, none of which apply to a tap-to-navigate sheet.
export default function MobileSpacesSheet({ open, onClose, spaces, activeSpaceId, activeListIds, onSelectList }: Props) {
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
              <span className="text-sm font-medium text-neutral-300">Spaces & Lists</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto pb-2">
              {spaces.map((space) => {
                const orderedListIds = getOrderedListIds(space).filter((id) => !space.lists.find((l) => l.id === id)?.archived);
                return (
                  <div key={space.id} className="mb-3">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-[13px] font-medium" style={{ color: space.textColor ?? undefined }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: space.color }} />
                      {space.name}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {orderedListIds.map((listId) => {
                        const list = space.lists.find((l) => l.id === listId);
                        if (!list) return null;
                        const active = activeSpaceId === space.id && activeListIds.has(list.id);
                        return (
                          <button
                            key={list.id}
                            onClick={() => {
                              onSelectList(space, list.id);
                              onClose();
                            }}
                            className={`text-left pl-6 pr-2 py-2 rounded text-[13px] transition cursor-pointer ${
                              active ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300 hover:bg-neutral-800/60'
                            }`}
                          >
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
