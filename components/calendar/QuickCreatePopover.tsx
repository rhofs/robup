'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X, MapPin, CalendarDays, Clock, Plus } from 'lucide-react';
import { HierarchyWorkspace, AppUser, useTaskStore } from '../../store/useTaskStore';
import { suggestEventAttendees } from '../../lib/assigneeSuggestions';
import DateSheet from '../mobile/DateSheet';
import { closeOnBackdrop } from '../../lib/backdrop';
import BelongsToPicker, { type BelongsTo } from '../BelongsToPicker';
import FloatingPopover from '../FloatingPopover';
import { pickableMembers } from '../../lib/workspaceMembers';
import AssigneePicker, { PersonPill } from '../AssigneePicker';
import { useSessionStore } from '../../store/useSessionStore';
import ColorSwatchPicker from '../ColorSwatchPicker';
import { EVENT_COLOR_CHOICES } from './EventDetailModal';
import { googleMapsSearchUrl } from '../../lib/googleMapsUrl';
import LocationAutocompleteInput from '../LocationAutocompleteInput';
import MobileQuickCreateSheet from '../mobile/MobileQuickCreateSheet';
import { useIsMobile } from '../../hooks/useIsMobile';

type QuickCreatePopoverProps = {
  open: boolean;
  workspaces: HierarchyWorkspace[];
  users: AppUser[];
  defaultStartDate: string | null;
  // Set when the popover was opened by dragging across several days in the calendar, so the range
  // you drew is the range it opens with. Null for every other way in, where it falls back to the
  // start date — a one-day event, which is what picking a single day means.
  defaultEndDate?: string | null;
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
    description: string | null;
    color: string | null;
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
  defaultEndDate = null,
  activeWorkspaceId,
  onClose,
  onCreateTask,
  onCreateEvent,
}: QuickCreatePopoverProps) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'task' | 'event'>('event');
  const [title, setTitle] = useState('');

  // Task tab fields
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [startDate, setStartDate] = useState<string | null>(defaultStartDate);
  const [dueDate, setDueDate] = useState<string | null>(defaultEndDate);

  // Event tab fields
  // Where the event belongs: its workspace (who sees it, who can attend) and, optionally, a Space.
  // Starts in the workspace you are in, and says so — it used to be that workspace silently.
  const [eventHome, setEventHome] = useState<BelongsTo>({ workspaceId: activeWorkspaceId ?? '', spaceId: null });
  const [eventStart, setEventStart] = useState<string | null>(defaultStartDate);
  const [eventEnd, setEventEnd] = useState<string | null>(defaultEndDate ?? defaultStartDate);
  // The phone's date picker as a window (DateSheet `dialog`) — for the event's dates or the task's, and
  // opened straight on a field's clock when "Add time" under the dates was pressed.
  const [dateDialog, setDateDialog] = useState<{ for: 'event' | 'task'; time?: 'start' | 'end' } | null>(null);
  const [eventLocation, setEventLocation] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  // Description and color were the two fields EventDetailModal offered but this popover didn't,
  // so creating an event and *then* opening it revealed options that hadn't been available a
  // moment earlier — reported directly ("ikke alle valgene der. Men de er der om man lager, så
  // trykker seg inn på den").
  const [eventDescription, setEventDescription] = useState('');
  const [eventColor, setEventColor] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab('event');
      setTitle('');
      setSpaceId('');
      setListId('');
      setStartDate(defaultStartDate);
      setDueDate(defaultEndDate);
      setEventHome({ workspaceId: activeWorkspaceId ?? '', spaceId: null });
      setEventStart(defaultStartDate);
      setEventEnd(defaultEndDate ?? defaultStartDate);
      setDateDialog(null);
      setEventLocation('');
      setAssigneeIds([]);
      setEventDescription('');
      setEventColor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // A phone gets the bottom sheet built after ClickUp's (MobileQuickCreateSheet) — same props, same
  // result; this centred form stays for the desktop.
  if (isMobile) {
    return (
      <MobileQuickCreateSheet
        workspaces={workspaces}
        users={users}
        defaultStartDate={defaultStartDate}
        defaultEndDate={defaultEndDate}
        activeWorkspaceId={activeWorkspaceId}
        onClose={onClose}
        onCreateTask={onCreateTask}
        onCreateEvent={onCreateEvent}
      />
    );
  }

  // Not archived ones, even while they are being shown: new work does not go into a Space that has
  // been put away.
  const spaces = workspaces.flatMap((w) => w.spaces).filter((s) => !s.archived);
  const selectedSpace = spaces.find((s) => s.id === spaceId);
  const canCreateTask = title.trim().length > 0 && !!spaceId && !!listId;
  // An event needs a start; with no end it ends the same day.
  const canCreateEvent = title.trim().length > 0 && !!eventStart && !!eventHome.workspaceId;

  // With no colour picked, an event with exactly one person on it shows in that person's profile
  // colour — worked out when it is drawn (CalendarView's eventColorOf), not stamped on it here, so it
  // follows them. Named under the picker so the choice is visible.
  const soloPerson = !eventColor && assigneeIds.length === 1 ? users.find((u) => u.id === assigneeIds[0]) : undefined;

  const handleCreate = () => {
    if (tab === 'task') {
      if (!canCreateTask) return;
      onCreateTask({ title: title.trim(), spaceId, listId, startDate, dueDate });
    } else {
      if (!canCreateEvent) return;
      onCreateEvent({
        title: title.trim(),
        startDate: eventStart!,
        endDate: eventEnd ?? eventStart!,
        // All day unless a time was added — as on the phone, where a time is what makes it timed.
        allDay: !hasTime(eventStart) && !hasTime(eventEnd ?? eventStart),
        spaceId: eventHome.spaceId,
        workspaceId: eventHome.workspaceId,
        assigneeIds,
        location: eventLocation.trim() || null,
        description: eventDescription.trim() || null,
        color: eventColor,
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
      // Top-anchored on desktop too: centred, the window moved up and down every time its height
      // changed (attendees added), pulling the open attendee list along with it.
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/70 backdrop-blur-xs overflow-y-auto p-4 md:pt-[8vh]"
      {...closeOnBackdrop(onClose)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] my-6 md:my-0 max-h-[85vh] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-y-auto"
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
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Both panels are rendered, stacked in one grid cell, with the inactive one
              `invisible`. The popover is then always as tall as the taller of the two, so switching
              tabs changes what is in the box and not the size of the box — reported as it jumping
              and shrinking on the way from Event to Task.
              
              `invisible` rather than `hidden`: visibility:hidden keeps the element's space, which is
              the whole point here, and takes its fields out of the tab order for free, which
              `opacity-0` would not. */}
          <div className="grid">
            <div
              className={`col-start-1 row-start-1 space-y-3 ${tab === 'task' ? '' : 'invisible'}`}
              aria-hidden={tab !== 'task'}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Space *</label>
                  <select
                    value={spaceId}
                    onChange={(e) => {
                      setSpaceId(e.target.value);
                      setListId('');
                    }}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select a space...</option>
                    {/* Grouped by workspace, so it is plain where the task will live — and who sees it. */}
                    {workspaces.map((w) => {
                      const own = spaces.filter((s) => w.spaces.some((x) => x.id === s.id));
                      if (!own.length) return null;
                      return (
                        <optgroup key={w.id} label={w.isPersonal ? 'Private (only you)' : w.name}>
                          {own.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">List *</label>
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    disabled={!selectedSpace}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedSpace ? 'Select a list...' : 'Pick a space first'}</option>
                    {selectedSpace?.lists.filter((l) => !l.docId && !l.archived).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <DatesField
                start={startDate}
                end={dueDate}
                endName="Due"
                onOpen={(time) => setDateDialog({ for: 'task', time })}
                onClearTime={(which) => (which === 'start' ? setStartDate(dropTime(startDate)) : setDueDate(dropTime(dueDate)))}
              />
            </div>
            <div
              className={`col-start-1 row-start-1 space-y-3 ${tab === 'event' ? '' : 'invisible'}`}
              aria-hidden={tab !== 'event'}
            >
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Belongs to</label>
                <BelongsToPicker
                  full
                  workspaces={workspaces}
                  value={eventHome}
                  onChange={(next) => {
                    // Attendees come from the event's workspace — anyone not in the new one comes off.
                    const ws = workspaces.find((w) => w.id === next.workspaceId);
                    setAssigneeIds((ids) => ids.filter((id) => ws?.members.some((m) => m.id === id)));
                    setEventHome(next);
                  }}
                />
              </div>

              <DatesField
                start={eventStart}
                end={eventEnd}
                endName="End"
                required
                onOpen={(time) => setDateDialog({ for: 'event', time })}
                onClearTime={(which) => (which === 'start' ? setEventStart(dropTime(eventStart)) : setEventEnd(dropTime(eventEnd)))}
              />

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Location
                </label>
                <LocationAutocompleteInput
                  value={eventLocation}
                  onChange={setEventLocation}
                  placeholder="Add a location..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
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

              {/* Color and Description mirror EventDetailModal's own fields so nothing new
                  appears only after the event already exists. Color sits next to the Space
                  selector's purpose (Space cascades a color when none is set explicitly), same
                  relationship the detail modal has. */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Color</label>
                <ColorSwatchPicker value={eventColor} onChange={setEventColor} choices={EVENT_COLOR_CHOICES} size="sm" />
                {/* Always takes its line, shown or not — appearing and disappearing as people were added
                    made the window grow and shrink every other time ("arket blir større og mindre
                    annenhver gang"). */}
                <p className={`text-[10.5px] text-neutral-500 flex items-center gap-1.5 min-h-[16px] ${soloPerson ? '' : 'invisible'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: soloPerson?.color }} />
                  {soloPerson ? `Shows in ${soloPerson.name.split(' ')[0]}'s colour while they are the only one on it.` : '—'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Description</label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  rows={2}
                  placeholder="Add a description..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Attendees</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {users
                    .filter((u) => assigneeIds.includes(u.id))
                    .map((u) => (
                      <PersonPill key={u.id} user={u} onRemove={() => setAssigneeIds((prev) => prev.filter((id) => id !== u.id))} />
                    ))}
                  <FloatingPopover
                    open={assigneePickerOpen}
                    onClose={() => setAssigneePickerOpen(false)}
                    panelClassName="w-72 md:w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2"
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
                    {/* Only members of the workspace the event belongs to can attend. */}
                    <AssigneePicker
                      heading="Attendees"
                      people={pickableMembers(workspaces, users, eventHome.workspaceId)}
                      selectedIds={assigneeIds}
                      suggestedIds={suggestEventAttendees(useTaskStore.getState().events, eventHome.workspaceId)}
                      onToggle={(uid) => setAssigneeIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))}
                      currentUserId={currentUserId}
                    />
                  </FloatingPopover>
                </div>
              </div>
            </div>
          </div>
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
      <AnimatePresence>
        {dateDialog && (
          <DateSheet
            dialog
            initialTimeFor={dateDialog.time}
            start={dateDialog.for === 'event' ? eventStart : startDate}
            end={dateDialog.for === 'event' ? eventEnd : dueDate}
            endName={dateDialog.for === 'event' ? 'End' : 'Due'}
            onClose={() => setDateDialog(null)}
            onSave={(st, en) => {
              if (dateDialog.for === 'event') {
                setEventStart(st);
                setEventEnd(en);
              } else {
                setStartDate(st);
                setDueDate(en);
              }
              setDateDialog(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const parseIso = (iso: string | null) => (iso ? new Date(iso) : null);
const hasTime = (iso: string | null) => {
  const d = parseIso(iso);
  return !!d && (d.getHours() !== 0 || d.getMinutes() !== 0);
};
// The same date with no time (midnight is how "no time" is stored).
const dropTime = (iso: string | null) => {
  const d = parseIso(iso);
  if (!d) return iso;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// One "Dates" field, as on the phone: a tap opens the date picker (DateSheet as a window) for the
// range. Under it, once a date is chosen, its time — "Add time" straight to the clock, without going
// into the dates first ("under datoene så står det 'Add time' når man har valgt dato, så man ikke må
// inn på selve datoen") — or the time it has, with a cross to take it off.
function DatesField({
  start,
  end,
  endName,
  required = false,
  onOpen,
  onClearTime,
}: {
  start: string | null;
  end: string | null;
  endName: 'Due' | 'End';
  required?: boolean;
  onOpen: (time?: 'start' | 'end') => void;
  onClearTime: (which: 'start' | 'end') => void;
}) {
  const timeChip = (which: 'start' | 'end', iso: string | null, name: string) => {
    if (!iso) return null;
    return hasTime(iso) ? (
      <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-neutral-800/70 text-[11.5px] text-neutral-200">
        <button onClick={() => onOpen(which)} className="inline-flex items-center gap-1.5 cursor-pointer">
          <Clock className="w-3 h-3 text-neutral-400" /> {name} {fmtTime(iso)}
        </button>
        <button onClick={() => onClearTime(which)} title="Remove time" className="w-5 h-5 rounded flex items-center justify-center text-neutral-500 hover:text-app-strong cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      </span>
    ) : (
      <button
        onClick={() => onOpen(which)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-dashed border-neutral-700 text-[11.5px] text-neutral-400 hover:text-app-strong hover:border-neutral-500 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Add {name.toLowerCase()} time
      </button>
    );
  };
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">Dates{required ? ' *' : ''}</label>
      <button
        onClick={() => onOpen()}
        className="w-full h-10 px-3 rounded-lg bg-neutral-950 border border-neutral-700 hover:border-neutral-600 flex items-center gap-2.5 text-left cursor-pointer"
      >
        <CalendarDays className="w-4 h-4 text-neutral-500 shrink-0" />
        {start || end ? (
          <span className="text-[12.5px] text-app-strong truncate">
            {start && (
              <>
                <span className="text-neutral-500">Start</span> {fmtDay(start)}
              </>
            )}
            {start && end && <span className="text-neutral-600"> → </span>}
            {end && (
              <>
                <span className="text-neutral-500">{endName}</span> {fmtDay(end)}
              </>
            )}
          </span>
        ) : (
          <span className="text-[12.5px] text-neutral-500">Set dates</span>
        )}
      </button>
      {(start || end) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {timeChip('start', start, 'Start')}
          {timeChip('end', end, endName)}
        </div>
      )}
    </div>
  );
}
