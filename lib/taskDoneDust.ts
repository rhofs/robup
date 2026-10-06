import { addPuff, makePuffParticles } from '../components/calendar/PuffBurst';
import { hapticTap } from './haptics';

// Star dust when a task is completed, wherever that happens — "Partiklene ved fullført tasks må jo være
// på alle task fra alle Lister i office, og personlige tasks, samt i docs." Completing a task in this
// app means ARCHIVING it — the circle in front of every task row (TaskRow's doneToggle, "Mark as done
// (archive)") and in the doc task block — so useTaskStore's optimisticArchiveTask is the main caller.
// The first version only hooked status changes and so never fired for the circle people actually
// press. optimisticMoveTask also calls it when a task moves into a closed status (not a done one).
//
// Statuses here are free-form per Space, so "done" is: the Space's last status (the default set ends in
// "Done"), or any status simply called done/complete/closed/finished/ferdig/fullført.
const DONE_NAME = /^(done|complete|completed|closed|finished|ferdig|fullført)$/i;

export function isDoneStatus(name: string, statuses: { name: string; order: number; isDone?: boolean; isClosed?: boolean }[]): boolean {
  // A Space that marks its done and closed statuses (Manage statuses) is taken at its word.
  if (statuses.some((st) => st.isDone || st.isClosed)) return statuses.some((st) => (st.isDone || st.isClosed) && st.name === name);
  if (DONE_NAME.test(name.trim())) return true;
  if (statuses.length < 2) return false;
  const last = statuses.reduce((a, b) => (b.order > a.order ? b : a));
  return last.name === name;
}

// Only closing a task gets dust — archiving it, or moving it into a closed status. A done status keeps
// the task in the list and completes quietly.
export function isClosedStatus(name: string, statuses: { name: string; isClosed?: boolean }[]): boolean {
  return statuses.some((st) => st.isClosed && st.name === name);
}

// The dust comes out of the task's circle (StatusCircle marks it with data-status-circle) — "Den burde
// vel komme fra 'Hullet' eller 'Sirkelen'?" — not from wherever the pointer was: picking "Close" in the
// circle's menu used to burst from the menu item. Where the circle is not on screen (the task's own
// window, say) it falls back to the press. Only a press in the last moment counts: a status changed by
// undo/redo, or by anything without a fresh press, closes quietly.
let lastPress: { x: number; y: number; at: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPress = { x: e.clientX, y: e.clientY, at: performance.now() };
    },
    { capture: true, passive: true }
  );
}

// Picking a closed status both sets it and archives the task — two completions from one tap. One burst.
let lastBurstAt = 0;

export function celebrateTaskDone(taskId?: string) {
  if (!lastPress || performance.now() - lastPress.at > 1500) return;
  if (performance.now() - lastBurstAt < 400) return;
  lastBurstAt = performance.now();
  const at = (taskId && circleCentre(taskId, lastPress)) || lastPress;
  addPuff({ x: at.x, y: at.y, particles: makePuffParticles(0.45, true), calm: true });
  hapticTap();
}

// The centre of the task's circle on screen — the one nearest the press, if the task shows in two
// places at once (a List and a doc's List block).
function circleCentre(taskId: string, near: { x: number; y: number }) {
  let best: { x: number; y: number; d: number } | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-status-circle="${CSS.escape(taskId)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const d = Math.hypot(x - near.x, y - near.y);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}
