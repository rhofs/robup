// Free of browser imports, so both the client and the server (lib/autoCompleteParent.ts) can use it.
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
