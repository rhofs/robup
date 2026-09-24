'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Pencil, RefreshCw, MoreHorizontal, GripVertical, Calendar } from 'lucide-react';
import { useTaskStore, StatusDef, CustomFieldDef, Task } from '../store/useTaskStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLongPress } from '../hooks/useLongPress';
import DatePickerPopover from './DatePickerPopover';
import FloatingPopover from './FloatingPopover';
import { startDateColor, dueDateColor, DATE_BADGE_COLOR_HEX, startDateTooltip, dueDateTooltip } from '../lib/dateBadgeColor';

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
}: TaskRowProps) {
  const {
    users,
    optimisticMoveTask,
    optimisticSetAssignees,
    optimisticSetCustomFieldValue,
    optimisticSetDates,
    optimisticArchiveTask,
    optimisticSetTitle,
  } = useTaskStore();

  const isMobile = useIsMobile();

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

  const showAsDone = task.archived;

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

    // A date field sizes to its own content; everything else fills the column.
    //
    // A native <input type="date"> puts its value on the left and its calendar button on the right,
    // hard against the input's own edge. At w-full that edge IS the edge of the column, so the
    // button ended up sitting against the next column's first character — with a gap of empty input
    // between it and the date it actually belongs to. It reads as the next column's control, and
    // clicking it then sets the date one column to the LEFT of where it appeared to be. Reported
    // with a screenshot: "kalendergreia følger columnen til høyre, selv om den velger for venstre".
    //
    // Sizing to content keeps the value and its button together as one object, and the cell's own
    // `justify-center` then centres that object with space on both sides — so the thing nearest the
    // boundary is whitespace rather than a control. Text and number fields keep the full width they
    // need for typing; neither of them draws anything at its far edge.
    const isDate = field.type === 'date';
    return (
      <input
        type={field.type === 'number' ? 'number' : isDate ? 'date' : 'text'}
        defaultValue={value}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => optimisticSetCustomFieldValue(task.id, field.id, e.target.value)}
        placeholder="—"
        className={`bg-transparent text-[11px] text-neutral-300 focus:outline-none focus:bg-neutral-900 rounded px-1 py-0.5 ${
          isDate ? 'w-auto max-w-full' : 'w-full'
        }`}
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
          panelClassName={isMobile ? 'w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl p-1.5' : 'w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl p-1.5'}
          anchor={
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAssigneeOpen((o) => !o);
              }}
              className="flex items-center -space-x-1.5 cursor-pointer"
            >
              {task.assignees.length === 0 && (
                <span className="w-5 h-5 rounded-full border border-dashed border-neutral-600 text-neutral-500 text-[9px] flex items-center justify-center">+</span>
              )}
              {task.assignees.slice(0, 3).map((a) => (
                <span
                  key={a.id}
                  title={a.name}
                  className="w-5 h-5 rounded-full border border-neutral-900 text-[9px] font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: a.color }}
                >
                  {a.initials}
                </span>
              ))}
            </button>
          }
        >
          {users.map((u) => {
            const checked = task.assignees.some((a) => a.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                // Bigger checkbox/row on mobile — this exact list was reported as too fiddly to
                // tap accurately at the desktop-sized 3.5-unit checkbox.
                className={`w-full flex items-center gap-2 text-[11px] text-neutral-300 rounded hover:bg-neutral-800/60 cursor-pointer ${
                  isMobile ? 'px-2 py-2.5' : 'px-2 py-1'
                }`}
              >
                <span
                  className={`rounded border flex items-center justify-center shrink-0 transition ${isMobile ? 'w-5 h-5' : 'w-3.5 h-3.5'} ${
                    checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                  }`}
                >
                  {checked && <Check className={isMobile ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />}
                </span>
                <span
                  className={`rounded-full font-bold flex items-center justify-center text-white shrink-0 ${isMobile ? 'w-5 h-5 text-[9px]' : 'w-4 h-4 text-[8px]'}`}
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </span>
                {u.name}
              </button>
            );
          })}
          {users.length === 0 && <p className="text-[10px] text-neutral-500 px-2 py-1">No users yet.</p>}
        </FloatingPopover>
      );
    }

    if (col.kind === 'startDate') {
      return (
        <DatePickerPopover
          value={task.startDate}
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

  const doneToggle = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        optimisticArchiveTask(task.id, !task.archived);
      }}
      title={task.archived ? 'Restore from archive' : 'Mark as done (archive)'}
      className={`rounded-full border flex items-center justify-center cursor-pointer transition-all duration-300 ease-out active:scale-90 shrink-0 ${isMobile ? 'w-5 h-5' : 'w-4 h-4'} ${
        showAsDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-neutral-600 hover:border-emerald-400'
      }`}
    >
      {showAsDone && <Check className={isMobile ? 'w-3 h-3' : 'w-2.5 h-2.5'} />}
    </button>
  );

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
      initial={animateEntrance ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)', y: -6 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
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
          className={`relative overflow-hidden rounded-xl bg-neutral-800/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
            isSelected ? 'ring-1 ring-inset ring-blue-500/60' : ''
          } ${isOver ? 'ring-1 ring-inset ring-neutral-500' : ''} ${isDragging ? 'opacity-40' : ''}`}
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-[3px]"
            style={{ backgroundColor: statusColorOf(task.status) }}
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
                <span className="text-[15px] font-semibold text-app-strong leading-snug break-words">{task.title}</span>
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
        // ================= DESKTOP ROW (unchanged) =================
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
          className={`grid items-center px-4 py-2.5 text-xs hover:bg-neutral-800/50 transition-colors duration-150 cursor-pointer group ${
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
          <div className="flex items-center">{selectCheckbox}</div>
          {doneToggle}

          <div className="font-medium flex items-center gap-2 truncate pr-4 text-neutral-200">
            {/* A visible grip, on hover. The whole desktop row has always been draggable, which
                works and says nothing — and a capability nobody can see is one nobody has. Reported
                as there being "no way" to reorder subtasks, which was half true: the machinery was
                there and nothing pointed at it.
                
                -ml-1 so it sits in the row's own padding rather than shifting the title, and the
                column keeps its width whether or not the cursor is over it. */}
            <span
              title="Drag to reorder"
              className="shrink-0 -ml-1 text-neutral-700 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing transition-colors"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
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
                  className="truncate hover:underline"
                  title="Double-click to rename"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename();
                  }}
                >
                  {task.title}
                </span>
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

const TaskRow = memo(TaskRowImpl);
export default TaskRow;
