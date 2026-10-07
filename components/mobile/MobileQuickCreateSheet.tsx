'use client';

import SheetLayer from './SheetLayer';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fullViewportBox, liveOverlayStyle, overlayStyle, useVisibleViewport } from '../../hooks/useVisibleViewport';
import { X, CalendarDays, MapPin, Palette, Layers, UserCircle, ChevronDown, Check, ListChecks, Lock } from 'lucide-react';
import { homeLabel, workspaceColor } from '../../lib/whereIs';
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
// `noKeyboard`: the picker has no text field, so the keyboard goes as it opens — laid out on the full
// height rather than the visible box (see fullViewportBox), so it is not dragged down as the page grows.
export function PickSheet({
  title,
  onClose,
  children,
  noKeyboard = false,
  keepKeyboard = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  noKeyboard?: boolean;
  // A picker of plain choices opened over a field that keeps its keyboard: taps in it leave the focus
  // where it is, so the keyboard stays (see DateSheet's). Not for a picker with its own text field.
  keepKeyboard?: boolean;
}) {
  const drag = useSheetDrag(onClose);
  const visible = useVisibleViewport();
  return (
    <SheetLayer z={90} dim={0.5} style={noKeyboard ? overlayStyle(fullViewportBox()) : liveOverlayStyle(visible)} onClose={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={noKeyboard ? { type: 'spring', stiffness: 290, damping: 34 } : { type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDownCapture={keepKeyboard ? (e) => e.preventDefault() : undefined}
        {...drag.sheetProps}
        className="relative bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col pb-[calc(env(safe-area-inset-bottom)+12px)]"
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
    </SheetLayer>
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
  // Where the event belongs — workspace (who sees it, who can attend) and optionally a Space. Starts in
  // the workspace you are in, and shows it (it used to be that workspace silently).
  const [eventHome, setEventHome] = useState<{ workspaceId: string; spaceId: string | null }>({ workspaceId: activeWorkspaceId ?? '', spaceId: null });
  const [location, setLocation] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const [sheet, setSheet] = useState<'dates' | 'list' | 'people' | 'space' | null>(null);
  const drag = useSheetDrag(onClose);

  // Not archived Spaces: new work does not go into one that has been put away.
  const spaces = useMemo(() => workspaces.flatMap((w) => w.spaces).filter((s) => !s.archived), [workspaces]);
  const list = spaces.flatMap((s) => s.lists).find((l) => l.id === listId);
  const homeWs = workspaces.find((w) => w.id === eventHome.workspaceId);
  const homeSpace = eventHome.spaceId ? homeWs?.spaces.find((s) => s.id === eventHome.spaceId) : undefined;
  const attendees = users.filter((u) => assigneeIds.includes(u.id));

  const isTask = tab === 'task';
  const canCreate = isTask ? !!title.trim() && !!listId : !!title.trim() && !!start && !!eventHome.workspaceId;

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
        spaceId: eventHome.spaceId,
        workspaceId: eventHome.workspaceId,
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
    <SheetLayer z={80} dim={0.6} style={liveOverlayStyle(visible)} onClose={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        className="relative bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col"
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
                <Row icon={homeWs?.isPersonal ? Lock : Layers} onClick={() => setSheet('space')}>
                  <span className="text-[17px] text-app-strong truncate">
                    {homeLabel({ workspace: homeWs, space: homeSpace, personal: !!homeWs?.isPersonal })}
                    {homeWs?.isPersonal && <span className="text-neutral-500"> — only you</span>}
                  </span>
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
          <PickSheet title="Create in" noKeyboard onClose={() => setSheet(null)}>
            {spaces.map((sp, i) => (
              <div key={sp.id} className="pb-2">
                {/* The workspace once, above its first Space — where the task will live, and who sees it. */}
                {(() => {
                  const ws = workspaces.find((w) => w.spaces.some((x) => x.id === sp.id));
                  const prev = i > 0 ? workspaces.find((w) => w.spaces.some((x) => x.id === spaces[i - 1].id)) : undefined;
                  return ws && ws.id !== prev?.id ? (
                    <p className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[13px] font-semibold text-app-strong">
                      {ws.isPersonal && <Lock className="w-3.5 h-3.5 text-amber-400" />}
                      {ws.isPersonal ? 'Private — only you' : ws.name}
                    </p>
                  ) : null;
                })()}
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
          <PickSheet title="Belongs to" noKeyboard onClose={() => setSheet(null)}>
            {[...workspaces]
              .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal))
              .map((w) => {
                const pick = (spaceId: string | null) => {
                  // Attendees come from the event's workspace — anyone not in the new one comes off.
                  setAssigneeIds((ids) => ids.filter((id) => w.members.some((m) => m.id === id)));
                  setEventHome({ workspaceId: w.id, spaceId });
                  setSheet(null);
                };
                return (
                  <div key={w.id} className="pb-2 mb-1 border-b border-neutral-800/70 last:border-b-0">
                    <button onClick={() => pick(null)} className="w-full flex items-center gap-3 px-2 h-12 rounded-xl text-left active:bg-neutral-800 cursor-pointer">
                      {w.isPersonal ? (
                        <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center shrink-0">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: workspaceColor(w) }} />
                        </span>
                      )}
                      <span className="flex-1 text-[16px] font-semibold text-app-strong truncate">{w.isPersonal ? 'Private' : w.name}</span>
                      <span className="text-[12px] text-neutral-500">{w.isPersonal ? 'only you' : 'no Space'}</span>
                      {eventHome.workspaceId === w.id && !eventHome.spaceId && <Check className="w-5 h-5 text-blue-500" />}
                    </button>
                    {w.spaces
                      .filter((sp) => !sp.archived)
                      .map((sp) => (
                        <button
                          key={sp.id}
                          onClick={() => pick(sp.id)}
                          className="w-full flex items-center gap-3 pl-10 pr-2 h-11 rounded-xl text-left active:bg-neutral-800 cursor-pointer"
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sp.color || '#6b7280' }} />
                          <span className="flex-1 text-[15px] text-neutral-200 truncate">{sp.name}</span>
                          {sp.id === eventHome.spaceId && <Check className="w-5 h-5 text-blue-500" />}
                        </button>
                      ))}
                  </div>
                );
              })}
          </PickSheet>
        )}
        {sheet === 'people' && (
          <PickSheet title="Attendees" onClose={() => setSheet(null)}>
            <AssigneePicker
              heading="Attendees"
              people={pickableMembers(workspaces, users, eventHome.workspaceId)}
              selectedIds={assigneeIds}
              suggestedIds={suggestEventAttendees(useTaskStore.getState().events, eventHome.workspaceId)}
              onToggle={(uid) => setAssigneeIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))}
              currentUserId={currentUserId}
              autoFocus={false}
            />
          </PickSheet>
        )}
      </AnimatePresence>
    </SheetLayer>
  );
}
