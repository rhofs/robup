'use client';

import { motion } from 'framer-motion';
import { CornerDownRight, ListTree } from 'lucide-react';
import { useTaskStore, type Task } from '../store/useTaskStore';
import { statusesOfTask } from '../lib/listStatuses';
import StatusGlyph, { statusKind } from './StatusGlyph';

// The task in your hand while dragging it (app/page.tsx's DragOverlay): the row itself, lifted — as
// wide as it was, with its status, title, subtasks, people and due date — rather than a small pill with
// the title, which lost the row the moment it was picked up ("selve dra og sorter føles litt klumsete
// og ikke moderne", 2026-10-14). Over the middle of another task it says what letting go will do.
export default function DraggedTaskCard({
  task,
  width,
  cardRef,
  nestUnder,
}: {
  task: Task;
  width: number | null;
  cardRef: React.RefObject<HTMLDivElement | null>;
  // The task it will become a subtask of, if dropped now.
  nestUnder: string | null;
}) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const subtaskCount = useTaskStore((s) => s.tasks.filter((t) => t.parentId === task.id && !t.deletedAt && !t.archived).length);
  const allTasks = useTaskStore((s) => s.tasks);
  const def = (statusesOfTask(workspaces, allTasks, task) ?? []).find((s) => s.name === task.status);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  return (
    <div style={{ width: width ?? 360 }} className="cursor-grabbing">
      <motion.div
        ref={cardRef}
        // Picked up: a touch bigger, and its shadow grows under it.
        initial={{ scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)' }}
        animate={{ scale: 1.02, boxShadow: '0 16px 36px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.12)' }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className={`flex items-center gap-2.5 h-9 px-3 rounded-lg bg-neutral-900 border text-xs text-neutral-100 ${
          nestUnder ? 'border-blue-500/80' : 'border-neutral-700'
        }`}
      >
        <StatusGlyph kind={statusKind(def)} color={def?.color ?? '#94a3b8'} icon={def?.icon} size={14} />
        <span className="flex-1 min-w-0 truncate font-medium">{task.title}</span>
        {subtaskCount > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5">
            <ListTree className="w-3 h-3" /> {subtaskCount}
          </span>
        )}
        {task.assignees.length > 0 && (
          <span className="shrink-0 flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((a) =>
              a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.avatarUrl} alt="" className="w-5 h-5 rounded-full ring-2 ring-neutral-900 object-cover" />
              ) : (
                <span key={a.id} className="w-5 h-5 rounded-full ring-2 ring-neutral-900 text-[8px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: a.color }}>
                  {a.initials}
                </span>
              )
            )}
          </span>
        )}
        {due && <span className="shrink-0 text-[11px] text-neutral-400">{due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
      </motion.div>
      {nestUnder && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 ml-3 inline-flex items-center gap-1.5 max-w-full rounded-full bg-blue-600 text-white text-[11px] font-medium px-2.5 py-1 shadow-lg"
        >
          <CornerDownRight className="w-3 h-3 shrink-0" />
          <span className="truncate">Make a subtask of “{nestUnder}”</span>
        </motion.div>
      )}
    </div>
  );
}
