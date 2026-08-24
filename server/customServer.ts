// Production-only. Wraps Next's own request handler in a plain http.Server (the documented
// custom-server pattern — see node_modules/next/dist/docs/01-app/02-guides/custom-server.md) so
// this one process can ALSO proxy WebSocket upgrades for the collab sidecar through the exact
// same port (3000) Cloudflare already routes correctly.
//
// Why this exists: production has no TLS termination in front of the Hocuspocus sidecar's own
// port (COLLAB_PORT, 1234) — getting Cloudflare to route a *second* port there needs a second
// Origin Rule, and Origin Rules were genuinely hard to even locate in the current Cloudflare
// dashboard during initial deployment (see PLANNING.md). Routing collab traffic through the
// already-working port 3000 instead avoids ever needing that fight: the browser connects to
// wss://<host>/collab (no port, same origin as the app itself), Cloudflare proxies it here
// exactly like any other request, and this server hands the upgraded connection straight to the
// real Hocuspocus process on localhost — a plain loopback hop, no TLS concern at that leg since
// it never leaves the machine.
//
// Local dev is completely unaffected: `npm run dev` still runs `next dev` + the collab sidecar as
// two separate processes on two separate ports (see package.json), since there's no mixed-content
// restriction to work around on plain http://localhost. This file only ever runs via
// start:prod/deploy:prod.
import { createServer } from 'http';
import next from 'next';
import httpProxy from 'http-proxy';

const port = parseInt(process.env.PORT || '3000', 10);
const collabPort = parseInt(process.env.COLLAB_PORT || '1234', 10);

const app = next({ dev: false });
const handle = app.getRequestHandler();

// xfwd forwards the original client's headers (incl. the auth session cookie) to Hocuspocus's own
// onAuthenticate hook, which reads it directly off the upgrade request — same mechanism already
// relied on locally, just proxied now instead of a direct connection.
const proxy = httpProxy.createProxyServer({
  target: { host: '127.0.0.1', port: collabPort },
  ws: true,
  xfwd: true,
});
proxy.on('error', (err) => {
  console.error('[customServer] collab proxy error:', err.message);
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/collab')) {
      proxy.ws(req, socket, head);
      return;
    }
    // Anything else (there shouldn't be any other WS traffic in production — Turbopack's own HMR
    // upgrade only exists under `next dev`) is simply not handled here; left alone rather than
    // destroyed in case Next itself ever registers its own upgrade listener on this same server.
  });

  server.listen(port, () => {
    console.log(`> Server listening on port ${port}, proxying /collab to 127.0.0.1:${collabPort}`);
  });
});
