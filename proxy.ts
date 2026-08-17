// Next 16 renamed middleware.ts to proxy.ts (node_modules/next/dist/docs/.../file-conventions/
// proxy.md) — this is the direct equivalent of the old `export { auth as middleware }` pattern,
// just under the new file/export name. `auth` is a plain function with no dependency on the
// literal name it's exported under.
export { auth as proxy } from './auth';

export const config = {
  // Protects page routes (redirects to /login via the authorized() callback + pages.signIn).
  // Deliberately excludes /api/* — API routes are not protected by bouncing to an HTML login
  // page (wrong response shape for fetch/XHR callers); each one re-verifies its own session and
  // returns 401 JSON instead (see lib/auth/session.ts's getCurrentUserId(), used throughout
  // app/api/*). Also excludes /login itself to avoid a redirect loop, and /invite — an invite
  // link's whole point is showing "you're invited to X" to someone who doesn't have a session
  // yet, so that page has to be reachable before auth, not gated behind it.
  matcher: ['/((?!api|login|invite|connect|_next/static|_next/image|favicon.ico).*)'],
};
