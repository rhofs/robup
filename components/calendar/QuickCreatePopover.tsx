'use client';

import { useEffect, useState } from 'react';
import { X, Check, MapPin } from 'lucide-react';
import { HierarchyWorkspace, AppUser } from '../../store/useTaskStore';
import DatePickerPopover from '../DatePickerPopover';
import FloatingPopover from '../FloatingPopover';
import { startDateColor, dueDateColor, DATE_BADGE_COLOR_HEX, startDateTooltip, dueDateTooltip } from '../../lib/dateBadgeColor';
import { googleMapsSearchUrl } from '../../lib/googleMapsUrl';
import LocationAutocompleteInput from '../LocationAutocompleteInput';

type QuickCreatePopoverProps = {
  open: boolean;
  workspaces: HierarchyWorkspace[];
  users: AppUser[];
  defaultStartDate: string | null;
  activeWorkspaceId: string | null;
  onClose: () => void;
  onCreateTask: (params: { title: string; spaceId: string; listId: string; startDate: string | null; dueDate: string | null }) => void;
  onCreateEvent: (params: {
    title: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    spaceId: string | null;
    workspaceId: string;
    assigneeIds: string[];
    location: string | null;
  }) => void;
};

// Replaces the old CreateTaskModal — same Task-creation fields, plus a genuinely new Event
// concept per the ClickUp-style "New" popover reference. Deliberately not the full reference (no
// Focus time/OOO tabs, video call, recurrence, visibility icons — none of that maps to anything
// this app can actually do today; see PLANNING.md for the scoping decision). Location *does* now
// map to something (Event.location already existed for Google Calendar sync, just wasn't exposed
// here) — see the Location field below.
// Event is the DEFAULT tab, Task secondary — this popover only ever opens from the Planner/
// Calendar view (its one render site is app/page.tsx, triggered by the "+ New task" header
// button and a day cell's hover "+"), where creating a calendar event is the more natural
// action than a task with no inherent date concept of its own.
export default function QuickCreatePopover({
  open,
  workspaces,
  users,
  defaultStartDate,
  activeWorkspaceId,
  onClose,
  onCreateTask,
  onCreateEvent,
}: QuickCreatePopoverProps) {
  const [tab, setTab] = useState<'task' | 'event'>('event');
  const [title, setTitle] = useState('');

  // Task tab fields
  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [startDate, setStartDate] = useState<string | null>(defaultStartDate);
  const [dueDate, setDueDate] = useState<string | null>(null);

  // Event tab fields
  const [eventSpaceId, setEventSpaceId] = useState('');
  const [eventStart, setEventStart] = useState<string | null>(defaultStartDate);
  const [eventEnd, setEventEnd] = useState<string | null>(defaultStartDate);
  const [allDay, setAllDay] = useState(true);
  const [eventLocation, setEventLocation] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTab('event');
      setTitle('');
      setSpaceId('');
      setListId('');
      setStartDate(defaultStartDate);
      setDueDate(null);
      setEventSpaceId('');
      setEventStart(defaultStartDate);
      setEventEnd(defaultStartDate);
      setAllDay(true);
      setEventLocation('');
      setAssigneeIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const spaces = workspaces.flatMap((w) => w.spaces);
  const selectedSpace = spaces.find((s) => s.id === spaceId);
  const canCreateTask = title.trim().length > 0 && !!spaceId && !!listId;
  const canCreateEvent = title.trim().length > 0 && !!eventStart && !!eventEnd && !!activeWorkspaceId;

  const handleCreate = () => {
    if (tab === 'task') {
      if (!canCreateTask) return;
      onCreateTask({ title: title.trim(), spaceId, listId, startDate, dueDate });
    } else {
      if (!canCreateEvent || !activeWorkspaceId) return;
      onCreateEvent({
        title: title.trim(),
        startDate: eventStart!,
        endDate: eventEnd!,
        allDay,
        spaceId: eventSpaceId || null,
        workspaceId: activeWorkspaceId,
        assigneeIds,
        location: eventLocation.trim() || null,
      });
    }
    onClose();
  };

  const canCreate = tab === 'task' ? canCreateTask : canCreateEvent;

  return (
    // items-start (not items-center) on mobile, plus the card's own overflow-y-auto/max-height: a
    // vertically-centered fixed-height modal gets pushed half off-screen by the on-screen keyboard
    // once a field is focused (the keyboard shrinks the *visual* viewport, but centering happens
    // against the full layout viewport) — anchoring near the top means the title field (the very
    // first one) stays visible above the keyboard regardless, and the card can scroll internally
    // if there's still more content than fits. Desktop keeps the original centered look.
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-scrim/70 backdrop-blur-xs overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] my-6 md:my-0 max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-app-strong">New</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-app-strong cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-5 pt-4 flex items-center gap-1 border-b border-neutral-800">
          {(['event', 'task'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium cursor-pointer border-b-2 -mb-px transition ${
                tab === t ? 'text-blue-400 border-blue-500' : 'text-neutral-500 border-transparent hover:text-neutral-300'
              }`}
            >
              {t === 'task' ? 'Task' : 'Event'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreate()}
              placeholder={tab === 'task' ? 'Task title...' : 'Event title...'}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
            />
          </div>

          {tab === 'task' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Space *</label>
                  <select
                    value={spaceId}
                    onChange={(e) => {
                      setSpaceId(e.target.value);
                      setListId('');
                    }}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
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
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
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
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Space (optional, for color)</label>
                <select
                  value={eventSpaceId}
                  onChange={(e) => setEventSpaceId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
                >
                  <option value="">No space</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Start *</label>
                  <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                    <DatePickerPopover value={eventStart} onChange={setEventStart} placeholder="Not set" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">End *</label>
                  <div className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 inline-block">
                    <DatePickerPopover value={eventEnd} onChange={setEventEnd} placeholder="Not set" />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setAllDay((v) => !v)}
                className="flex items-center gap-2 text-[11px] text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center transition ${
                    allDay ? 'bg-blue-500/20 border-blue-500/60 text-blue-400' : 'border-neutral-600'
                  }`}
                >
                  {allDay && <Check className="w-2.5 h-2.5" />}
                </span>
                All day
              </button>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Location
                </label>
                <LocationAutocompleteInput
                  value={eventLocation}
                  onChange={setEventLocation}
                  placeholder="Add a location..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
                />
                {eventLocation.trim() && (
                  <a
                    href={googleMapsSearchUrl(eventLocation.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    <MapPin className="w-2.5 h-2.5" /> View on Google Maps
                  </a>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Attendees</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {users
                    .filter((u) => assigneeIds.includes(u.id))
                    .map((u) => (
                      <span key={u.id} className="text-[10px] px-2 py-1 rounded text-white font-semibold" style={{ backgroundColor: u.color }}>
                        {u.name}
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
                      const checked = assigneeIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => setAssigneeIds((prev) => (checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]))}
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
            </>
          )}
        </div>

        <div className="p-5 pt-0">
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            title={tab === 'task' && !canCreate ? 'Title, Space, and List are all required' : ''}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white text-xs py-2.5 rounded font-medium cursor-pointer transition"
          >
            {tab === 'task' ? 'Create task' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}
