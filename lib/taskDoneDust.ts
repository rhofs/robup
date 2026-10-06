import { addPuff, makePuffParticles } from '../components/calendar/PuffBurst';
import { hapticTap } from './haptics';

// Star dust when a task is completed, wherever that happens — "Partiklene ved fullført tasks må jo være
// på alle task fra alle Lister i office, og personlige tasks, samt i docs." Completing a task in this
// app means ARCHIVING it — the circle in front of every task row (TaskRow's doneToggle, "Mark as done
// (archive)") and in the doc task block — so useTaskStore's optimisticArchiveTask is the main caller.
// The first version only hooked status changes and so never fired for the circle people actually
// press. optimisticMoveTask also calls it when a task moves into a done-looking status.
//
// Statuses here are free-form per Space, so "done" is: the Space's last status (the default set ends in
// "Done"), or any status simply called done/complete/closed/finished/ferdig/fullført.
const DONE_NAME = /^(done|complete|completed|closed|finished|ferdig|fullført)$/i;

export function isDoneStatus(name: string, statuses: { name: string; order: number; isDone?: boolean }[]): boolean {
  // A Space that marks its done statuses (Manage statuses) is taken at its word.
  if (statuses.some((st) => st.isDone)) return statuses.some((st) => st.isDone && st.name === name);
  if (DONE_NAME.test(name.trim())) return true;
  if (statuses.length < 2) return false;
  const last = statuses.reduce((a, b) => (b.order > a.order ? b : a));
  return last.name === name;
}

// The dust comes out where the person just pressed — the status they picked, the circle they tapped —
// so it reads as the result of their touch. Only a press in the last moment counts: a status changed
// by undo/redo, or by anything without a fresh press, completes quietly.
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

export function celebrateTaskDone() {
  if (!lastPress || performance.now() - lastPress.at > 1500) return;
  addPuff({ x: lastPress.x, y: lastPress.y, particles: makePuffParticles(0.45, true), calm: true });
  hapticTap();
}
