// The Hocuspocus sidecar (server/collabServer.ts) listens on a plain, unencrypted WebSocket on
// port 1234 — fine locally (http://localhost), but production (siqt.no) has no TLS termination in
// front of that port at all (a real reverse-proxy/tunnel for it is a separate, not-yet-done infra
// task — see PLANNING.md). Switching the client to request `wss://` (collabWsUrl) stopped the
// browser's instant mixed-content block, but a real TLS handshake against a port with no cert
// still fails fast, and failing fast repeatedly across 3 independently-reconnecting call sites
// (presence, chat delivery, and a fresh one spun up on every workspace/channel switch while
// navigating) compounded into the same practical result: enough failed-connection churn to bog
// down the whole app, worse the more you tap around. `isCollabRealtimeEnabled` gates presence and
// chat-push (both pure "nice to have live" signals, never required for the app to function) behind
// an explicit opt-in on HTTPS, defaulting OFF until the real TLS infra exists — flip
// NEXT_PUBLIC_COLLAB_WS_ENABLED=true (and rebuild) once it does. Local dev is unaffected either way
// since plain `ws://` from `http://localhost` was never the problem.
export function isCollabRealtimeEnabled(): boolean {
  if (window.location.protocol !== 'https:') return true;
  return process.env.NEXT_PUBLIC_COLLAB_WS_ENABLED === 'true';
}

export function collabWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:1234`;
}
