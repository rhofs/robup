'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { HierarchyWorkspace } from '../store/useTaskStore';
import DatePickerPopover from './DatePickerPopover';
import { startDateColor, dueDateColor, DATE_BADGE_COLOR_HEX, startDateTooltip, dueDateTooltip } from '../lib/dateBadgeColor';

type CreateTaskModalProps = {
  open: boolean;
  workspaces: HierarchyWorkspace[];
  defaultStartDate: string | null;
  onClose: () => void;
  onCreate: (params: { title: string; spaceId: string; listId: string; startDate: string | null; dueDate: string | null }) => void;
};

export default function CreateTaskModal({ open, workspaces, defaultStartDate, onClose, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [startDate, setStartDate] = useState<string | null>(defaultStartDate);
  const [dueDate, setDueDate] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setSpaceId('');
      setListId('');
      setStartDate(defaultStartDate);
      setDueDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const spaces = workspaces.flatMap((w) => w.spaces);
  const selectedSpace = spaces.find((s) => s.id === spaceId);
  const canCreate = title.trim().length > 0 && !!spaceId && !!listId;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ title: title.trim(), spaceId, listId, startDate, dueDate });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-white">New task</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreate()}
              placeholder="Task title..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Space *</label>
              <select
                value={spaceId}
                onChange={(e) => {
                  setSpaceId(e.target.value);
                  setListId('');
                }}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a space...</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">List *</label>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                disabled={!selectedSpace}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">{selectedSpace ? 'Select a list...' : 'Pick a space first'}</option>
                {selectedSpace?.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Start date</label>
              <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                <DatePickerPopover
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Not set"
                  badgeColorHex={(() => {
                    const c = startDateColor(startDate, dueDate);
                    return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                  })()}
                  tooltip={startDateTooltip(startDate)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Due date</label>
              <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                <DatePickerPopover
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Not set"
                  badgeColorHex={(() => {
                    const c = dueDateColor(dueDate);
                    return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
                  })()}
                  tooltip={dueDateTooltip(dueDate)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 pt-0">
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            title={!canCreate ? 'Title, Space, and List are all required' : ''}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white text-xs py-2.5 rounded font-medium cursor-pointer transition"
          >
            Create task
          </button>
        </div>
      </div>
    </div>
  );
}
