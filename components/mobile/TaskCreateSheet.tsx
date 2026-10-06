'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarDays, UserCircle, ChevronDown, Check, ListChecks } from 'lucide-react';
import { useTaskStore, type StatusDef } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';
import {
  currentVisibleBox,
  keyboardResizesPage,
  liveOverlayStyle,
  overlayStyle,
  useVisibleViewport,
  type VisibleBox,
} from '../../hooks/useVisibleViewport';
import { useBackLayer } from '../../hooks/useBackLayer';
import { pickableMembers, taskAudience, workspaceIdForList } from '../../lib/workspaceMembers';
import { suggestTaskAssignees } from '../../lib/assigneeSuggestions';
import AssigneePicker, { AssigneeStack } from '../AssigneePicker';
import DateSheet from './DateSheet';
import { PickSheet, Row } from './MobileQuickCreateSheet';
import { useSheetDrag } from './sheetDrag';
import SheetLayer from './SheetLayer';
import { traceMoment } from '../../lib/perfTrace';
import { hideKeyboardInstantly } from '../../lib/keyboard';

// "Add Task" in a List, on a phone: a card that rises from the bottom over the dimmed list, laid out
// after ClickUp's (the user's screenshot of theirs beside one of ours: "Kan vi få et sånt kort istedet
// når vi trykker ny task?"). Which List it goes in at the top, the name large, a description, then
// assignees and dates as rows, and along the bottom the status and Create. It replaced a one-line
// composer docked on the keyboard, which worked but left almost no air between it and the last card.
//
// Sits on the keyboard (placed against the visual viewport). Pull it down, tap outside, ✕ or Back to
// cancel. Create closes it, and the new card materialises in the list behind (TaskMaterialize).

export type NewTaskInput = {
  title: string;
  description: string | null;
  spaceId: string;
  listId: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  assigneeIds: string[];
};

const FALLBACK_STATUSES: StatusDef[] = [
  { id: 'default-todo', name: 'To Do', color: '#8d97a5', order: 0 },
  { id: 'default-progress', name: 'In Progress', color: '#618cd1', order: 1 },
  { id: 'default-review', name: 'Review', color: '#9a61d1', order: 2 },
  { id: 'default-done', name: 'Done', color: '#349f7c', order: 3 },
];

const shortDates = (start: string | null, due: string | null) => {
  const f = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (start && due && start !== due) return `${f(start)} → ${f(due)}`;
  if (start) return f(start);
  if (due) return `Due ${f(due)}`;
  return null;
};

export default function TaskCreateSheet({
  defaultListId,
  onCreate,
  onClose,
}: {
  defaultListId: string | null;
  onCreate: (task: NewTaskInput) => void;
  onClose: () => void;
}) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const users = useTaskStore((s) => s.users);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const visible = useVisibleViewport();
  // Closing lets go of the keyboard at once. The title kept the focus while the card animated away, so
  // the keyboard only started down after it — the keyboard's top strip "henger litt før den spretter
  // ned".
  const close = () => {
    // Temporary: measure the first few closings (lib/perfTrace.ts) — the keyboard's top bar was seen
    // left behind after it.
    traceMoment('task-sheet-close', { card: '[data-trace="task-card"]' }, 1600);
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };
  const drag = useSheetDrag(close);

  const spaces = useMemo(() => workspaces.flatMap((w) => w.spaces).filter((s) => !s.archived), [workspaces]);
  const [listId, setListId] = useState<string | null>(defaultListId);
  const space = spaces.find((s) => s.lists.some((l) => l.id === listId));
  const list = space?.lists.find((l) => l.id === listId);
  const statuses = space?.statuses?.length ? [...space.statuses].sort((a, b) => a.order - b.order) : FALLBACK_STATUSES;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusName, setStatusName] = useState<string | null>(null);
  const status = statuses.find((s) => s.name === statusName) ?? statuses[0];
  const [start, setStart] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'list' | 'people' | 'dates' | 'status' | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // The keyboard keeps its place through Assignees: "når jeg trykker meg inn på assignees så 'hopper
  // den ned'". Opening it no longer takes focus off the title (the row cancels the press's default),
  // the picker's search field takes it over as it opens, and closing hands it back to the title — so
  // the keyboard never goes away and nothing jumps. Focus moves between fields during the tap itself,
  // which is what lets a phone keep its keyboard up.
  const keepFocus = { onMouseDown: (e: React.MouseEvent) => e.preventDefault(), onPointerDown: (e: React.PointerEvent) => e.preventDefault() };
  // The title takes the focus as the card opens — without asking the browser to scroll it into view
  // (autoFocus would), which is one of the ways the page behind used to get pushed up. In a layout
  // effect, so it still happens inside the tap that opened the card, which is what lets iOS raise the
  // keyboard for it.
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    // Temporary: measure the first few openings on a phone (lib/perfTrace.ts).
    traceMoment('task-sheet', { card: '[data-trace="task-card"]', shell: '.siqt-app-shell' });
  }, []);

  // The card holds still while a picker is open over it. The pickers without a text field (dates,
  // status, List) let the keyboard go down — the calendar needs the room — and the card used to follow
  // it down mid-way through the calendar's entrance ("pagen bak hopper ned før animasjonen inn fra
  // kalenderen er ferdig"). Now the card keeps the place it had when the picker opened. Closing any
  // picker hands the focus back to the title in the same tap, so the keyboard comes back up under a
  // card that never moved, and only once the keyboard is back does the card follow the live box again
  // (or after a moment, if it does not come back).
  //
  // Every picker now opens with the keyboard still up — dates, status and List as well as Assignees:
  // "droppe å ta ned tastaturet når vi trykker på 'Set Dates', at den bare sklir opp, som 'Add
  // Assignees'". The rows and buttons that open them leave the focus in the title (keepFocus), and the
  // pickers themselves take none (their keepKeyboard), so the keyboard never moves. The hold above is
  // kept for the rare case where it goes anyway.
  const [frozen, setFrozen] = useState<VisibleBox | null>(null);
  const [released, setReleased] = useState(true);
  const openSheet = (which: NonNullable<typeof sheet>) => {
    setFrozen(currentVisibleBox());
    setReleased(false);
    setSheet(which);
  };
  // Except the calendar, which needs more room than the keyboard leaves: "Kalenderen må over
  // tastaturet". In the Android app the keyboard is put away in a single frame (no slide) and the
  // calendar rises in its place, laid out on the full height, while the card holds still — the calendar
  // appears to come up over the keyboard. Elsewhere the keyboard cannot be dismissed without its slide,
  // so the calendar opens above it like the other pickers.
  const [datesOverKeyboard, setDatesOverKeyboard] = useState(false);
  const openDates = async () => {
    setFrozen(currentVisibleBox());
    setReleased(false);
    const hidden = keyboardResizesPage && (await hideKeyboardInstantly());
    if (hidden) titleRef.current?.blur();
    setDatesOverKeyboard(hidden);
    setSheet('dates');
  };
  const closeSheet = () => {
    titleRef.current?.focus({ preventScroll: true });
    setSheet(null);
  };
  // Let go of the held place once the keyboard is back up (the visible height down to the held one),
  // or after a moment if it does not come back. Read from the viewport on each frame rather than from
  // React state, which in the Android app is not tracked at all (see useVisibleViewport).
  useEffect(() => {
    if (sheet !== null || released || !frozen) return;
    const started = performance.now();
    let raf = 0;
    const check = () => {
      const h = currentVisibleBox()?.height ?? 0;
      if (h <= frozen.height + 2 || performance.now() - started > 700) {
        setReleased(true);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [sheet, released, frozen]);
  const holdAt = !released && frozen ? frozen : null;

  // Back closes whatever is on top: a picker first, then this card.
  useBackLayer(true, close);
  useBackLayer(sheet !== null, closeSheet);

  // The people who will be able to open a task in this List — the same rule a task's own picker uses.
  const people = useMemo(() => {
    if (!listId) return [];
    const members = pickableMembers(workspaces, users, workspaceIdForList(workspaces, listId));
    const audience = taskAudience(workspaces, { listId, isPrivate: false, accessJson: '[]' });
    return audience ? members.filter((u) => audience.has(u.id)) : members;
  }, [workspaces, users, listId]);
  const chosen = users.filter((u) => assigneeIds.includes(u.id));

  const canCreate = !!title.trim() && !!list && !!space;
  const create = () => {
    if (!canCreate) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || null,
      spaceId: space!.id,
      listId: list!.id,
      status: status.name,
      startDate: start,
      dueDate: due,
      assigneeIds,
    });
    close();
  };
  const dates = shortDates(start, due);

  return (
    <SheetLayer z={80} dim={0.6} style={holdAt ? overlayStyle(holdAt) : liveOverlayStyle(visible)} onClose={close}>
      <motion.div
        // In the Android app the keyboard carries the card up — the page's bottom edge rises with it,
        // frame by frame — so the card only fades in where it is and rides along: one movement, tied to
        // the keyboard. Its own slide from the bottom on top of that was two upward movements on two
        // different curves at once, which is what read as stutter and overshoot ("stuttrer … hopper
        // noen gang litt for langt opp og så ned igjen"). Elsewhere the keyboard does not move the page,
        // so the card slides up itself.
        initial={keyboardResizesPage ? { opacity: 0, y: 14 } : { y: '100%' }}
        animate={keyboardResizesPage ? { opacity: 1, y: 0 } : { y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        data-trace="task-card"
        className="relative bg-neutral-900 rounded-t-[28px] max-h-full min-h-0 flex flex-col shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.5)]"
      >
        <div {...drag.handleProps} className="shrink-0">
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="w-10 h-1 rounded-full bg-neutral-700" />
          </div>
          <div className="flex items-center gap-3 px-5 pt-2">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openSheet('list')}
              className="min-w-0 flex items-center gap-1 text-[15px] text-neutral-500 cursor-pointer"
            >
              In <span className="font-semibold text-app-strong truncate">{list ? list.name : 'Choose a list'}</span>
              <ChevronDown className="w-4 h-4 shrink-0" />
            </button>
            <span className="flex-1" />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={close}
              aria-label="Close"
              className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 pt-3">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            enterKeyHint="done"
            placeholder="Untitled task"
            className="w-full bg-transparent text-[28px] font-semibold text-app-strong placeholder:text-neutral-600 focus:outline-none py-1"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={1}
            placeholder="Tap to add a description…"
            // Grows with what is typed, up to a point, rather than scrolling inside a one-line box.
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            className="w-full bg-transparent text-[16px] text-neutral-300 placeholder:text-neutral-500 focus:outline-none resize-none py-2"
          />
          <div className="mt-1">
            <div {...keepFocus}>
            <Row icon={UserCircle} onClick={() => openSheet('people')}>
              {chosen.length ? (
                <span className="flex items-center gap-2">
                  <AssigneeStack people={chosen} size={26} max={5} />
                  <span className="text-[16px] text-app-strong">{chosen.length === 1 ? chosen[0].name : `${chosen.length} people`}</span>
                </span>
              ) : (
                <span className="text-[17px] text-neutral-500">Add assignees</span>
              )}
            </Row>
            </div>
            <div {...keepFocus}>
            <Row icon={CalendarDays} onClick={() => void openDates()}>
              <span className={`text-[17px] ${dates ? 'text-app-strong' : 'text-neutral-500'}`}>{dates ?? 'Set dates'}</span>
            </Row>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-neutral-800 mt-2 shrink-0">
          <button
            {...keepFocus}
            onClick={() => openSheet('status')}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full bg-neutral-800/80 cursor-pointer active:scale-95 transition-transform"
          >
            <span className="w-4 h-4 rounded-full border-2 border-dashed" style={{ borderColor: status.color }} />
            <span className="text-[13px] font-bold uppercase tracking-wide" style={{ color: status.color }}>
              {status.name}
            </span>
          </button>
          <span className="flex-1" />
          <button
            onClick={create}
            disabled={!canCreate}
            className="h-11 px-6 rounded-full bg-blue-500 text-white text-[15px] font-semibold shadow-[0_6px_18px_-6px_rgb(59_130_246/0.8)] disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none cursor-pointer active:scale-95 transition-transform"
          >
            Create
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {sheet === 'dates' && (
          <DateSheet
            keepKeyboard={!datesOverKeyboard}
            start={start}
            end={due}
            endName="Due"
            onClose={closeSheet}
            onSave={(s, e) => {
              setStart(s);
              setDue(e);
              closeSheet();
            }}
          />
        )}
        {sheet === 'list' && (
          <PickSheet title="Create in" keepKeyboard onClose={closeSheet}>
            {spaces.map((sp) => {
              const lists = sp.lists.filter((l) => !l.archived && !l.docId);
              if (lists.length === 0) return null;
              return (
                <div key={sp.id} className="pb-2">
                  <p className="px-2 pt-2 pb-1 text-[12px] font-semibold uppercase tracking-wider text-neutral-500">{sp.name}</p>
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setListId(l.id);
                        // A status of the old List's Space may not exist in the new one.
                        setStatusName(null);
                        closeSheet();
                      }}
                      className="w-full flex items-center gap-3 px-2 h-12 rounded-xl text-left active:bg-neutral-800 cursor-pointer"
                    >
                      <ListChecks className="w-5 h-5 text-neutral-500 shrink-0" />
                      <span className="flex-1 text-[16px] text-app-strong truncate">{l.name}</span>
                      {l.id === listId && <Check className="w-5 h-5 text-blue-500" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </PickSheet>
        )}
        {sheet === 'status' && (
          <PickSheet title="Status" keepKeyboard onClose={closeSheet}>
            {statuses.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setStatusName(s.name);
                  closeSheet();
                }}
                className="w-full flex items-center gap-3 px-2 h-12 rounded-xl text-left active:bg-neutral-800 cursor-pointer"
              >
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-[16px] text-app-strong truncate">{s.name}</span>
                {s.name === status.name && <Check className="w-5 h-5 text-blue-500" />}
              </button>
            ))}
          </PickSheet>
        )}
        {sheet === 'people' && (
          <PickSheet title="Assignees" onClose={closeSheet}>
            <AssigneePicker
              heading="Assignees"
              people={people}
              selectedIds={assigneeIds}
              suggestedIds={listId ? suggestTaskAssignees(useTaskStore.getState().tasks, listId) : []}
              onToggle={(uid) => setAssigneeIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))}
              currentUserId={currentUserId}
              autoFocus
            />
          </PickSheet>
        )}
      </AnimatePresence>
    </SheetLayer>
  );
}
