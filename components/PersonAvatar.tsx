'use client';

import type { useDraggable } from '@dnd-kit/core';
import type { AppUser } from '../store/useTaskStore';
import { usePresenceStore } from '../store/usePresenceStore';

const SIZE_CLASSES = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-16 h-16 text-lg',
} as const;

const DOT_SIZE_CLASSES = {
  sm: 'w-2 h-2 -bottom-0 -right-0',
  md: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  lg: 'w-4 h-4 -bottom-0.5 -right-0.5',
} as const;

// Opposite corner from the DND dot above, so the two independent signals never collide.
const ONLINE_DOT_SIZE_CLASSES = {
  sm: 'w-2 h-2 -bottom-0 -left-0',
  md: 'w-2.5 h-2.5 -bottom-0.5 -left-0.5',
  lg: 'w-4 h-4 -bottom-0.5 -left-0.5',
} as const;

type PersonAvatarProps = {
  user: AppUser;
  size?: keyof typeof SIZE_CLASSES;
  onClick?: () => void;
  showDndToggle?: boolean;
  onToggleDnd?: () => void;
  className?: string;
  // Drag wiring stays owned by whichever parent calls useDraggable (FloorRoom/Lobby) — this
  // component only renders the circle + the DND badge's own click handling, same split
  // OfficeRooms.tsx's old PersonChip already had between "visual" and "draggable".
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: ReturnType<typeof useDraggable>['attributes'];
  dragListeners?: ReturnType<typeof useDraggable>['listeners'];
  style?: React.CSSProperties;
};

// Shared avatar circle (initials + user.color) used everywhere this HQ-building redesign shows a
// person: the compact overlapping floor/lobby clusters and RoomDetail's bigger member list. New —
// this pattern was previously copy-pasted independently in OfficeRooms.tsx/OfficePage.tsx/
// app/page.tsx/TaskRow.tsx; this component only replaces the OfficeRooms.tsx/RoomDetail.tsx
// usages, the other pre-existing duplicates are untouched (out of scope for this redesign).
export default function PersonAvatar({
  user,
  size = 'md',
  onClick,
  showDndToggle,
  onToggleDnd,
  className,
  dragRef,
  dragAttributes,
  dragListeners,
  style,
}: PersonAvatarProps) {
  const isOnline = usePresenceStore((s) => s.onlineUserIds.has(user.id));
  return (
    <button
      ref={dragRef as React.Ref<HTMLButtonElement>}
      {...dragAttributes}
      {...dragListeners}
      onClick={onClick}
      title={user.name}
      style={style}
      className={`relative shrink-0 rounded-full cursor-grab active:cursor-grabbing ${className ?? ''}`}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover transition ${user.isDnd ? 'ring-2 ring-red-500' : ''}`}
        />
      ) : (
        <span
          className={`${SIZE_CLASSES[size]} rounded-full font-bold flex items-center justify-center text-white transition ${
            user.isDnd ? 'ring-2 ring-red-500' : ''
          }`}
          style={{ backgroundColor: user.color }}
        >
          {user.initials}
        </span>
      )}
      {showDndToggle && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDnd?.();
          }}
          title={user.isDnd ? 'Do Not Disturb — click to clear' : 'Set Do Not Disturb'}
          className={`absolute ${DOT_SIZE_CLASSES[size]} rounded-full border-2 border-neutral-900 cursor-pointer transition ${
            user.isDnd ? 'bg-red-500' : 'bg-neutral-600 hover:bg-neutral-500'
          }`}
        />
      )}
      {isOnline && (
        <span
          title="Online now"
          className={`absolute ${ONLINE_DOT_SIZE_CLASSES[size]} rounded-full border-2 border-neutral-900 bg-green-500`}
        />
      )}
    </button>
  );
}
