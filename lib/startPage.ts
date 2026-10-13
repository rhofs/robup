// Where the app opens, stored per device — and, since 2026-10-13, on desktop too, with My Assigned Tasks
// as one of the choices ("muligheten til å sette My Assigned Task som default-meny man går inn på når
// man starter … Også på desktop og mobil"). Only a cold start (no place in the URL) uses it; a reload
// keeps where you were.
//
// Per device rather than per account, on purpose: someone may well want the phone to open on Me and
// a tablet to open on Planner, and there is no server round-trip in the way of the very first paint
// this decides.
export const START_PAGE_STORAGE_KEY = 'siqt.startPage';

// 'me': the phone's Home, and on desktop the task board — what the app did before this was a choice.
export type StartPage = 'me' | 'office' | 'planner' | 'mytasks';

// Me by default, which is what the app did before this was a choice. A default that changes
// behaviour for people who never opened the setting would be a worse first impression than one that
// keeps it.
const DEFAULT_START_PAGE: StartPage = 'me';

export function readStartPage(): StartPage {
  if (typeof window === 'undefined') return DEFAULT_START_PAGE;
  try {
    const stored = localStorage.getItem(START_PAGE_STORAGE_KEY);
    return stored === 'office' || stored === 'planner' || stored === 'me' || stored === 'mytasks' ? stored : DEFAULT_START_PAGE;
  } catch {
    return DEFAULT_START_PAGE;
  }
}

export function setStartPage(value: StartPage): void {
  try {
    // Written explicitly, including the default — see lib/layoutPreference.ts's own lesson, which
    // this app has already paid for once: a preference stored as the ABSENCE of a value cannot
    // survive a change of default.
    localStorage.setItem(START_PAGE_STORAGE_KEY, value);
  } catch {}
}
