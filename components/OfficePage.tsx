'use client';

import { useMemo, useState } from 'react';
import { Phone, Pencil, ArrowLeft, Briefcase, Smile } from 'lucide-react';
import { HierarchyWorkspace, HierarchyRoom, AppUser, Task, StatusDef } from '../store/useTaskStore';
import OfficeRooms from './OfficeRooms';

// Huly-style "office" — a room-based floor plan of the team (OfficeRooms.tsx), and (once a
// person is picked) their own page: contact info + every task assigned to them across every
// Space. No Space/Folder concept for people themselves, so this stays flatter than FolderTree.
type OfficePageProps = {
  users: AppUser[];
  activeUserId: string | null;
  workspaces: HierarchyWorkspace[];
  tasks: Task[];
  statuses: StatusDef[];
  onSelectUser: (userId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  onUpdatePhone: (userId: string, phone: string | null) => void;
  onUpdateUserField: (userId: string, field: 'title' | 'status', value: string | null) => void;
  onDeleteRoomRequest: (room: HierarchyRoom) => void;
};

export default function OfficePage({
  users,
  activeUserId,
  workspaces,
  tasks,
  statuses,
  onSelectUser,
  onOpenTask,
  onUpdatePhone,
  onUpdateUserField,
  onDeleteRoomRequest,
}: OfficePageProps) {
  // taskId's List/Space aren't embedded on Task itself — build the lookup once from the tree,
  // same shape as the cross-Space breadcrumbs elsewhere in the app (e.g. CreateTaskModal).
  const listSpaceById = useMemo(() => {
    const map = new Map<string, { spaceName: string; listName: string }>();
    for (const ws of workspaces) {
      for (const space of ws.spaces) {
        for (const list of space.lists) {
          map.set(list.id, { spaceName: space.name, listName: list.name });
        }
      }
    }
    return map;
  }, [workspaces]);

  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  const activeUser = users.find((u) => u.id === activeUserId) ?? null;
  const workspace = workspaces[0];

  if (!activeUser) {
    if (!workspace) return null;
    return (
      <OfficeRooms
        workspaceId={workspace.id}
        messageOfTheDay={workspace.messageOfTheDay}
        rooms={workspace.rooms}
        users={users}
        tasks={tasks}
        onSelectUser={(id) => onSelectUser(id)}
        onDeleteRoomRequest={onDeleteRoomRequest}
      />
    );
  }

  const myTasks = tasks
    .filter((t) => !t.archived && t.assignees.some((a) => a.id === activeUser.id))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button onClick={() => onSelectUser(null)} className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to team
      </button>

      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded p-5 flex items-center gap-4">
        <span
          className="w-16 h-16 rounded-full text-lg font-bold flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: activeUser.color }}
        >
          {activeUser.initials}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">{activeUser.name}</span>
            {activeUser.status && <span className="text-xs">{activeUser.status}</span>}
          </div>
          <EditableField
            icon={Briefcase}
            value={activeUser.title}
            placeholder="Legg til tittel..."
            onCommit={(v) => onUpdateUserField(activeUser.id, 'title', v)}
          />
          <EditableField
            icon={Smile}
            value={activeUser.status}
            placeholder="Sett status (f.eks. ☕ På pause)..."
            onCommit={(v) => onUpdateUserField(activeUser.id, 'status', v)}
          />
          <EditableField icon={Phone} value={activeUser.phone} placeholder="Add phone number..." onCommit={(v) => onUpdatePhone(activeUser.id, v)} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Tasks ({myTasks.length})</h3>
        {myTasks.length === 0 ? (
          <div className="text-[11px] text-neutral-500 px-1 py-4 text-center border border-dashed border-neutral-800 rounded">
            No assigned tasks.
          </div>
        ) : (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded divide-y divide-neutral-800/50">
            {myTasks.map((t) => {
              const loc = listSpaceById.get(t.listId);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-200 truncate">{t.title}</div>
                    {loc && (
                      <div className="text-[10px] text-neutral-500 truncate">
                        {loc.spaceName} / {loc.listName}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded border shrink-0"
                    style={{ color: statusColorOf(t.status), borderColor: statusColorOf(t.status) + '55', backgroundColor: statusColorOf(t.status) + '20' }}
                  >
                    {t.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableField({
  icon: Icon,
  value,
  placeholder,
  onCommit,
}: {
  icon: typeof Phone;
  value: string | null;
  placeholder: string;
  onCommit: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer">
      <Icon className="w-3 h-3 shrink-0" />
      {value || <span className="italic text-neutral-500">{placeholder}</span>}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}
