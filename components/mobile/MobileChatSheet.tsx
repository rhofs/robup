'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import ChatChannelSidebar from '../ChatChannelSidebar';
import DirectMessagesSidebar from '../DirectMessagesSidebar';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: 'chat' | 'directMessages';
  workspaceId: string | null;
};

// Mobile-only channel/DM picker — stands in for the desktop sidebar's ChatChannelSidebar/
// DirectMessagesSidebar (hidden below md, same as Spaces/Lists' FolderTree), reusing those exact
// components unmodified rather than rebuilding channel/DM creation for mobile. Neither component
// takes an "onSelect" callback (they call setActiveChannelId directly, same as on desktop), so
// this closes itself by watching that store field change instead.
export default function MobileChatSheet({ open, onClose, mode, workspaceId }: Props) {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const prevActiveChannelId = useRef(activeChannelId);

  useEffect(() => {
    if (open && activeChannelId !== prevActiveChannelId.current) onClose();
    prevActiveChannelId.current = activeChannelId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

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
              <span className="text-sm font-medium text-neutral-300">{mode === 'chat' ? 'Channels' : 'Direct Messages'}</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
              {mode === 'chat' ? <ChatChannelSidebar workspaceId={workspaceId} /> : <DirectMessagesSidebar />}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
