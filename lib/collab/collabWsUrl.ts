// The Hocuspocus sidecar (server/collabServer.ts) listens on a plain, unencrypted WebSocket —
// fine for local dev (http://localhost), but a browser blocks a plain `ws://` connection from an
// `https://` page outright as mixed content (no network attempt even happens, and every one of
// this codebase's 3 client call sites hardcoded `ws://` unconditionally). Worse than just "no
// realtime": each blocked attempt's reconnect logic re-fires immediately since the failure is a
// synchronous browser policy block rather than a real network timeout, and with three of these
// hooks/components mounted at once that turned into a tight retry loop saturating the main thread
// — surfacing as the whole app's UI (nav taps included) going unresponsive, not just missing
// realtime updates. Matching the page's own protocol at least turns a guaranteed-instant,
// guaranteed-tight-loop failure into a normal (slower-backoff) connection failure if the collab
// port isn't actually reachable over TLS yet — a real WSS reverse-proxy in front of the collab
// port is still a separate, not-yet-done infra task (see PLANNING.md), so this only stops the
// symptom from taking down the whole UI, it doesn't make realtime collab/chat/presence live over
// HTTPS on its own.
export function collabWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:1234`;
}
