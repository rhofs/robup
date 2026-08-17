// Human-readable file size for the pending-attachment chip and the AttachmentGrid's file cards —
// e.g. 245 -> "245 B", 15400 -> "15.0 KB", 2400000 -> "2.3 MB".
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
