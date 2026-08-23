'use client';

import { useState } from 'react';
import { X, Trash2, Check, MapPin } from 'lucide-react';
import { Event, HierarchyWorkspace, AppUser } from '../../store/useTaskStore';
import DatePickerPopover from '../DatePickerPopover';
import FloatingPopover from '../FloatingPopover';
import ColorSwatchPicker from '../ColorSwatchPicker';
import EventActivityPanel from './EventActivityPanel';
import GoogleIcon from '../icons/GoogleIcon';
import { googleMapsSearchUrl } from '../../lib/googleMapsUrl';

const EVENT_COLOR_CHOICES = ['#c89642', '#618cd1', '#9a61d1', '#349f7c', '#cd6565', '#31a0b3', '#cb6798', '#8d97a5'];

type EventDetailModalProps = {
  event: Event | null;
  workspaces: HierarchyWorkspace[];
  users: AppUser[];
  onClose: () => void;
  onUpdate: (patch: {
    title?: string;
    description?: string | null;
    location?: string | null;
    startDate?: string;
    endDate?: string;
    allDay?: boolean;
    color?: string | null;
    spaceId?: string | null;
  }) => void;
  onSetAssignees: (assigneeIds: string[]) => void;
  onDelete: () => void;
};

// Opens on clicking an Event bar in the Planner. Deliberately much smaller than the Task modal —
// no subtasks/docs/status/custom-fields, none of that concept applies to an Event. Does now have
// Activity & Comments (backlog #12 — see EventActivityPanel), the one thing from the Task modal
// that genuinely does apply here (a date-range edit needs somewhere to log to).
export default function EventDetailModal({ event, workspaces, users, onClose, onUpdate, onSetAssignees, onDelete }: EventDetailModalProps) {
  const [titleDraft, setTitleDraft] = useState(event?.title ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  if (!event) return null;

  const spaces = workspaces.flatMap((w) => w.spaces);
  const syncOwnerEmail = event.googleSyncOwnerId ? users.find((u) => u.id === event.googleSyncOwnerId)?.googleEmail : null;
  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== event.title) onUpdate({ title: trimmed });
    else setTitleDraft(event.title);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[420px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        {/* Same "where did this come from" tell as the ClickUp reference screenshot (Google icon
            + "in <account email>") — shown for any event synced to Google, whether it originated
            there or was pushed out from Siqt, not just imports. */}
        {syncOwnerEmail && (
          <div className="px-5 pt-3 flex items-center gap-1.5 text-[10px] text-neutral-500">
            <GoogleIcon className="w-3 h-3 shrink-0" />
            <span>{event.importedFromGoogle ? 'Google Calendar event' : 'Synced to Google Calendar'} · in {syncOwnerEmail}</span>
          </div>
        )}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(event.title);
                  setEditingTitle(false);
                }
              }}
              className="flex-1 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none mr-2"
            />
          ) : (
            <button onClick={() => setEditingTitle(true)} className="font-bold text-sm text-white cursor-text text-left truncate mr-2">
              {event.title}
            </button>
          )}
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Start</label>
              <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                <DatePickerPopover
                  value={new Date(event.startDate).toISOString()}
                  onChange={(v) => v && onUpdate({ startDate: v })}
                  placeholder="Not set"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">End</label>
              <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                <DatePickerPopover
                  value={new Date(event.endDate).toISOString()}
                  onChange={(v) => v && onUpdate({ endDate: v })}
                  placeholder="Not set"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => onUpdate({ allDay: !event.allDay })}
            className="flex items-center gap-2 text-[11px] text-neutral-400 hover:text-neutral-200 cursor-pointer"
          >
            <span
              className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center transition ${
                event.allDay ? 'bg-blue-500/20 border-blue-500/60 text-blue-400' : 'border-neutral-600'
              }`}
            >
              {event.allDay && <Check className="w-2.5 h-2.5" />}
            </span>
            All day
          </button>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Space (for color)</label>
            <select
              value={event.spaceId ?? ''}
              onChange={(e) => onUpdate({ spaceId: e.target.value || null })}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">No space</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {!event.spaceId && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Color</label>
              <ColorSwatchPicker value={event.color} onChange={(color) => onUpdate({ color })} choices={EVENT_COLOR_CHOICES} size="sm" />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location
            </label>
            <input
              type="text"
              value={event.location ?? ''}
              onChange={(e) => onUpdate({ location: e.target.value || null })}
              placeholder="Add a location..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            {event.location && (
              <a
                href={googleMapsSearchUrl(event.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
              >
                <MapPin className="w-2.5 h-2.5" /> View on Google Maps
              </a>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Description</label>
            <textarea
              value={event.description ?? ''}
              onChange={(e) => onUpdate({ description: e.target.value || null })}
              rows={3}
              placeholder="Add a description..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Attendees</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {event.assignees.map((a) => (
                <span key={a.id} className="text-[10px] px-2 py-1 rounded text-white font-semibold" style={{ backgroundColor: a.color }}>
                  {a.name}
                </span>
              ))}
              <FloatingPopover
                open={assigneePickerOpen}
                onClose={() => setAssigneePickerOpen(false)}
                panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
                anchor={
                  <button
                    onClick={() => setAssigneePickerOpen((o) => !o)}
                    title="Add attendee"
                    className="w-6 h-6 rounded-full border border-dashed border-neutral-600 text-neutral-500 hover:border-blue-400 hover:text-blue-400 text-xs flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                }
              >
                {users.map((u) => {
                  const checked = event.assignees.some((a) => a.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        const ids = event.assignees.map((a) => a.id);
                        onSetAssignees(checked ? ids.filter((id) => id !== u.id) : [...ids, u.id]);
                      }}
                      className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                          checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                        }`}
                      >
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className="truncate">{u.name}</span>
                    </button>
                  );
                })}
              </FloatingPopover>
            </div>
          </div>

          <EventActivityPanel eventId={event.id} />

          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 py-2 rounded cursor-pointer transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete event
          </button>
        </div>
      </div>
    </div>
  );
}
