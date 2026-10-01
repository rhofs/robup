import { addPuff, makePuffParticles } from '../components/calendar/PuffBurst';
import { hapticTap } from './haptics';

// Star dust when a task is completed, wherever that happens — "Partiklene ved fullført tasks må jo være
// på alle task fra alle Lister i office, og personlige tasks, samt i docs." Every status change in the
// app goes through useTaskStore's optimisticMoveTask (task rows in Lists and My Tasks, the task modal,
// the docs' task-list block), which calls celebrateTaskDone when a task moves into a done status.
//
// Statuses here are free-form per Space, so "done" is: the Space's last status (the default set ends in
// "Done"), or any status simply called done/complete/closed/finished/ferdig/fullført.
const DONE_NAME = /^(done|complete|completed|closed|finished|ferdig|fullført)$/i;

export function isDoneStatus(name: string, statuses: { name: string; order: number }[]): boolean {
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
