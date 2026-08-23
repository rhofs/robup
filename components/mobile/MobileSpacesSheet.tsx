'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Globe, X } from 'lucide-react';
import type { HierarchySpace } from '../../store/useTaskStore';
import { FOLDER_ICON_MAP } from '../FolderTree';

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  spaces: HierarchySpace[];
  activeSpaceId: string;
  onSelectSpace: (spaceId: string) => void;
};

// Mobile Spaces landing — reachable from the bottom nav's "Spaces" tab (see MobileBottomNav.tsx)
// and the board view's own header button. Deliberately a flat list of Spaces only (no inline
// Folder/List drill-down like the old version of this sheet had) — tapping a Space lands on its
// own Space Home (SpaceHome.tsx, already an existing desktop feature: a browsable page of that
// Space's Lists), which already covers "now show me this Space's Lists" without this sheet also
// needing to duplicate that UI. Matches the reference (ClickUp's own mobile Spaces list, complete
// with colored icon badges) the user pointed at more directly than the previous combined version.
export default function MobileSpacesSheet({ open, onClose, workspaceName, spaces, activeSpaceId, onSelectSpace }: Props) {
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
            className="relative bg-neutral-900 border-t border-neutral-800/80 rounded-t-2xl px-3 pt-3 max-h-[75vh] flex flex-col"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="flex items-center justify-between mb-2 px-1 shrink-0">
              <span className="text-sm font-medium text-neutral-300">Spaces</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto pb-2 space-y-0.5">
              <button
                onClick={() => {
                  onSelectSpace('everything');
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer ${
                  activeSpaceId === 'everything' ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
                }`}
              >
                <span className="w-8 h-8 rounded-lg bg-neutral-700 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-white" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-200 truncate">
                    All Tasks <span className="text-neutral-500 font-normal">– {workspaceName}</span>
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
              </button>

              {spaces.map((space) => {
                const Icon = space.icon ? FOLDER_ICON_MAP[space.icon] : null;
                return (
                  <button
                    key={space.id}
                    onClick={() => {
                      onSelectSpace(space.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition cursor-pointer ${
                      activeSpaceId === space.id ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: space.color || '#6366f1' }}>
                      {Icon ? (
                        <Icon className="w-4 h-4 text-white" />
                      ) : (
                        <span className="text-white text-xs font-bold">{space.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-neutral-200 truncate">{space.name}</span>
                    <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
