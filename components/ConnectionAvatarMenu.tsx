'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import FloatingPopover from './FloatingPopover';

type ConnectionAvatarMenuProps = {
  user: { id: string; name: string; initials: string; color: string };
  onViewProfile: () => void;
  onStartDM: () => void;
  size?: 'sm' | 'md';
};

const SIZE_CLASSES = { sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-xs' } as const;

// Network/Connections' own avatar affordance (backlog #2): click opens the read-only profile
// (ViewProfileModal), right-click opens a small "Send DM" menu — same right-click-for-DM pattern
// ManageableAvatar.tsx already established for Office, just without the role/remove management
// items (a Connection isn't necessarily a fellow workspace member, so none of that applies here).
export default function ConnectionAvatarMenu({ user, onViewProfile, onStartDM, size = 'sm' }: ConnectionAvatarMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <FloatingPopover
      open={menuOpen}
      onClose={() => setMenuOpen(false)}
      panelClassName="w-40 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
      anchor={
        <button
          onClick={onViewProfile}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(true);
          }}
          title={user.name}
          className={`${SIZE_CLASSES[size]} rounded-full font-bold flex items-center justify-center text-white shrink-0 cursor-pointer`}
          style={{ backgroundColor: user.color }}
        >
          {user.initials}
        </button>
      }
    >
      <button
        onClick={() => {
          setMenuOpen(false);
          onStartDM();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer text-left"
      >
        <MessageCircle className="w-3.5 h-3.5 shrink-0" /> Send DM
      </button>
    </FloatingPopover>
  );
}
