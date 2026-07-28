'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Pencil, RefreshCw, MoreHorizontal } from 'lucide-react';
import { useTaskStore, StatusDef, CustomFieldDef, Task } from '../store/useTaskStore';
import DatePickerPopover from './DatePickerPopover';
import FloatingPopover from './FloatingPopover';

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
  statuses: StatusDef[];
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent, task: Task) => void;
  autoFocusRename?: boolean;
  onRenameHandled?: () => void;
};

function TaskRowImpl({
  task,
  onOpen,
  columns,
  statuses,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  onContextMenu,
  autoFocusRename = false,
  onRenameHandled,
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

  const [justToggled, setJustToggled] = useState(false);
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
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer bg-slate-900 text-slate-300 border-slate-700"
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
        className="w-full bg-transparent text-[11px] text-slate-300 focus:outline-none focus:bg-slate-900 rounded px-1 py-0.5"
      />
    );
  };

  return (
    <motion.div
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)', y: -6 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onOpen}
        onContextMenu={(e) => onContextMenu?.(e, task)}
        className={`grid items-center px-4 py-2.5 text-xs hover:bg-slate-800/50 transition-colors duration-150 cursor-pointer group ${
          isOver ? 'bg-indigo-600/20 ring-1 ring-inset ring-indigo-500' : ''
        } ${isDragging ? 'opacity-40' : ''} ${isSelected ? 'bg-indigo-600/10' : ''}`}
        style={{ gridTemplateColumns: `20px 28px 2fr ${columns.map(() => '110px').join(' ')} 32px` }}
      >
        {selectable ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className={`w-3.5 h-3.5 rounded border flex items-center justify-center cursor-pointer transition ${
              isSelected
                ? 'bg-indigo-500 border-indigo-500 text-white opacity-100'
                : 'border-slate-600 opacity-0 group-hover:opacity-100'
            }`}
          >
            {isSelected && <Check className="w-2.5 h-2.5" />}
          </button>
        ) : (
          <div></div>
        )}

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
          className={`w-4 h-4 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-300 ease-out active:scale-90 ${
            showAsDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600 hover:border-emerald-400'
          } ${justToggled ? 'animate-[done-glow_0.6s_ease-out]' : ''}`}
        >
          {showAsDone && <Check className="w-2.5 h-2.5" />}
        </button>

        <div className="font-medium text-slate-200 flex items-center gap-2 truncate pr-4">
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
              className="w-full bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-slate-100 focus:outline-none"
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
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 shrink-0 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {columns.map((col) => (
          <div key={col.key} className="flex justify-center text-slate-400 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
            {col.kind === 'status' && (
              <FloatingPopover
                open={statusOpen}
                onClose={() => setStatusOpen(false)}
                panelClassName="w-40 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-1.5"
                anchor={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatusOpen((o) => !o);
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition inline-flex items-center gap-1"
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
                    className="w-full flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                    {s.name}
                  </button>
                ))}
              </FloatingPopover>
            )}
            {col.kind === 'assignee' && (
              <FloatingPopover
                open={assigneeOpen}
                onClose={() => setAssigneeOpen(false)}
                panelClassName="w-44 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-1.5"
                anchor={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigneeOpen((o) => !o);
                    }}
                    className="flex items-center -space-x-1.5 cursor-pointer"
                  >
                    {task.assignees.length === 0 && (
                      <span className="w-5 h-5 rounded-full border border-dashed border-slate-600 text-slate-500 text-[9px] flex items-center justify-center">+</span>
                    )}
                    {task.assignees.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        title={a.name}
                        className="w-5 h-5 rounded-full border border-slate-900 text-[9px] font-bold flex items-center justify-center text-white"
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
                      className="w-full flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                          checked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-600'
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
                {users.length === 0 && <p className="text-[10px] text-slate-500 px-2 py-1">No users yet.</p>}
              </FloatingPopover>
            )}
            {col.kind === 'startDate' && (
              <DatePickerPopover
                value={task.startDate}
                placeholder="---"
                onChange={(iso) => optimisticSetDates(task.id, iso, task.dueDate ? new Date(task.dueDate).toISOString() : null)}
              />
            )}
            {col.kind === 'dueDate' && (
              <DatePickerPopover
                value={task.dueDate}
                placeholder="---"
                onChange={(iso) => optimisticSetDates(task.id, task.startDate ? new Date(task.startDate).toISOString() : null, iso)}
              />
            )}
            {col.kind === 'custom' && col.field && renderCustomFieldCell(col.field)}
          </div>
        ))}

        <div className="flex justify-end">
          <button
            onClick={(e) => onContextMenu?.(e, task)}
            title="More options"
            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-200 p-1 rounded transition cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const TaskRow = memo(TaskRowImpl);
export default TaskRow;
