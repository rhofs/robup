'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { overlayStyle, useVisibleViewport } from '../../hooks/useVisibleViewport';
import { X, CalendarDays, MapPin, Palette, Layers, UserCircle, ChevronDown, Check, ListChecks } from 'lucide-react';
import type { AppUser, HierarchyWorkspace } from '../../store/useTaskStore';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import { pickableMembers } from '../../lib/workspaceMembers';
import { suggestEventAttendees } from '../../lib/assigneeSuggestions';
import AssigneePicker, { AssigneeStack } from '../AssigneePicker';
import ColorSwatchPicker from '../ColorSwatchPicker';
import LocationAutocompleteInput from '../LocationAutocompleteInput';
import { EVENT_COLOR_CHOICES } from '../calendar/EventDetailModal';
import DateSheet from './DateSheet';
import { useSheetDrag } from './sheetDrag';

// "New" on a phone — the Planner's quick create, redone after ClickUp's mobile task sheet (the user's
// screenshots, and theirs of ours: "Kan vi få det med streamlined som clickup?"). A sheet from the
// bottom instead of a centred form: the name large and borderless at the top, a description line
// under it, then one row per property with an icon — tap a row to set it — and Create at the
// bottom. Dates open "Choose dates" (DateSheet) with its calendar and clock face, instead of the
// small desktop popover.
//
// Same props and same result as the desktop QuickCreatePopover, which renders this on a phone. The
// fields are the ones that popover had; nothing here creates anything it could not.

type Props = {
  workspaces: HierarchyWorkspace[];
  users: AppUser[];
  defaultStartDate: string | null;
  defaultEndDate: string | null;
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

const hasTime = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
};

// "Tue 29 Sep" / "Tue 29 Sep, 16:00", and "→" between two different days.
function datesSummary(start: string | null, end: string | null): string | null {
  const one = (iso: string) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return hasTime(iso) ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : day;
  };
  if (start && end && start !== end) return `${one(start)} → ${one(end)}`;
  if (start) return one(start);
  if (end) return `Due ${one(end)}`;
  return null;
}

export function Row({ icon: Icon, children, onClick }: { icon: typeof CalendarDays; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-4 min-h-[60px] py-2 ${onClick ? 'cursor-pointer active:opacity-70' : ''}`}>
      <Icon className="w-6 h-6 text-neutral-500 shrink-0" />
      <div className="flex-1 min-w-0 border-b border-neutral-800 self-stretch flex items-center">{children}</div>
    </div>
  );
}

// A bottom sheet for a list of choices (the list to create a task in, attendees).
export function PickSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const drag = useSheetDrag(onClose);
  const visible = useVisibleViewport();
  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-[90] flex flex-col justify-end bg-scrim/50 pt-[calc(env(safe-area-inset-top)+12px)]" style={overlayStyle(visible)} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        className="bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div {...drag.handleProps} className="relative flex items-center justify-center px-5 pt-5 pb-3 shrink-0">
          <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-neutral-700" />
          <h3 className="text-[17px] font-semibold text-app-strong">{title}</h3>
          <button onClick={onClose} className="absolute right-4 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-2">{children}</div>
      </motion.div>
    </div>
  );
}

export default function MobileQuickCreateSheet({
  workspaces,
  users,
  defaultStartDate,
  defaultEndDate,
  activeWorkspaceId,
  onClose,
  onCreateTask,
  onCreateEvent,
}: Props) {
  const visible = useVisibleViewport();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [tab, setTab] = useState<'event' | 'task'>('event');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [start, setStart] = useState<string | null>(defaultStartDate);
  const [end, setEnd] = useState<string | null>(defaultEndDate ?? defaultStartDate);
  const [taskDue, setTaskDue] = useState<string | null>(defaultEndDate);

  const [spaceId, setSpaceId] = useState('');
  const [listId, setListId] = useState('');
  const [eventSpaceId, setEventSpaceId] = useState('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const [sheet, setSheet] = useState<'dates' | 'list' | 'people' | 'space' | null>(null);
  const drag = useSheetDrag(onClose);

  // Not archived Spaces: new work does not go into one that has been put away.
  const spaces = useMemo(() => workspaces.flatMap((w) => w.spaces).filter((s) => !s.archived), [workspaces]);
  const list = spaces.flatMap((s) => s.lists).find((l) => l.id === listId);
  const eventSpace = spaces.find((s) => s.id === eventSpaceId);
  const attendees = users.filter((u) => assigneeIds.includes(u.id));

  const isTask = tab === 'task';
  const canCreate = isTask ? !!title.trim() && !!listId : !!title.trim() && !!start && !!activeWorkspaceId;

  const create = () => {
    if (!canCreate) return;
    if (isTask) {
      onCreateTask({ title: title.trim(), spaceId, listId, startDate: start, dueDate: taskDue });
    } else {
      const eventEnd = end ?? start!;
      onCreateEvent({
        title: title.trim(),
        startDate: start!,
        endDate: eventEnd,
        // All day unless a time was picked — the choice the old form made with a checkbox, made by
        // whether "Add time" was used.
        allDay: !hasTime(start) && !hasTime(eventEnd),
        spaceId: eventSpaceId || null,
        workspaceId: activeWorkspaceId!,
        assigneeIds,
        location: location.trim() || null,
        description: description.trim() || null,
        color,
      });
    }
    onClose();
  };

  const summary = datesSummary(start, isTask ? taskDue : end);

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-[80] flex flex-col justify-end bg-scrim/60 pt-[calc(env(safe-area-inset-top)+12px)]" style={overlayStyle(visible)} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        className="bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col"
      >
        {/* The grabber and the header drag the sheet; pull it down to cancel. */}
        <div {...drag.handleProps} className="shrink-0">
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-10 h-1 rounded-full bg-neutral-700" />
        </div>

        <div className="flex items-center gap-3 px-5 pt-2">
          <div className="flex gap-0.5 rounded-full bg-neutral-800/70 p-0.5">
            {(['event', 'task'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-[14px] font-semibold capitalize cursor-pointer transition ${
                  tab === t ? 'bg-neutral-900 text-app-strong shadow-sm' : 'text-neutral-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        </div>

        <div className="overflow-y-auto px-5 pt-4">
          {isTask && (
            <button onClick={() => setSheet('list')} className="flex items-center gap-1 text-[15px] text-neutral-500 cursor-pointer mb-1">
              In <span className="font-semibold text-app-strong">{list ? list.name : 'Choose a list'}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder={isTask ? 'Untitled task' : 'Event name'}
            className="w-full bg-transparent text-[28px] font-semibold text-app-strong placeholder:text-neutral-600 focus:outline-none py-1"
          />
          {!isTask && (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={1}
              placeholder="Tap to add a description…"
              className="w-full bg-transparent text-[16px] text-neutral-300 placeholder:text-neutral-500 focus:outline-none resize-none py-2"
            />
          )}

          <div className="mt-2">
            {!isTask && (
              <Row icon={UserCircle} onClick={() => setSheet('people')}>
                {attendees.length ? (
                  <span className="flex items-center gap-2">
                    <AssigneeStack people={attendees} size={26} max={5} />
                    <span className="text-[16px] text-app-strong">{attendees.length === 1 ? attendees[0].name : `${attendees.length} people`}</span>
                  </span>
                ) : (
                  <span className="text-[17px] text-neutral-500">Add attendees</span>
                )}
              </Row>
            )}
            <Row icon={CalendarDays} onClick={() => setSheet('dates')}>
              <span className={`text-[17px] ${summary ? 'text-app-strong' : 'text-neutral-500'}`}>{summary ?? 'Set dates'}</span>
            </Row>
            {!isTask && (
              <>
                <Row icon={MapPin}>
                  <LocationAutocompleteInput
                    value={location}
                    onChange={setLocation}
                    placeholder="Add a location"
                    className="w-full bg-transparent text-[17px] text-app-strong placeholder:text-neutral-500 focus:outline-none py-2"
                  />
                </Row>
                <Row icon={Layers} onClick={() => setSheet('space')}>
                  <span className={`text-[17px] ${eventSpace ? 'text-app-strong' : 'text-neutral-500'}`}>{eventSpace ? eventSpace.name : 'Space (for color)'}</span>
                </Row>
                <Row icon={Palette}>
                  <div className="py-2">
                    <ColorSwatchPicker value={color} onChange={setColor} choices={EVENT_COLOR_CHOICES} size="md" />
                  </div>
                </Row>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-neutral-800 mt-3 shrink-0">
          <span className="flex-1 text-[12px] text-neutral-500">
            {isTask && !listId ? 'Choose a list to create it in' : !title.trim() ? 'Give it a name' : !isTask && !start ? 'Pick a date' : ''}
          </span>
          <button
            onClick={create}
            disabled={!canCreate}
            className="h-11 px-6 rounded-2xl bg-app-strong text-neutral-900 text-[15px] font-semibold disabled:bg-neutral-800 disabled:text-neutral-500 cursor-pointer"
          >
            Create
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {sheet === 'dates' && (
          <DateSheet
            start={start}
            end={isTask ? taskDue : end}
            endName={isTask ? 'Due' : 'End'}
            onClose={() => setSheet(null)}
            onSave={(s, e) => {
              setStart(s);
              if (isTask) setTaskDue(e);
              else setEnd(e ?? s);
              setSheet(null);
            }}
          />
        )}
        {sheet === 'list' && (
          <PickSheet title="Create in" onClose={() => setSheet(null)}>
            {spaces.map((sp) => (
              <div key={sp.id} className="pb-2">
                <p className="px-2 pt-2 pb-1 text-[12px] font-semibold uppercase tracking-wider text-neutral-500">{sp.name}</p>
                {sp.lists
                  .filter((l) => !l.archived && !l.docId)
                  .map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setSpaceId(sp.id);
                        setListId(l.id);
                        setSheet(null);
                      }}
                      className="w-full flex items-center gap-3 px-2 h-12 rounded-xl text-left active:bg-neutral-800 cursor-pointer"
                    >
                      <ListChecks className="w-5 h-5 text-neutral-500 shrink-0" />
                      <span className="flex-1 text-[16px] text-app-strong truncate">{l.name}</span>
                      {l.id === listId && <Check className="w-5 h-5 text-blue-500" />}
                    </button>
                  ))}
              </div>
            ))}
          </PickSheet>
        )}
        {sheet === 'space' && (
          <PickSheet title="Space" onClose={() => setSheet(null)}>
            {[{ id: '', name: 'No space' }, ...spaces].map((sp) => (
              <button
                key={sp.id || 'none'}
                onClick={() => {
                  setEventSpaceId(sp.id);
                  setSheet(null);
                }}
                className="w-full flex items-center gap-3 px-2 h-12 rounded-xl text-left active:bg-neutral-800 cursor-pointer"
              >
                <Layers className="w-5 h-5 text-neutral-500 shrink-0" />
                <span className="flex-1 text-[16px] text-app-strong truncate">{sp.name}</span>
                {sp.id === eventSpaceId && <Check className="w-5 h-5 text-blue-500" />}
              </button>
            ))}
          </PickSheet>
        )}
        {sheet === 'people' && (
          <PickSheet title="Attendees" onClose={() => setSheet(null)}>
            <AssigneePicker
              heading="Attendees"
              people={pickableMembers(workspaces, users, activeWorkspaceId)}
              selectedIds={assigneeIds}
              suggestedIds={suggestEventAttendees(useTaskStore.getState().events, activeWorkspaceId)}
              onToggle={(uid) => setAssigneeIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))}
              currentUserId={currentUserId}
              autoFocus={false}
            />
          </PickSheet>
        )}
      </AnimatePresence>
    </div>
  );
}
