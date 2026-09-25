'use client';

import { useState } from 'react';
import { X, Shield, Plus } from 'lucide-react';
import type { HierarchyWorkspace } from '../../store/useTaskStore';
import { useTaskStore } from '../../store/useTaskStore';
import { useWikiStore, type WikiEditorEntry } from '../../store/useWikiStore';
import { MiniAvatar } from '../AssigneePicker';

// Owner/admin only: who else may edit the wiki, and which List bug reports and feature requests
// land in. Owners and admins always edit and are not listed — there is nothing to switch off.
export default function WikiSettingsDialog({ workspace, onClose }: { workspace: HierarchyWorkspace; onClose: () => void }) {
  const wiki = useWikiStore((s) => s.byWorkspace[workspace.id]);
  const saveSettings = useWikiStore((s) => s.saveSettings);
  const users = useTaskStore((s) => s.users);
  const [editors, setEditors] = useState<WikiEditorEntry[]>(wiki?.editors ?? []);
  const [feedbackListId, setFeedbackListId] = useState<string | null>(wiki?.feedbackListId ?? null);
  const [saving, setSaving] = useState(false);

  const has = (e: WikiEditorEntry) => editors.some((x) => x.type === e.type && x.id === e.id);
  const toggle = (e: WikiEditorEntry) => setEditors((cur) => (has(e) ? cur.filter((x) => !(x.type === e.type && x.id === e.id)) : [...cur, e]));

  const plainMembers = workspace.members.filter((m) => m.workspaceRole === 'member');
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const lists = workspace.spaces.flatMap((sp) => sp.lists.filter((l) => !l.archived).map((l) => ({ id: l.id, label: `${sp.name} / ${l.name}` })));

  const save = async () => {
    setSaving(true);
    await saveSettings(workspace.id, { editors, feedbackListId });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] max-h-[85vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-sm text-app-strong">Wiki settings</h3>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-app-strong cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          <section>
            <h4 className="text-[12px] font-semibold text-app-strong">Who can edit</h4>
            <p className="text-[11.5px] text-neutral-500 mt-0.5">Owners and admins can always edit. Everyone else can read.</p>

            {workspace.roles.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-4 mb-1.5">Roles</p>
                <div className="flex flex-wrap gap-1.5">
                  {workspace.roles.map((r) => {
                    const on = has({ type: 'role', id: r.id });
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggle({ type: 'role', id: r.id })}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] cursor-pointer transition ${
                          on ? 'border-transparent text-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
                        }`}
                        style={on ? { backgroundColor: r.color } : undefined}
                      >
                        <Shield className="w-3 h-3" />
                        {r.name}
                        {!on && <Plus className="w-3 h-3 opacity-60" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-4 mb-1.5">People</p>
            {plainMembers.length === 0 ? (
              <p className="text-[12px] text-neutral-500">Everyone in this workspace is already an owner or admin.</p>
            ) : (
              <div className="space-y-px max-h-56 overflow-y-auto -mx-1">
                {plainMembers.map((m) => {
                  const u = userById.get(m.id) ?? m;
                  const on = has({ type: 'user', id: m.id });
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle({ type: 'user', id: m.id })}
                      className="w-full flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-neutral-800/60 cursor-pointer text-left"
                    >
                      <MiniAvatar user={u} size={24} />
                      <span className={`flex-1 text-[13px] truncate ${on ? 'text-app-strong font-medium' : 'text-neutral-300'}`}>{u.name}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${on ? 'bg-blue-500/15 text-blue-400' : 'text-neutral-600'}`}
                      >
                        {on ? 'Can edit' : 'Reads'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h4 className="text-[12px] font-semibold text-app-strong">Bug reports and feature requests</h4>
            <p className="text-[11.5px] text-neutral-500 mt-0.5">Each one becomes a task in this list.</p>
            <select
              value={feedbackListId ?? ''}
              onChange={(e) => setFeedbackListId(e.target.value || null)}
              className="mt-2 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-[13px] text-app-strong focus:outline-none focus:border-blue-500/70"
            >
              <option value="">Not chosen — the buttons will say so</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[13px] text-neutral-400 hover:text-app-strong cursor-pointer">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[13px] font-medium cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
