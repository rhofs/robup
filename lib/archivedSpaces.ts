// Archived Spaces are left out of what the app loads unless the viewer has "Archived spaces"
// switched on (`?archivedSpaces=1`, sent by the store — see showArchivedSpaces in useTaskStore).
//
// Filtered where the data is fetched rather than on every screen: the sidebar, Everything, the
// Planner, My Tasks, mentions, Ctrl+K and every list picker all read the same store, so leaving the
// rows out once is what makes an archived Space disappear from all of them at once — and a screen
// added next month cannot forget to hide it.
export function includeArchivedSpaces(req: Request): boolean {
  return new URL(req.url).searchParams.get('archivedSpaces') === '1';
}

// For a `space` relation filter: nothing when archived Spaces are wanted, `archived: false` when not.
export const spaceArchiveFilter = (include: boolean) => (include ? {} : { archived: false });
