'use client';

import { useState } from 'react';
import { X, Users, Shield, Trash2, Plus, Crown } from 'lucide-react';
import type { AppUser, HierarchyWorkspace, WorkspaceRole } from '../store/useTaskStore';

const ROLE_COLOR_CHOICES = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#94A3B8'];

type TeamPanelProps = {
  workspace: HierarchyWorkspace;
  currentUserId: string | null;
  canManage: boolean; // is the caller owner/admin — gates role management + member role changes
  onClose: () => void;
  onRequestRemoveMember: (member: AppUser & { workspaceRole: WorkspaceRole }) => void;
  onChangeMemberRole: (userId: string, role: 'admin' | 'member') => void;
  onCreateRole: (name: string, color: string) => void;
  onRenameRole: (roleId: string, name: string) => void;
  onRecolorRole: (roleId: string, color: string) => void;
  onDeleteRole: (roleId: string) => void;
  onAssignRole: (roleId: string, userId: string) => void;
  onUnassignRole: (roleId: string, userId: string) => void;
};

// Replaces the old flat "Team" modal (global user list, one-click unconfirmed account deletion —
// see PLANNING.md's earlier session for why that changed) with a two-tab panel: Members (now with
// a real Owner/Admin/Member tier, not just a flat list) and Roles (new — Discord-style, purely for
// granting access to private Spaces/Folders/Lists/Tasks, see AccessControlPanel).
export default function TeamPanel({
  workspace,
  currentUserId,
  canManage,
  onClose,
  onRequestRemoveMember,
  onChangeMemberRole,
  onCreateRole,
  onRenameRole,
  onRecolorRole,
  onDeleteRole,
  onAssignRole,
  onUnassignRole,
}: TeamPanelProps) {
  const [tab, setTab] = useState<'members' | 'roles'>('members');
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLOR_CHOICES[0]);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const roleBadge = (role: WorkspaceRole) => {
    if (role === 'owner') return <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1"><Crown className="w-3 h-3" /> Owner</span>;
    if (role === 'admin') return <span className="text-[10px] text-blue-400 font-medium">Admin</span>;
    return <span className="text-[10px] text-neutral-500">Member</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[440px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center gap-1.5"><Users className="w-4 h-4" /> Team</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex border-b border-neutral-800">
          <button
            onClick={() => setTab('members')}
            className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'members' ? 'text-white border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            Members
          </button>
          <button
            onClick={() => setTab('roles')}
            className={`flex-1 text-xs py-2 cursor-pointer transition ${tab === 'roles' ? 'text-white border-b-2 border-blue-500' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            Roles
          </button>
        </div>

        {tab === 'members' ? (
          <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
            {workspace.members.length === 0 && <p className="text-xs text-neutral-500">No members yet.</p>}
            {workspace.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800 rounded px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center text-white shrink-0" style={{ backgroundColor: m.color }}>
                    {m.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-200 font-medium truncate">{m.name}</div>
                    {roleBadge(m.workspaceRole)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage && m.workspaceRole !== 'owner' && (
                    <button
                      onClick={() => onChangeMemberRole(m.id, m.workspaceRole === 'admin' ? 'member' : 'admin')}
                      title={m.workspaceRole === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                      className="text-neutral-500 hover:text-blue-400 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManage && m.workspaceRole !== 'owner' && m.id !== currentUserId && (
                    <button onClick={() => onRequestRemoveMember(m)} title="Remove from workspace" className="text-neutral-500 hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
            {workspace.roles.length === 0 && !creatingRole && <p className="text-xs text-neutral-500">No roles yet — roles let you grant specific people access to private Spaces, Folders, Lists, and Tasks.</p>}
            {workspace.roles.map((r) => {
              const expanded = expandedRoleId === r.id;
              return (
                <div key={r.id} className="bg-neutral-950/60 border border-neutral-800 rounded overflow-hidden">
                  <button
                    onClick={() => setExpandedRoleId(expanded ? null : r.id)}
                    className="w-full flex items-center justify-between px-3 py-2 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-xs text-neutral-200 font-medium truncate">{r.name}</span>
                      <span className="text-[10px] text-neutral-600 font-mono">{r.memberIds.length}</span>
                    </div>
                    {canManage && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRole(r.id);
                        }}
                        className="text-neutral-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <div className="border-t border-neutral-800 px-3 py-2 space-y-1.5">
                      {canManage && (
                        <div className="flex gap-1.5 pb-1.5">
                          {ROLE_COLOR_CHOICES.map((c) => (
                            <button
                              key={c}
                              onClick={() => onRecolorRole(r.id, c)}
                              className={`w-4 h-4 rounded-full cursor-pointer ${r.color === c ? 'ring-2 ring-white' : ''}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      )}
                      {workspace.members.map((m) => {
                        const has = r.memberIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            disabled={!canManage}
                            onClick={() => (has ? onUnassignRole(r.id, m.id) : onAssignRole(r.id, m.id))}
                            className="w-full flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-800/60 cursor-pointer text-left disabled:cursor-default"
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${has ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'}`}
                            >
                              {has && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <span className="text-xs text-neutral-300 truncate">{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {canManage &&
              (creatingRole ? (
                <div className="space-y-2 pt-1">
                  <input
                    autoFocus
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newRoleName.trim()) {
                        onCreateRole(newRoleName.trim(), newRoleColor);
                        setNewRoleName('');
                        setCreatingRole(false);
                      }
                      if (e.key === 'Escape') setCreatingRole(false);
                    }}
                    placeholder="Role name..."
                    className="w-full bg-neutral-950 border border-blue-500 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    {ROLE_COLOR_CHOICES.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewRoleColor(c)}
                        className={`w-4 h-4 rounded-full cursor-pointer ${newRoleColor === c ? 'ring-2 ring-white' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      if (!newRoleName.trim()) return;
                      onCreateRole(newRoleName.trim(), newRoleColor);
                      setNewRoleName('');
                      setCreatingRole(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded font-medium cursor-pointer"
                  >
                    Create role
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingRole(true)}
                  className="w-full flex items-center gap-1.5 justify-center text-xs text-blue-400 hover:bg-neutral-800/60 rounded py-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> New role
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
