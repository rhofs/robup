// Live Spaces first, then archived ones (present only in archive mode, see lib/archivedSpaces.ts) —
// the order every Space list uses, with the archived ones dimmed under an "Archived" divider.
export const archivedLast = <T extends { archived?: boolean; order: number }>(a: T, b: T) =>
  Number(!!a.archived) - Number(!!b.archived) || a.order - b.order;
