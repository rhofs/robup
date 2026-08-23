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

    return (
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
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
          panelClassName="w-40 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
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
          panelClassName={isMobile ? 'w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5' : 'w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5'}
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
      {isMobile ? (
        // ================= MOBILE ROW — a "card," not a table row: checkbox + title on top
        // (title wraps instead of truncating), status/assignee/dates/custom fields always visible
        // underneath as compact wrapped pills instead of hidden behind an expand/swipe gesture —
        // an expert design pass flagged the earlier accordion-behind-a-chevron approach as still
        // clumsy, and a permanently-visible metadata row is both simpler and matches how mobile
        // task apps (and the reference screenshots this was redesigned against) actually look.
        // Elevated surface (bg-neutral-900 against the page's darker background) with no border
        // and a soft rounded-xl corner, rather than the hairline-bordered/square-cornered "table
        // row" look — the flat gap-based card spacing (app/page.tsx's list container) replaces
        // the old divide-y row separators. Grip (drag) and More (menu) live in the top-right
        // corner, always reachable without scrolling. Whole-row drag-and-drop is still scoped to
        // the dedicated grip handle (dnd-kit's own "drag handle" pattern), not the card itself, so
        // it can't race the card's own tap-to-open; `touchAction: 'none'` on the grip stops the
        // browser's native touch-scroll from competing with dnd-kit's pointer capture. No
        // TouchSensor needed — dnd-kit's PointerSensor (already registered as `taskSensors` in
        // app/page.tsx) already handles touch via the Pointer Events API. =================
        <div
          ref={setNodeRef}
          className={`relative rounded-xl bg-neutral-900 ${isSelected ? 'ring-1 ring-inset ring-blue-500/60' : ''} ${
            isOver ? 'ring-1 ring-inset ring-neutral-500' : ''
          } ${isDragging ? 'opacity-40' : ''}`}
        >
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
              style={{ touchAction: 'none' }}
              className="shrink-0 text-neutral-600 cursor-grab active:cursor-grabbing p-2"
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
                <span className="font-medium text-neutral-200 leading-snug break-words">{task.title}</span>
              )}
            </div>
          </div>
          {columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pb-3.5 pl-[52px]" onClick={(e) => e.stopPropagation()}>
              {columns.map((col) => (
                <div key={col.key} className="flex items-center gap-1 text-neutral-400">
                  {(col.kind === 'startDate' || col.kind === 'dueDate') && <Calendar className="w-3 h-3 shrink-0" />}
                  {renderColumnCell(col)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ================= DESKTOP ROW (unchanged) =================
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          onClick={onOpen}
          onContextMenu={(e) => onContextMenu?.(e, task)}
          className={`grid items-center px-4 py-2.5 text-xs hover:bg-neutral-800/50 transition-colors duration-150 cursor-pointer group ${
            isOver ? 'bg-neutral-700/40 ring-1 ring-inset ring-neutral-500' : ''
          } ${isDragging ? 'opacity-40' : ''} ${isSelected ? 'bg-neutral-700/30' : ''}`}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {selectCheckbox}
          {doneToggle}

          <div className="font-medium flex items-center gap-2 truncate pr-4 text-neutral-200">
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
                className="w-full bg-neutral-900 border border-blue-500 rounded px-1.5 py-0.5 text-neutral-100 focus:outline-none"
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
                  className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-200 shrink-0 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
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
    </motion.div>
  );
}

const TaskRow = memo(TaskRowImpl);
export default TaskRow;
