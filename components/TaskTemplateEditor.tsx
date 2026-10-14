'use client';

import { useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { closeOnBackdrop } from '../lib/backdrop';
import { parseTaskTemplate, type AppTemplate, type TaskTemplatePayload } from '../lib/templates';

// Editing a task template in place — its name, the task it makes, and its subtask checklist (add,
// rename, reorder, remove) — instead of deleting it and saving a new one from a task ("så man kan
// redigere alle typer templates … så man ikke trenger å slette, for så lage ny", 2026-10-14).
//
// The template's stored status is kept as it is and not offered here: status names belong to a Space
// or List, and a template is used in many.

type Row = { key: string; title: string };
let seq = 0;
const key = () => `sub-${++seq}`;

export default function TaskTemplateEditor({
  template,
  onSave,
  onClose,
}: {
  template: AppTemplate;
  onSave: (name: string, payload: TaskTemplatePayload) => Promise<void>;
  onClose: () => void;
}) {
  const original = parseTaskTemplate(template.payloadJson);
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(original.title);
  const [description, setDescription] = useState(original.description ?? '');
  const [rows, setRows] = useState<Row[]>(() => original.subtasks.map((t) => ({ key: key(), title: t })));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dirty =
    name !== template.name ||
    title !== original.title ||
    description !== (original.description ?? '') ||
    rows.map((r) => r.title).join('\n') !== original.subtasks.join('\n');

  const addAfter = (afterKey: string | null) => {
    const k = key();
    setRows((rs) => {
      const i = afterKey ? rs.findIndex((r) => r.key === afterKey) : rs.length - 1;
      const next = [...rs];
      next.splice(i + 1, 0, { key: k, title: '' });
      return next;
    });
    setFocusKey(k);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((rs) => arrayMove(rs, rs.findIndex((r) => r.key === active.id), rs.findIndex((r) => r.key === over.id)));
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return setError('The template needs a name.');
    setSaving(true);
    try {
      await onSave(trimmedName, {
        title: title.trim(),
        description: description.trim() || null,
        status: original.status,
        // Empty rows are dropped; the order is the order on screen.
        subtasks: rows.map((r) => r.title.trim()).filter(Boolean),
      });
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Could not save the template.');
    }
  };

  const attemptClose = () => {
    if (dirty && !window.confirm('Discard your changes to this template?')) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-3" {...closeOnBackdrop(attemptClose)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[calc(100dvh-24px)] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 h-14 shrink-0 border-b border-neutral-800 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-[15px] text-app-strong truncate">Edit task template</h3>
          <button onClick={attemptClose} className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className="block text-[12px] text-neutral-400 mb-1.5">Template name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-[13px] text-app-strong focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-neutral-400 mb-1.5">Task title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The title a new task from this template gets"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-[13px] text-app-strong placeholder:text-neutral-600 focus:outline-none focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-neutral-400 mb-1.5">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-[13px] text-app-strong focus:outline-none focus:border-blue-500 resize-y"
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-neutral-400">Subtasks ({rows.filter((r) => r.title.trim()).length})</span>
              <button onClick={() => addAfter(null)} className="flex items-center gap-1 text-[12px] text-blue-400 hover:text-blue-300 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <SubtaskRow
                      key={r.key}
                      row={r}
                      index={i}
                      autoFocus={focusKey === r.key}
                      onFocused={() => setFocusKey(null)}
                      onChange={(t) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, title: t } : x)))}
                      onEnter={() => addAfter(r.key)}
                      onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {rows.length === 0 && <p className="text-[12px] text-neutral-500 py-2">No subtasks. Add the steps this kind of task always has.</p>}
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-800 px-5 py-3 flex items-center gap-2">
          <p className={`flex-1 text-[11.5px] ${error ? 'text-red-400' : 'text-neutral-500'}`}>
            {error ?? 'Tasks already made from it keep what they have.'}
          </p>
          <button onClick={attemptClose} className="h-9 px-4 rounded-lg border border-neutral-700 text-[13px] text-app-strong hover:bg-neutral-800 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium cursor-pointer disabled:bg-neutral-700 disabled:text-neutral-400 disabled:cursor-default"
          >
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubtaskRow({
  row,
  index,
  autoFocus,
  onFocused,
  onChange,
  onEnter,
  onRemove,
}: {
  row: Row;
  index: number;
  autoFocus: boolean;
  onFocused: () => void;
  onChange: (title: string) => void;
  onEnter: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group/sub flex items-center gap-2 h-9 pl-1 pr-1 rounded-lg border border-neutral-800 bg-neutral-900 hover:border-neutral-700"
    >
      <span {...attributes} {...listeners} className="text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-3.5 h-3.5" />
      </span>
      <span className="w-5 text-right text-[11px] text-neutral-500 shrink-0">{index + 1}.</span>
      <input
        ref={(el) => {
          input.current = el;
          if (el && autoFocus) {
            el.focus();
            onFocused();
          }
        }}
        value={row.title}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter makes the next step, the way you write a checklist.
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter();
          }
          if (e.key === 'Backspace' && !row.title) {
            e.preventDefault();
            onRemove();
          }
        }}
        placeholder="Subtask"
        className="flex-1 min-w-0 bg-transparent text-[13px] text-app-strong placeholder:text-neutral-600 focus:outline-none"
      />
      <button
        onClick={onRemove}
        title="Remove"
        className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-800 md:opacity-0 md:group-hover/sub:opacity-100 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
