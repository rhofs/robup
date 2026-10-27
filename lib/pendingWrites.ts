// Writes to tasks and events that are still on their way to the server — so that a background
// refetch (page.tsx's 30-second poll, among others) does not land on top of them and undo them.
//
// A refetch replaces the whole list with what the server had when it read it. If that read happened
// while a create, edit or delete from this tab was still in flight, the reply is older than the screen:
// new rows vanish and edits flip back until the next poll. Applying a template made that easy to see,
// since it creates its subtasks one after another for seconds: "jeg ser at den fyller opp, men så
// forsvinner den … de kom etter 5-10 sek" (2026-10-27).
//
// Counted here rather than at every call site: every write in the store is a plain fetch to
// /api/tasks… or /api/events…, so watching fetch catches them all, including ones added later.
type Resource = 'tasks' | 'events';
const inFlight: Record<Resource, number> = { tasks: 0, events: 0 };
const lastSettledAt: Record<Resource, number> = { tasks: 0, events: 0 };

export const writesInFlight = (r: Resource) => inFlight[r];
export const lastWriteSettledAt = (r: Resource) => lastSettledAt[r];

function resourceOf(url: string): Resource | null {
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  if (/^\/api\/tasks(\/|\?|$)/.test(path)) return 'tasks';
  if (/^\/api\/events(\/|\?|$)/.test(path)) return 'events';
  return null;
}

export function installWriteTracking() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __siqtWriteTracking?: boolean };
  if (w.__siqtWriteTracking) return;
  w.__siqtWriteTracking = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const resource = method === 'GET' ? null : resourceOf(url);
    if (!resource) return original(input, init);
    inFlight[resource]++;
    return original(input, init).finally(() => {
      inFlight[resource]--;
      lastSettledAt[resource] = Date.now();
    });
  };
}
