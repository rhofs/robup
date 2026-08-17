// `navigator.clipboard` only exists in a secure context (HTTPS or `localhost`) — this app is
// routinely opened over plain HTTP via a LAN IP/nip.io address (see PLANNING.md's deployment-prep
// notes; no HTTPS set up yet), where `navigator.clipboard` is simply `undefined`, not merely
// permission-denied. Falls back to the legacy hidden-textarea + execCommand('copy') trick, which
// still works in an insecure context. Returns whether the copy actually succeeded, so a caller can
// avoid showing a false "copied" confirmation.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy fallback below (e.g. permission denied).
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
