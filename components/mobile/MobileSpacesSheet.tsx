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
// and the board view's own header button. A full-height page (opaque background, no dimmed
// backdrop, no partial-height sheet) rather than a popup — tapping "Spaces" should feel like
// arriving at a real destination you can navigate onward from, not opening a dialog on top of
// wherever you were. Stops just above the bottom nav (z-index below MobileBottomNav's, which is
// deliberately bumped above every *other* mobile overlay only for this one) so the nav pill stays
// visible and tappable the whole time — you can jump straight to Planner/Chat/Menu without first
// closing this. Deliberately a flat list of Spaces only (no inline Folder/List drill-down like an
// earlier version of this sheet had) — tapping a Space lands on its own Space Home (SpaceHome.tsx,
// already an existing desktop feature: a browsable page of that Space's Lists), which already
// covers "now show me this Space's Lists" without this screen also needing to duplicate that UI.
export default function MobileSpacesSheet({ open, onClose, workspaceName, spaces, activeSpaceId, onSelectSpace }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-x-0 top-0 z-30 md:hidden bg-neutral-950 flex flex-col"
          style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/60 shrink-0">
            <span className="text-base font-semibold text-white">Spaces</span>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
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
      )}
    </AnimatePresence>
  );
}
