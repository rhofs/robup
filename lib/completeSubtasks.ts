// "Hvis man setter en task som fullført, så burde man få muligheten til å velge at alle subtasks også
// blir satt som fullført." Wherever a task is finished by hand — its circle, its Status column, the
// status in its own window — this asks the page (app/page.tsx listens) to offer the same for the
// task's unfinished subtasks, all the way down. The page decides whether there is anything to offer.
//
// `statusName`: the status the subtasks are offered — null to leave their status as it is (a task
// closed without a closed status: the built-in "Close task", or a circle that closes directly).
// `close`: the task was closed (archived) as well, so the subtasks are offered the same.
export function offerCompleteSubtasks(taskId: string, statusName: string | null, close: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('siqt-complete-subtasks', { detail: { taskId, statusName, close } }));
}
