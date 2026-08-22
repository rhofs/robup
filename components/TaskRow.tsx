'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Pencil, RefreshCw, MoreHorizontal } from 'lucide-react';
import { useTaskStore, StatusDef, CustomFieldDef, Task } from '../store/useTaskStore';
import { useIsMobile } from '../hooks/useIsMobile';
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

// Mobile's swipe-left-to-reveal panel width, sized to the number of active columns (same
// visibleColumns/activeColumns list desktop's grid uses) rather than a fixed constant, so the
// reveal panel never shows more or less than what desktop's own columns represent. Capped so a
// space with many custom fields still fits on a phone screen — the panel scrolls horizontally
// past that point instead of growing unbounded.
const REVEAL_ITEM_WIDTH = 92;
const REVEAL_MAX_WIDTH = 320;

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

  const [justToggled, setJustToggled] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [swipeRevealed, setSwipeRevealed] = useState(false);

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

  // Shared between the desktop grid cell and the mobile reveal-panel cell for the same column —
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
          panelClassName="w-44 bg-neutral-900 border border-neutral-800 rounded shadow-xl p-1.5"
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
                className="w-full flex items-center gap-2 text-[11px] text-neutral-300 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer"
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                    checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-600'
                  }`}
                >
                  {checked && <Check className="w-2.5 h-2.5" />}
                </span>
                <span className="w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: u.color }}>
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
      className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center cursor-pointer transition shrink-0 ${
        isSelected
          ? 'bg-blue-500/20 border-blue-500/60 text-blue-400 opacity-100'
          : 'border-neutral-600 opacity-0 group-hover:opacity-100'
      }`}
    >
      {isSelected && <Check className="w-2.5 h-2.5" />}
    </button>
  ) : (
    <div></div>
  );

  const doneToggle = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!task.archived) {
          setJustToggled(true);
          setTimeout(() => setJustToggled(false), 600);
        }
        optimisticArchiveTask(task.id, !task.archived);
      }}
      title={task.archived ? 'Restore from archive' : 'Mark as done (archive)'}
      className={`w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-300 ease-out active:scale-90 shrink-0 ${
        showAsDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-neutral-600 hover:border-emerald-400'
      } ${justToggled ? 'animate-[done-glow_0.6s_ease-out]' : ''}`}
    >
      {showAsDone && <Check className="w-2.5 h-2.5" />}
    </button>
  );

  const revealWidth = Math.min(Math.max(columns.length, 1) * REVEAL_ITEM_WIDTH + 48, REVEAL_MAX_WIDTH);

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
        // ================= MOBILE ROW — swipe left to reveal status/assignee/dates/custom
        // fields; task name is what you see by default. Whole-row drag-and-drop (dnd-kit) is
        // deliberately not wired here — the same row can't be both a horizontal swipe target and
        // a whole-row drag source without the two gestures racing each other; reordering on
        // mobile is intentionally out of scope for this pass. =================
        <div className="relative overflow-hidden">
          <div
            className="absolute inset-y-0 right-0 flex items-center gap-2 px-3 overflow-x-auto text-neutral-400 font-mono text-[11px] bg-neutral-900"
            style={{ width: revealWidth }}
            onClick={(e) => e.stopPropagation()}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex flex-col items-center gap-1 shrink-0" style={{ width: REVEAL_ITEM_WIDTH - 8 }}>
                <span className="text-[9px] text-neutral-600 uppercase tracking-wide truncate max-w-full">{col.label}</span>
                {renderColumnCell(col)}
              </div>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, task);
              }}
              title="More options"
              className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-neutral-400 cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <motion.div
            drag="x"
            dragConstraints={{ left: -revealWidth, right: 0 }}
            dragElastic={0.06}
            animate={{ x: swipeRevealed ? -revealWidth : 0 }}
            transition={{ type: 'tween', duration: 0.2 }}
            onDragEnd={(_e, info) => setSwipeRevealed(info.offset.x < -revealWidth / 2)}
            onClick={() => {
              if (swipeRevealed) {
                setSwipeRevealed(false);
                return;
              }
              onOpen();
            }}
            className={`relative z-10 flex items-center gap-3 px-4 py-3 text-xs cursor-pointer bg-neutral-950 ${isSelected ? 'bg-neutral-700/30' : ''}`}
          >
            {selectCheckbox}
            {doneToggle}
            <div className="font-medium flex-1 min-w-0 flex items-center gap-2 text-neutral-200">
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
                  <span className="truncate">{task.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename();
                    }}
                    title="Rename"
                    className="text-neutral-500 shrink-0 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
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
