'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Pencil, RefreshCw, MoreHorizontal, GripVertical, Calendar, ListTree } from 'lucide-react';
import { useTaskStore, StatusDef, CustomFieldDef, Task } from '../store/useTaskStore';
import { useIsMobile } from '../hooks/useIsMobile';
import Caret from './Caret';
import { isDoneStatus } from '../lib/taskDoneDust';
import StatusCircle from './StatusCircle';
import TaskMaterialize from './TaskMaterialize';
import { taskPickableMembers } from '../lib/workspaceMembers';
import AssigneePicker, { AssigneeStack } from './AssigneePicker';
import { suggestTaskAssignees } from '../lib/assigneeSuggestions';
import { useSessionStore } from '../store/useSessionStore';
import { useLongPress } from '../hooks/useLongPress';
import DatePickerPopover from './DatePickerPopover';
import FloatingPopover from './FloatingPopover';
import { startDateColor, dueDateColor, DATE_BADGE_COLOR_HEX, startDateTooltip, dueDateTooltip, customDateColor, customDateTooltip } from '../lib/dateBadgeColor';

export type ColumnDef = {
  key: string;
  label: string;
  kind: 'status' | 'assignee' | 'startDate' | 'dueDate' | 'custom';
  field?: CustomFieldDef;
};

type TaskRowProps = {
  task: Task;
  onOpen: () => void;
  columns: ColumnDef[];
  gridTemplate: string;
  statuses: StatusDef[];
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  autoFocusRename?: boolean;
  onRenameHandled?: () => void;
  animateEntrance?: boolean;
  navScope: string;
  // 'above' | 'below' while a task is being dragged near this row's top or bottom edge — the line
  // is what distinguishes "this will reorder" from "this will nest as a subtask", which is
  // otherwise the same gesture on the same target.
  dropIndicator?: 'above' | 'below' | null;
  // Subtasks shown in place, ClickUp-style (desktop List view): how deep this row sits under the
  // List's own tasks, how many open subtasks it has, and whether they are showing. A row with
  // subtasks gets an arrow before its title and a count after it; either one toggles them.
  depth?: number;
  subtaskCount?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  // Set for a moment right after this task was created here: it arrives with TaskMaterialize's
  // gathering-dust frame, and the card fades and sharpens in inside it (.siqt-mat-card).
  materialize?: boolean;
};

function TaskRowImpl({
  task,
  onOpen,
  columns,
  gridTemplate,
  statuses,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  onContextMenu,
  autoFocusRename = false,
  onRenameHandled,
  animateEntrance = true,
  navScope,
  dropIndicator,
  depth = 0,
  subtaskCount = 0,
  expanded = false,
  onToggleExpand,
  materialize = false,
}: TaskRowProps) {
  const {
    users,
    workspaces,
    optimisticMoveTask,
    optimisticSetAssignees,
    optimisticSetCustomFieldValue,
    optimisticSetDates,
    optimisticSetTitle,
  } = useTaskStore();

  const isMobile = useIsMobile();
  const currentUserId = useSessionStore((s) => s.currentUserId);
  // Only the members of the workspace this task lives in who can open it — see lib/workspaceMembers.ts.
  const assigneeChoices = taskPickableMembers(workspaces, users, task, task.assignees.map((a) => a.id));

  const [statusOpen, setStatusOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) optimisticSetTitle(task.id, trimmed);
    else setTitleDraft(task.title);
  };

  const startRename = () => {
    setTitleDraft(task.title);
    setEditingTitle(true);
  };

  useEffect(() => {
    if (autoFocusRename) {
      startRename();
      onRenameHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusRename]);

  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({ id: task.id });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `task:${task.id}` });
  const setNodeRef = (node: HTMLElement | null) => {
    setDraggableRef(node);
    setDroppableRef(node);
  };

  // This task's own Space's statuses (the row may be showing in My Tasks or Everything, among others'),
  // for the circle's menu and for what counts as done. The defaults where a Space has none of its own.
  // Store references, so a row only re-renders when its Space's statuses change.
  const spaceStatuses = useTaskStore((st) => spaceOfList(st.workspaces, task.listId)?.statuses);
  const ownStatuses = spaceStatuses && spaceStatuses.length > 0 ? spaceStatuses : DEFAULT_ROW_STATUSES;
  const strikeDone = useTaskStore((st) => !!spaceOfList(st.workspaces, task.listId)?.strikeDone);
  const spaceId = useTaskStore((st) => spaceOfList(st.workspaces, task.listId)?.id ?? null);
  // Done = archived (closed), or in a done status. "Strike through gjennom hele oppgaven når den er
  // Complete eller Done" — a Space setting.
  const struck = strikeDone && (task.archived || isDoneStatus(task.status, ownStatuses));

  const statusColorOf = (name: string) => statuses.find((s) => s.name === name)?.color || '#94a3b8';

  const toggleAssignee = (userId: string) => {
    const current = task.assignees.map((a) => a.id);
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    optimisticSetAssignees(task.id, next);
  };

  const renderCustomFieldCell = (field: CustomFieldDef) => {
    const values = JSON.parse(task.customFieldValues || '{}');
    const value = values[field.id] ?? '';

    if (field.type === 'dropdown') {
      const opt = field.options.find((o) => o.label === value);
      return (
        <select
          value={value}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => optimisticSetCustomFieldValue(task.id, field.id, e.target.value)}
          className="text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer bg-neutral-900 text-neutral-300 border-neutral-700"
          style={opt ? { color: opt.color, borderColor: opt.color + '55', backgroundColor: opt.color + '20' } : {}}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.label} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    // Custom date fields use the same picker and badge as Start and Due, so every date in the table
    // looks and behaves alike. They used to be a native <input type="date">, whose calendar button
    // sits after its value — in a row of date columns that put each button up against the NEXT
    // column's date, and it was reported twice as "kalenderen følger feil column".
    //
    // Stored as LOCAL wall-clock text, never as a UTC ISO string: `YYYY-MM-DD` for a date (exactly
    // what the native input wrote and the ClickUp import brought in, so nothing needs migrating) and
    // `YYYY-MM-DDTHH:mm` once a time is added. Both parse as local time and both sort correctly as
    // plain strings, which a UTC string would not — local midnight here is the previous day in UTC.
    // A bare date gets `T00:00` before parsing because `new Date('2026-08-21')` is UTC midnight:
    // 02:00 in Norway (which the picker would show as a set time), and the 20th west of Greenwich.
    if (field.type === 'date') {
      const localValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value || null;
      return (
        <DatePickerPopover
          value={localValue}
          label={field.name}
          placeholder="---"
          // The same urgency colours as Start/Due, read through the field's own kind: a deadline
          // turns red once passed, an event turns green. Computed from `localValue`, never from the
          // raw stored text — see the T00:00 note above.
          badgeColorHex={(() => {
            const c = customDateColor(localValue, field.dateKind);
            return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
          })()}
          tooltip={customDateTooltip(localValue, field.dateKind)}
          onChange={(iso) => {
            if (!iso) return optimisticSetCustomFieldValue(task.id, field.id, '');
            const d = new Date(iso);
            const p2 = (n: number) => String(n).padStart(2, '0');
            const ymd = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
            const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
            optimisticSetCustomFieldValue(task.id, field.id, hasTime ? `${ymd}T${p2(d.getHours())}:${p2(d.getMinutes())}` : ymd);
          }}
        />
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        defaultValue={value}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => optimisticSetCustomFieldValue(task.id, field.id, e.target.value)}
        placeholder="—"
        className="w-full bg-transparent text-[11px] text-neutral-300 focus:outline-none focus:bg-neutral-900 rounded px-1 py-0.5"
      />
    );
  };

  // Shared between the desktop grid cell and the mobile expanded-row cell for the same column —
  // one FloatingPopover/DatePickerPopover instance per column per render (whichever layout is
  // actually mounted), not two competing instances of the same popover sharing state.
  const renderColumnCell = (col: ColumnDef) => {
    if (col.kind === 'status') {
      return (
        <FloatingPopover
          open={statusOpen}
          onClose={() => setStatusOpen(false)}
          panelClassName="w-40 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl p-1.5"
          anchor={
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStatusOpen((o) => !o);
              }}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer transition inline-flex items-center gap-1"
              style={{ color: statusColorOf(task.status), borderColor: statusColorOf(task.status) + '55', backgroundColor: statusColorOf(task.status) + '20' }}
            >
              {task.status} <RefreshCw className="w-2.5 h-2.5" />
            </button>
          }
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                optimisticMoveTask(task.id, s.name);
                setStatusOpen(false);
              }}
              className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
              {s.name}
            </button>
          ))}
        </FloatingPopover>
      );
    }

    if (col.kind === 'assignee') {
      return (
        <FloatingPopover
          open={assigneeOpen}
          onClose={() => setAssigneeOpen(false)}
          panelClassName={`${isMobile ? 'w-72' : 'w-64'} bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2`}
          anchor={
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAssigneeOpen((o) => !o);
              }}
              className="flex items-center cursor-pointer rounded-full hover:opacity-90 transition"
            >
              <AssigneeStack people={task.assignees} size={isMobile ? 24 : 22} />
            </button>
          }
        >
          <AssigneePicker
            people={assigneeChoices}
            selectedIds={task.assignees.map((a) => a.id)}
            // Read on open only (the picker freezes it), so the whole-list scan is not paid per row.
            suggestedIds={assigneeOpen ? suggestTaskAssignees(useTaskStore.getState().tasks, task.listId, task.id) : []}
            onToggle={toggleAssignee}
            currentUserId={currentUserId}
            autoFocus={!isMobile}
          />
        </FloatingPopover>
      );
    }

    if (col.kind === 'startDate') {
      return (
        <DatePickerPopover
          value={task.startDate}
          label="Start"
          placeholder="---"
          onChange={(iso) => optimisticSetDates(task.id, iso, task.dueDate ? new Date(task.dueDate).toISOString() : null)}
          badgeColorHex={(() => {
            const c = startDateColor(task.startDate, task.dueDate);
            return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
          })()}
          tooltip={startDateTooltip(task.startDate)}
        />
      );
    }

    if (col.kind === 'dueDate') {
      return (
        <DatePickerPopover
          value={task.dueDate}
          label="Due"
          placeholder="---"
          onChange={(iso) => optimisticSetDates(task.id, task.startDate ? new Date(task.startDate).toISOString() : null, iso)}
          badgeColorHex={(() => {
            const c = dueDateColor(task.dueDate);
            return c ? DATE_BADGE_COLOR_HEX[c] : undefined;
          })()}
          tooltip={dueDateTooltip(task.dueDate)}
        />
      );
    }

    if (col.kind === 'custom' && col.field) return renderCustomFieldCell(col.field);
    return null;
  };

  const selectCheckbox = selectable ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect?.();
      }}
      className={`rounded-xs border flex items-center justify-center cursor-pointer transition shrink-0 ${isMobile ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${
        isSelected
          ? 'bg-blue-500/20 border-blue-500/60 text-blue-400 opacity-100'
          : isMobile
            ? 'border-neutral-600 opacity-100'
            : 'border-neutral-600 opacity-0 group-hover:opacity-100'
      }`}
    >
      {isSelected && <Check className={isMobile ? 'w-3 h-3' : 'w-2.5 h-2.5'} />}
    </button>
  ) : (
    <div></div>
  );

  // The circle in front of the task: its status, and a menu of statuses on a tap (StatusCircle).
  const doneToggle = <StatusCircle task={task} statuses={ownStatuses} spaceId={spaceId} size={isMobile ? 'md' : 'sm'} />;

  // Mobile-only: press-and-hold the row to open the same context menu desktop gets from a
  // right-click (Open/Rename/Mark done/Delete) — there's no right-click equivalent on touch.
  const rowLongPress = useLongPress({
    onLongPress: (e) => onContextMenu?.(e, task),
    enabled: isMobile,
  });

  return (
    <motion.div
      layout
      layoutId={`task-${navScope}-${task.id}`}
      // A materialising task brings its own entrance (the card's CSS, under the dust), so the plain
      // slide-up is left out for it.
      initial={animateEntrance && !materialize ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)', y: -6 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative"
    >
      {materialize && <TaskMaterialize seed={task.id} radius={isMobile ? 16 : 8} />}
      {/* The gap IS the indication, and the line only names it.
          
          A 2px line between two rows that sit flush against each other asks you to aim at a seam —
          you had to be exactly right, and there was nothing to tell you when you were. Opening a
          real space instead means the two rows visibly move apart as you approach, which is the
          answer to "am I going between these" before you have to read anything. The line then just
          says which gap. */}
      {dropIndicator === 'above' && (
        <div className="h-7 -mb-1 flex items-center px-1" aria-hidden>
          <span className="h-1 w-full rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]" />
        </div>
      )}
      {isMobile ? (
        // ================= MOBILE ROW — a "card," not a table row: checkbox + title on top
        // (title wraps instead of truncating), status/assignee/dates/custom fields always visible
        // underneath as compact wrapped pills instead of hidden behind an expand/swipe gesture —
        // an expert design pass flagged the earlier accordion-behind-a-chevron approach as still
        // clumsy, and a permanently-visible metadata row is both simpler and matches how mobile
        // task apps (and the reference screenshots this was redesigned against) actually look.
        // Elevated surface with no border and a soft rounded-xl corner, rather than the
        // hairline-bordered/square-cornered "table row" look.
        //
        // bg-neutral-800/50, not bg-neutral-900: this card was originally bg-neutral-900 to sit
        // above the page's own darker background, and then the rounded-sheet pass gave the list
        // container it sits inside that exact same bg-neutral-900. The card stopped being a card —
        // identical fill, no border — leaving only whitespace between one task and the next.
        // Reported live: "de flyter over i hverandre nesten (på mobil altså)". One step of
        // contrast against the sheet restores the boundary without adding any chrome back.
        // Deliberately a translucent step rather than a hard colour, so it holds up in light mode
        // too, where the neutral scale is inverted (see globals.css) and this reads as one step
        // darker than the sheet instead of one step lighter — the same separation either way — the flat gap-based card spacing (app/page.tsx's list container) replaces
        // the old divide-y row separators. Grip (drag) and More (menu) live in the top-right
        // corner, always reachable without scrolling. Whole-row drag-and-drop is still scoped to
        // the dedicated grip handle (dnd-kit's own "drag handle" pattern), not the card itself, so
        // it can't race the card's own tap-to-open; `touchAction: 'none'` on the grip stops the
        // browser's native touch-scroll from competing with dnd-kit's pointer capture. No
        // TouchSensor needed — dnd-kit's PointerSensor (already registered as `taskSensors` in
        // app/page.tsx) already handles touch via the Pointer Events API. =================
        <div
          ref={setNodeRef}
          // Lets the drag code find this row under the pointer and measure it live — see
          // app/page.tsx's reorder-indicator effect for why a measured rect was not enough.
          data-task-row={task.id}
          // "Er den for flat? Eller er det fargene?" — the two are the same answer. The card was a
          // translucent grey rectangle on a grey sheet with no shadow (deliberately: in dark mode a
          // shadow on near-black is invisible work, see globals.css), no border, and nothing on it
          // that was not a shade of neutral. Every task looked like every other task, which is what
          // "kommunalt" is describing: not ugly, just administrative.
          //
          // Three changes, smallest first:
          //
          // - An inset hairline along the top edge. This is how a dark interface says "surface"
          //   without a border: a raised thing catches light on its upper edge. One pixel of white
          //   at 5% is enough, and it costs no layout. In light mode it does nothing and needs to do
          //   nothing — that theme separates by shadow instead (.elevated).
          // - Fill up from /50 to /60. The step against the sheet was doing all of the separating
          //   on its own, and it was a small step.
          // - A status-coloured rail down the left edge, which is the part that answers "fargene".
          //   The status pill already exists, but it sits in the metadata row among four other grey
          //   things, so it names the status without ever letting you scan for it. At the edge, in
          //   a fixed position on every card, the same information reads down the whole list at a
          //   glance — the thing ClickUp's list actually does that this one did not.
          //
          // 2026-10-04, "Kan vi få de selve kortene til å se litt mer magisk ut også? Penere … det
          // skal føles godt å se på dem": the surface became .siqt-task-card (globals.css) — a soft
          // top-to-bottom gradient, a lit top edge and a faint hairline all round, a shadow that
          // lifts it, a 16px corner, and a gentle press. The hard 3px rail became a rounded,
          // glowing stripe inset from the edge, with a faint wash of the status colour across the
          // top-left corner, so the colour reads as light on the card rather than paint on its edge.
          className={`siqt-task-card relative overflow-hidden rounded-2xl ${materialize ? 'siqt-mat-card' : ''} ${
            isSelected ? 'ring-1 ring-inset ring-blue-500/60' : ''
          } ${isOver ? 'ring-1 ring-inset ring-neutral-500' : ''} ${isDragging ? 'opacity-40' : ''}`}
        >
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(130% 90% at 0% 0%, ${statusColorOf(task.status)}1f, transparent 55%)` }}
          />
          <span
            aria-hidden
            className="absolute left-[5px] top-3.5 bottom-3.5 w-[3px] rounded-full"
            style={{ backgroundColor: statusColorOf(task.status), boxShadow: `0 0 10px 1px ${statusColorOf(task.status)}66` }}
          />
          <div className="absolute top-2 right-2 flex items-center gap-0.5 z-10">
            <span
              {...attributes}
              {...listeners}
              onPointerDown={(e) => {
                e.stopPropagation();
                listeners?.onPointerDown?.(e);
              }}
              onClick={(e) => e.stopPropagation()}
              title="Drag to move"
              // pan-y, not none. `none` told the browser this gesture is entirely ours — so a
              // finger that landed on the grip could never scroll the list, even though dnd-kit's
              // own delay+tolerance constraint had already decided the gesture was a swipe and
              // refused to start a drag. The grip is a small target in the corner of every card, so
              // on a long list it is easy to land on by accident, and the page simply stopped
              // moving. Reported as exactly that.
              //
              // With pan-y the browser keeps vertical swipes and scrolls normally; once a drag
              // actually starts, app/page.tsx blocks scrolling outright for its duration (see
              // blockDragScroll there). Same two-part fix as the Planner's hold-and-drag, and for
              // the same reason: touch-action is latched when the gesture begins, so it cannot be
              // changed once a drag is under way.
              style={{ touchAction: 'pan-y' }}
              // Visible enough to aim at. It was `text-neutral-600` with no background — a grey
              // glyph on a grey card, which is findable once you know it is there and invisible
              // until then. Reported as not being able to tell where the handle is. A filled pill
              // behind it says "this is a control", and the cursor change alone never says that on
              // a phone, where there is no cursor.
              className="shrink-0 text-neutral-400 cursor-grab active:cursor-grabbing p-1.5 rounded-lg bg-neutral-800/70 active:bg-neutral-700"
            >
              <GripVertical className="w-4 h-4" />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, task);
              }}
              title="More options"
              className="shrink-0 text-neutral-500 p-2 cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div
            onPointerDown={rowLongPress.onPointerDown}
            onPointerMove={rowLongPress.onPointerMove}
            onPointerUp={rowLongPress.onPointerUp}
            onPointerLeave={rowLongPress.onPointerLeave}
            onClick={() => {
              // Swallow the trailing click a long-press produces on release — it already did its
              // job (opened the context menu).
              if (rowLongPress.wasLongPress()) return;
              onOpen();
            }}
            className="flex items-start gap-3 px-4 pt-4 pb-2.5 pr-16 text-sm cursor-pointer"
          >
            {selectCheckbox}
            {doneToggle}
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle();
                    if (e.key === 'Escape') {
                      setTitleDraft(task.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full bg-neutral-950 border border-blue-500 rounded-lg px-2 py-1 text-neutral-100 focus:outline-none"
                />
              ) : (
                // No truncate — a long title wraps onto a second line instead of being cut off.
                // Renaming moved into the long-press context menu (already has "Rename") rather
                // than a permanently-visible pencil icon cluttering the title row.
                // Up a step in both size and weight. The title was the same 14px/medium as the
                // metadata under it, so the card had no first thing to read — every line arrived
                // with equal claim on the eye, which is most of what made the list feel like a
                // form. Type hierarchy is the cheapest possible fix for that and the one a flat
                // design most depends on.
                <span className={`text-[15px] font-semibold leading-snug break-words ${struck ? 'line-through text-neutral-500' : 'text-app-strong'}`}>{task.title}</span>
              )}
            </div>
          </div>
          {columns.length > 0 &&
            (() => {
              // Start/due render as one combined "19 Aug – 21 Aug" pill instead of two separate
              // wrap-eligible chips — as two independent flex-wrap items they could each land on
              // a different line depending on how the row wraps, reading as a confusing diagonal
              // pair instead of a single date range.
              const startCol = columns.find((c) => c.kind === 'startDate');
              const dueCol = columns.find((c) => c.kind === 'dueDate');
              const otherCols = columns.filter((c) => c.kind !== 'startDate' && c.kind !== 'dueDate');
              return (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-3.5 pl-[52px]" onClick={(e) => e.stopPropagation()}>
                  {(startCol || dueCol) && (
                    <div className="flex items-center gap-1 text-neutral-400 shrink-0">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {startCol && renderColumnCell(startCol)}
                      {startCol && dueCol && <span className="text-neutral-600">–</span>}
                      {dueCol && renderColumnCell(dueCol)}
                    </div>
                  )}
                  {otherCols.map((col) => (
                    <div key={col.key} className="flex items-center gap-1 text-neutral-400">
                      {renderColumnCell(col)}
                    </div>
                  ))}
                </div>
              );
            })()}
        </div>
      ) : (
        // ================= DESKTOP ROW =================
        <div
          ref={setNodeRef}
          data-task-row={task.id}
          {...attributes}
          {...listeners}
          // A drag must not start from something you are typing in.
          //
          // The whole desktop row is the drag handle, which is right for grabbing a task and wrong
          // the moment the row contains a field: selecting part of a title by dragging across it
          // started dragging the task instead, so the text could not be selected at all. Reported
          // exactly that way.
          //
          // Checked on the event's target rather than by excluding a region, because the row's
          // editable parts move around — title, dates, custom fields — and a list of coordinates
          // would go stale the next time a column is added.
          onPointerDownCapture={(e) => {
            const el = e.target as HTMLElement | null;
            if (el?.closest('input, textarea, select, [contenteditable="true"]')) e.stopPropagation();
          }}
          onClick={onOpen}
          onContextMenu={(e) => onContextMenu?.(e, task)}
          // A touch lower than it was (py-1.5, from 2.5): "taskene på desktop skal være litt smalere
          // vertikalt, som clickup sin". `relative` for the drag grip, which sits in the left padding.
          className={`relative grid items-center px-4 py-1.5 text-xs hover:bg-neutral-800/50 transition-colors duration-150 cursor-pointer group ${
            materialize ? 'siqt-mat-card' : ''
          } ${
            isOver ? 'bg-neutral-700/40 ring-1 ring-inset ring-neutral-500' : ''
          } ${isDragging ? 'opacity-40' : ''} ${isSelected ? 'bg-neutral-700/30' : ''}`}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {/* A cell, always — even when there is no checkbox to put in it.
              
              selectCheckbox is null when the row is not selectable, and a null child of a grid is
              not an empty cell, it is no cell at all: every column after it slides one place left
              while the header above stays put. That is what happened to the subtask table inside an
              open task, which renders TaskRow without `selectable` — the cell under the "Due date"
              heading was really the column to its left, so the calendar you opened there wrote to
              the wrong field. Reported as "kalenderknappen ... er kobla på feil column ... selv om
              den gir dato til den columnen til venstre", and worst with several custom date fields
              in a row, where there is nothing about the values themselves to give the shift away.
              
              Structural rather than conditional, so no future caller can shift the grid by leaving
              a prop out. */}
          {/* The drag grip, at the far left in the row's own padding, invisible until the row is hovered —
              ClickUp's way ("drag task-knappen er usynlig som select-knappen, HELT til venstre, inntil
              vi hovrer over"). The whole row drags, as before; this only shows that it does. */}
          <span
            title="Drag to reorder"
            aria-hidden
            className="absolute left-0.5 top-1/2 -translate-y-1/2 text-neutral-500 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <div className="flex items-center">{selectCheckbox}</div>

          {/* Select box, then the arrow, then the done circle and the title — ClickUp's order. The arrow
              between them keeps choosing (the box) and finishing (the circle) apart; they used to sit
              side by side. Arrow and circle live in the name cell so a subtask's indent moves them
              with its title. */}
          <div className="min-w-0 font-medium flex items-center gap-1.5 pr-4 text-neutral-200" style={depth ? { paddingLeft: depth * 22 } : undefined}>
            {onToggleExpand && (
              // Always a slot, arrow or not, so titles line up whether or not a task has subtasks. The
              // button is 24px square — the arrow itself is small, the target is not ("litt vanskelig å
              // treffe") — and inside its slot, with no negative margin, so its hover square is never
              // cut off at the cell's edge ("pil-boksen er kroppa litt, når du hovrer over").
              <span className="shrink-0 w-6 h-6 flex items-center justify-center">
                {subtaskCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand();
                    }}
                    title={expanded ? 'Hide subtasks' : 'Show subtasks'}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-neutral-500 hover:text-neutral-100 hover:bg-neutral-700/50 cursor-pointer transition-colors"
                  >
                    <Caret open={expanded} />
                  </button>
                )}
              </span>
            )}
            {doneToggle}
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') {
                    setTitleDraft(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="w-full bg-neutral-900 border border-blue-500 rounded-lg px-1.5 py-0.5 text-neutral-100 focus:outline-none"
              />
            ) : (
              <>
                <span
                  className={`min-w-0 truncate hover:underline ${struck ? 'line-through text-neutral-500' : ''}`}
                  title="Double-click to rename"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename();
                  }}
                >
                  {task.title}
                </span>
                {subtaskCount > 0 && onToggleExpand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand();
                    }}
                    title={`${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'}`}
                    className={`shrink-0 flex items-center gap-1 px-1.5 h-5 rounded-md text-[10px] font-medium cursor-pointer transition-colors ${
                      expanded ? 'bg-blue-500/15 text-blue-400' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <ListTree className="w-3 h-3" />
                    {subtaskCount}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename();
                  }}
                  title="Rename"
                  // A 12px glyph with no padding is a 12px target. It only appears on hover, so it
                  // is aimed at rather than stumbled onto, which makes the size the whole
                  // interaction. The icon stays small; the hit area does not.
                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded shrink-0 cursor-pointer w-6 h-6 flex items-center justify-center -my-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {columns.map((col) => (
            <div key={col.key} className="flex justify-center text-neutral-400 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
              {renderColumnCell(col)}
            </div>
          ))}

          <div className="flex justify-end">
            <button
              onClick={(e) => onContextMenu?.(e, task)}
              title="More options"
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 p-1 rounded transition cursor-pointer"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {dropIndicator === 'below' && (
        <div className="h-7 -mt-1 flex items-center px-1" aria-hidden>
          <span className="h-1 w-full rounded-full bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]" />
        </div>
      )}
    </motion.div>
  );
}

const DEFAULT_ROW_STATUSES: StatusDef[] = [
  { id: 'default-todo', name: 'To Do', color: '#8d97a5', order: 0 },
  { id: 'default-progress', name: 'In Progress', color: '#618cd1', order: 1 },
  { id: 'default-review', name: 'Review', color: '#9a61d1', order: 2 },
  { id: 'default-done', name: 'Done', color: '#349f7c', order: 3, isDone: true },
];

// The Space a List belongs to, for the row's statuses and done rules.
function spaceOfList(workspaces: ReturnType<typeof useTaskStore.getState>['workspaces'], listId: string) {
  for (const ws of workspaces) for (const sp of ws.spaces) if (sp.lists.some((l) => l.id === listId)) return sp;
  return undefined;
}

const TaskRow = memo(TaskRowImpl);
export default TaskRow;
