'use client';

import { useMemo } from 'react';
import { CalendarCheck2, CalendarOff } from 'lucide-react';
import { useTaskStore, type Task } from '../store/useTaskStore';
import { isTaskInPlanner, plannerDefaults } from '../lib/taskDates';

// The Planner switch in a date picker: whether the task shows in the Planner — "at knappen er på
// kalenderen der, som gjør om den vises i planner eller ei" (2026-10-21). A dated task stays dated
// either way (it still tops My Assigned Tasks and turns red when late); this only decides whether
// the Planner draws it. Its default comes from the List, else the Space ("Edit List" / "Edit Space").
export default function PlannerToggle({ on, onToggle, followsDefault }: { on: boolean; onToggle: () => void; followsDefault?: boolean }) {
  const Icon = on ? CalendarCheck2 : CalendarOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${on ? 'Shown in the Planner — click to keep it out' : 'Not in the Planner — click to show it'}${followsDefault ? ' (the default here)' : ''}`}
      className={`h-7 px-2 rounded-full flex items-center gap-1.5 text-[11px] font-medium cursor-pointer transition border ${
        on ? 'text-blue-400 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20' : 'text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:bg-neutral-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {on ? 'In Planner' : 'Not in Planner'}
    </button>
  );
}

// The switch for a task that exists. Choosing the same as the default stores nothing (null), so the
// task keeps following its List and Space if those change later.
export function TaskPlannerToggle({ task }: { task: Pick<Task, 'id' | 'listId' | 'showInPlanner'> }) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const setShowInPlanner = useTaskStore((s) => s.optimisticSetShowInPlanner);
  const fallback = useMemo(() => plannerDefaults(workspaces).get(task.listId) ?? true, [workspaces, task.listId]);
  const on = isTaskInPlanner(task, new Map([[task.listId, fallback]]));
  return (
    <PlannerToggle
      on={on}
      followsDefault={task.showInPlanner == null}
      onToggle={() => {
        const next = !on;
        setShowInPlanner(task.id, next === fallback ? null : next);
      }}
    />
  );
}
