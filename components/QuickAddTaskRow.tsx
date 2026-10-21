'use client';

import { useMemo, useState } from 'react';
import { CornerDownLeft, UserPlus } from 'lucide-react';
import FloatingPopover from './FloatingPopover';
import DatePickerPopover from './DatePickerPopover';
import AssigneePicker, { AssigneeStack } from './AssigneePicker';
import { useTaskStore } from '../store/useTaskStore';
import { useSessionStore } from '../store/useSessionStore';
import { pickableMembers, taskAudience, workspaceIdForList } from '../lib/workspaceMembers';
import { suggestTaskAssignees } from '../lib/assigneeSuggestions';
import { plannerDefaults } from '../lib/taskDates';
import PlannerToggle from './PlannerToggle';

export type QuickAddExtras = {
  assigneeIds: string[];
  startDate: string | null;
  dueDate: string | null;
  // The Planner switch in the date pickers: null = the List's default (lib/taskDates.ts).
  showInPlanner: boolean | null;
};

// The list's "+ Add Task" row on desktop, with who and when settable before the task exists — "når
// jeg legger inn ny task i ClickUp, så kan man legge til enkelt info, sånn som assign task, eller set
// due date … allerede når man lager tasken, i stedet for at man må lage tasken og trykke seg inn"
// (2026-10-21). The phone has had this all along in its own card (components/mobile/TaskCreateSheet).
//
// Enter (or Save) creates the task and closes the row — the row staying open after the task had
// appeared read as the task not having been made: "tekstvinduet (create new task) [er] fortsatt oppe,
// selv om tasken lages" (2026-10-21). Shift+Enter creates it and keeps the row open, empty, for the
// next one. The people and dates are cleared with the title either way — carrying them over would
// quietly give the next task someone else's choices.
export default function QuickAddTaskRow({
  listId,
  gridTemplate,
  inputRef,
  onAdd,
  onCancel,
}: {
  // The list's own column grid. The title takes the Name column and everything else starts where the
  // first column does — "kan vi få så de default starter der første column starter? og at tekstboksen
  // ikke går så langt" (2026-10-21) — instead of a title box the width of the screen with its buttons
  // pushed to the far edge.
  gridTemplate?: string;
  // Where the task will go; decides who can be picked. Null when there is no List to put it in.
  listId: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  // True when the task was created.
  onAdd: (title: string, extras: QuickAddExtras) => boolean;
  onCancel: () => void;
}) {
  const workspaces = useTaskStore((s) => s.workspaces);
  const users = useTaskStore((s) => s.users);
  const tasks = useTaskStore((s) => s.tasks);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const [title, setTitle] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [inPlanner, setInPlanner] = useState<boolean | null>(null);
  const plannerFallback = useMemo(() => (listId ? plannerDefaults(workspaces).get(listId) ?? true : true), [workspaces, listId]);
  const plannerOn = inPlanner ?? plannerFallback;
  const plannerToggle = (
    <PlannerToggle
      on={plannerOn}
      followsDefault={inPlanner === null}
      onToggle={() => setInPlanner(!plannerOn === plannerFallback ? null : !plannerOn)}
    />
  );

  // The people who will be able to open a task in this List — the same rule the phone's card uses.
  const people = useMemo(() => {
    if (!listId) return [];
    const members = pickableMembers(workspaces, users, workspaceIdForList(workspaces, listId));
    const audience = taskAudience(workspaces, { listId, isPrivate: false, accessJson: '[]' });
    return audience ? members.filter((u) => audience.has(u.id)) : members;
  }, [workspaces, users, listId]);
  const chosen = users.filter((u) => assigneeIds.includes(u.id));

  const save = (keepOpen = false) => {
    const t = title.trim();
    if (!t) return;
    if (!onAdd(t, { assigneeIds, startDate, dueDate, showInPlanner: inPlanner })) return;
    if (!keepOpen) {
      onCancel();
      return;
    }
    setTitle('');
    setAssigneeIds([]);
    setStartDate(null);
    setDueDate(null);
    setInPlanner(null);
    inputRef.current?.focus();
  };

  const input = (
    <input
      type="text"
      ref={inputRef}
      placeholder="Task name — Enter to save"
      title="Enter saves and closes · Shift+Enter saves and starts the next one"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save(e.shiftKey);
        }
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full min-w-0 bg-neutral-900 border border-blue-500/80 rounded px-3 py-1 text-xs text-app-strong focus:outline-none"
    />
  );
  const controls = (
    <>
      <FloatingPopover
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        align="left"
        panelClassName="w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        anchor={
          <button
            type="button"
            onClick={() => setPeopleOpen((o) => !o)}
            title={chosen.length ? chosen.map((u) => u.name).join(', ') : 'Assign'}
            disabled={!listId}
            className={`h-7 px-1.5 rounded flex items-center gap-1 cursor-pointer transition disabled:opacity-40 disabled:cursor-default ${
              chosen.length ? 'hover:bg-neutral-800/70' : 'border border-dashed border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/70'
            }`}
          >
            {chosen.length ? <AssigneeStack people={chosen} size={20} /> : <UserPlus className="w-3.5 h-3.5" />}
          </button>
        }
      >
        <AssigneePicker
          people={people}
          selectedIds={assigneeIds}
          suggestedIds={listId ? suggestTaskAssignees(tasks, listId) : []}
          onToggle={(uid) => setAssigneeIds((ids) => (ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid]))}
          currentUserId={currentUserId}
        />
      </FloatingPopover>
      <DatePickerPopover value={startDate} onChange={setStartDate} placeholder="Start" label="Start" showLabel plannerToggle={plannerToggle} />
      <DatePickerPopover value={dueDate} onChange={setDueDate} placeholder="Due" label="Due" showLabel plannerToggle={plannerToggle} />
      <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-200 text-xs px-2 cursor-pointer">
        Cancel
      </button>
      <button
        onClick={() => save()}
        title="Save (Enter) · Shift+Enter saves and starts the next one"
        disabled={!title.trim()}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-default text-white text-xs pl-3 pr-2 py-1 rounded font-medium cursor-pointer flex items-center gap-1"
      >
        Save <CornerDownLeft className="w-3 h-3" />
      </button>
    </>
  );

  if (gridTemplate) {
    return (
      <div className="grid items-center px-4 py-2 bg-neutral-950/40" style={{ gridTemplateColumns: gridTemplate }}>
        <div />
        <div className="min-w-0 pr-3">{input}</div>
        <div className="flex items-center gap-2 min-w-max" style={{ gridColumn: '3 / -1' }}>
          {controls}
        </div>
      </div>
    );
  }
  return (
    <div className="p-2.5 bg-neutral-950/40 flex gap-2 items-center">
      <div className="flex-1 min-w-0">{input}</div>
      {controls}
    </div>
  );
}
