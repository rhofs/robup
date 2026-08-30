'use client';

import { useState } from 'react';
import { Lock, X } from 'lucide-react';
import type { AppUser, HierarchyRole } from '../store/useTaskStore';

type AccessEntry = { type: 'user' | 'role'; id: string };

type AccessControlPanelProps = {
  label: string; // e.g. "Space", "Folder", "List", "Task" — used in the header/copy
  isPrivate: boolean;
  accessJson: string;
  members: AppUser[]; // the workspace's members — who could be granted access
  roles: HierarchyRole[]; // the workspace's roles
  onSave: (isPrivate: boolean, accessJson: string) => void;
  onClose: () => void;
};

// Shared by Space/Folder/List/Task's own context menus (and the Task modal) — each resource type
// carries the exact same isPrivate/accessJson pair (see PLANNING.md's "each level independent"
// design), so one component handles all four rather than four near-identical copies. A member
// list is intentionally NOT the same as "who's a member of the workspace" here — Owner/Admin
// always see everything regardless of this list (enforced server-side in lib/auth/access.ts),
// so they're not shown as togglable entries; this panel only manages the extra access grants for
// everyone else.
export default function AccessControlPanel({ label, isPrivate, accessJson, members, roles, onSave, onClose }: AccessControlPanelProps) {
  const [draftPrivate, setDraftPrivate] = useState(isPrivate);
  const [entries, setEntries] = useState<AccessEntry[]>(() => {
    try {
      const parsed = JSON.parse(accessJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const hasEntry = (type: AccessEntry['type'], id: string) => entries.some((e) => e.type === type && e.id === id);
  const toggleEntry = (type: AccessEntry['type'], id: string) => {
    setEntries((prev) => (prev.some((e) => e.type === type && e.id === id) ? prev.filter((e) => !(e.type === type && e.id === id)) : [...prev, { type, id }]));
  };

  const handleSave = () => {
    onSave(draftPrivate, JSON.stringify(entries));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-app-strong flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> {label} access
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-app-strong cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <button
            onClick={() => setDraftPrivate((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-neutral-800/60 cursor-pointer"
          >
            <span className="text-xs text-neutral-300">Private — hidden unless explicitly granted</span>
            <span className={`w-8 h-4.5 rounded-full relative transition ${draftPrivate ? 'bg-blue-600' : 'bg-neutral-700'}`}>
              <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition ${draftPrivate ? 'left-4' : 'left-0.5'}`} />
            </span>
          </button>

          {draftPrivate && (
            <div className="space-y-3 pt-1">
              {roles.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Roles</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {roles.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => toggleEntry('role', r.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left"
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            hasEntry('role', r.id) ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                          }`}
                        >
                          {hasEntry('role', r.id) && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                        <span className="text-xs text-neutral-300 truncate">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">People</div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggleEntry('user', m.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          hasEntry('user', m.id) ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                        }`}
                      >
                        {hasEntry('user', m.id) && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      <span
                        className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.initials}
                      </span>
                      <span className="text-xs text-neutral-300 truncate">{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-neutral-500 px-1">The workspace owner and admins can always see everything, regardless of this list.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800">
          <button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-medium cursor-pointer">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
