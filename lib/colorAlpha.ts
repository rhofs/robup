// Appends an alpha channel to one of this app's existing 6-digit hex Space/Folder/List colors
// (`#RRGGBB`) — used by the Planner's "lighter, tinted" event treatment (subtle background/border
// instead of a solid fill) without introducing any new colors of its own, just varying the alpha
// of whatever color a Task/Event already cascades to.
export function withAlpha(hex: string, alphaPercent: number): string {
  const clamped = Math.max(0, Math.min(100, alphaPercent));
  const alphaHex = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
}
