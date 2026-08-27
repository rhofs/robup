'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import DocSubpagesPanel from '../DocSubpagesPanel';
import type { AppUser, HierarchySpace, TaskDoc } from '../../store/useTaskStore';

type Props = {
  open: boolean;
  onClose: () => void;
  space: HierarchySpace;
  rootDoc: TaskDoc;
  activeDocId: string;
  members: AppUser[];
  onOpenDoc: (docId: string) => void;
  onAddPage: (parentId: string) => void;
  onDocContextMenu: (e: React.MouseEvent, doc: TaskDoc) => void;
  renameDocId: string | null;
  onRenameDocHandled: () => void;
  docDropIndicator: { targetId: string; position: 'above' | 'below' } | null;
};

// Mobile-only page picker for a Doc "book" — stands in for the desktop-only DocSubpagesPanel
// column (hidden below md, same as Spaces/Lists' FolderTree; at phone width its fixed 224px
// column left barely any room for the doc editor itself, reported live as "docs er croppa
// vekk"). Reuses DocSubpagesPanel unmodified inside a bottom sheet — closes itself by watching
// activeDocId change, since DocSubpagesPanel calls onOpenDoc directly rather than taking its own
// onSelect/close callback.
export default function MobileDocPagesSheet({
  open,
  onClose,
  space,
  rootDoc,
  activeDocId,
  members,
  onOpenDoc,
  onAddPage,
  onDocContextMenu,
  renameDocId,
  onRenameDocHandled,
  docDropIndicator,
}: Props) {
  const prevActiveDocId = useRef(activeDocId);

  useEffect(() => {
    if (open && activeDocId !== prevActiveDocId.current) onClose();
    prevActiveDocId.current = activeDocId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId]);

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
            className="relative bg-neutral-900 border-t border-neutral-800/80 rounded-t-2xl flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/80 shrink-0">
              <span className="text-sm font-medium text-neutral-300">Pages</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
              <DocSubpagesPanel
                space={space}
                rootDoc={rootDoc}
                activeDocId={activeDocId}
                members={members}
                onOpenDoc={onOpenDoc}
                onAddPage={onAddPage}
                onDocContextMenu={onDocContextMenu}
                renameDocId={renameDocId}
                onRenameDocHandled={onRenameDocHandled}
                docDropIndicator={docDropIndicator}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
