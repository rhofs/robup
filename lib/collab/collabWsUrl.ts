// The Hocuspocus sidecar (server/collabServer.ts) listens on a plain, unencrypted WebSocket on
// port 1234 — fine locally (http://localhost), but production (siqt.no) has no TLS termination
// directly in front of that port. Fixed via server/customServer.ts: production now proxies
// `/collab` upgrade requests on the app's own port (already correctly routed through Cloudflare)
// straight through to the Hocuspocus process over loopback — so the browser only ever needs a
// same-origin, no-port wss:// connection, exactly like every other request this app makes.
//
// `isCollabRealtimeEnabled` still gates presence and chat's live-push signal (both pure "nice to
// have live" extras, never required for the app to function) behind an explicit opt-in on HTTPS —
// kept as a deliberate manual step even after the proxy above ships, so a real deploy can be
// verified working (Docs' own connection-status warning, lib/collab/CollabDocEditor.tsx, is the
// simplest way to check) before flipping NEXT_PUBLIC_COLLAB_WS_ENABLED=true and rebuilding.
// Local dev is unaffected either way — it was never gated, and never routes through the proxy.
export function isCollabRealtimeEnabled(): boolean {
  if (window.location.protocol !== 'https:') return true;
  return process.env.NEXT_PUBLIC_COLLAB_WS_ENABLED === 'true';
}

export function collabWsUrl(): string {
  if (window.location.protocol === 'https:') {
    return `wss://${window.location.host}/collab`;
  }
  return `ws://${window.location.hostname}:1234`;
}
