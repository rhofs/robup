'use client';

import { useState } from 'react';
import type { useDraggable } from '@dnd-kit/core';
import { Settings2, Crown, Shield, Trash2, Check } from 'lucide-react';
import { useTaskStore, type AppUser, type HierarchyWorkspace } from '../store/useTaskStore';
import FloatingPopover from './FloatingPopover';
import PersonAvatar from './PersonAvatar';

type ManageableAvatarProps = {
  user: AppUser;
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean;
  onRequestRemove: (user: AppUser) => void;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showDndToggle?: boolean;
  onToggleDnd?: () => void;
  className?: string;
  dragRef?: (node: HTMLElement | null) => void;
  dragAttributes?: ReturnType<typeof useDraggable>['attributes'];
  dragListeners?: ReturnType<typeof useDraggable>['listeners'];
  style?: React.CSSProperties;
};

const BADGE_SIZE_CLASSES = {
  sm: 'w-3 h-3 -top-0.5 -right-0.5',
  md: 'w-3.5 h-3.5 -top-0.5 -right-0.5',
  lg: 'w-5 h-5 -top-1 -right-1',
} as const;

// Wraps PersonAvatar (unchanged, same as OfficeRooms.tsx's existing DraggableAvatar wrapper for
// drag wiring) to add an Owner/Admin-only manage badge — a separate, additive click target from
// the avatar's own onClick, so "click avatar → open profile" behavior is never disturbed. Office
// is now where team membership actually gets managed (see PLANNING.md) — this is the one place
// that surface lives, reused by both OfficeRooms.tsx (draggable) and RoomDetail.tsx (browse-only).
export default function ManageableAvatar({
  user,
  workspace,
  currentUserId,
  canManage,
  onRequestRemove,
  size = 'md',
  onClick,
  showDndToggle,
  onToggleDnd,
  className,
  dragRef,
  dragAttributes,
  dragListeners,
  style,
}: ManageableAvatarProps) {
  const { changeWorkspaceMemberRole, assignRole, unassignRole } = useTaskStore();
  const [open, setOpen] = useState(false);

  const avatar = (
    <PersonAvatar
      user={user}
      size={size}
      onClick={onClick}
      showDndToggle={showDndToggle}
      onToggleDnd={onToggleDnd}
      className={className}
      dragRef={dragRef}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      style={style}
    />
  );

  if (!canManage) return avatar;

  const member = workspace.members.find((m) => m.id === user.id);
  const workspaceRole = member?.workspaceRole ?? 'member';
  const isOwner = workspaceRole === 'owner';
  const isSelf = user.id === currentUserId;

  return (
    <span className="relative inline-block shrink-0">
      {avatar}
      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchor={
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            title="Manage"
            className={`absolute ${BADGE_SIZE_CLASSES[size]} rounded-full bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-900 flex items-center justify-center cursor-pointer text-neutral-200`}
          >
            <Settings2 className="w-[65%] h-[65%]" />
          </button>
        }
        panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1.5 max-h-72 overflow-y-auto"
      >
        <div className="px-3 py-1.5 border-b border-neutral-800 mb-1">
          <div className="text-xs text-neutral-200 font-medium truncate">{user.name}</div>
          {isOwner ? (
            <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1"><Crown className="w-3 h-3" /> Owner</span>
          ) : (
            <span className="text-[10px] text-neutral-500 capitalize">{workspaceRole}</span>
          )}
        </div>

        {!isOwner && (
          <button
            onClick={() => changeWorkspaceMemberRole(workspace.id, user.id, workspaceRole === 'admin' ? 'member' : 'admin')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer text-left"
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            {workspaceRole === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
          </button>
        )}

        {workspace.roles.length > 0 && (
          <div className="px-3 py-1.5 border-t border-neutral-800 mt-1 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 pb-0.5">Roles</div>
            {workspace.roles.map((r) => {
              const has = r.memberIds.includes(user.id);
              return (
                <button
                  key={r.id}
                  onClick={() => (has ? unassignRole(workspace.id, r.id, user.id) : assignRole(workspace.id, r.id, user.id))}
                  className="w-full flex items-center gap-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer text-left"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${has ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'}`}>
                    {has && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-xs text-neutral-300 truncate">{r.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {!isOwner && !isSelf && (
          <div className="border-t border-neutral-800 mt-1 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                onRequestRemove(user);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 cursor-pointer text-left"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" /> Remove from workspace
            </button>
          </div>
        )}
      </FloatingPopover>
    </span>
  );
}
