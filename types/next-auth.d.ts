import type { DefaultSession } from 'next-auth';

// Auth.js v5's default Session.user type has no `id` — auth.ts's session() callback attaches the
// app's own user id onto every session, this augmentation just tells TypeScript about it.
declare module 'next-auth' {
  interface Session {
    // issuedAt: the JWT's own `iat` claim in seconds, surfaced by auth.ts's session() callback so
    // getCurrentUserId() can reject sessions older than User.sessionsValidFrom. Optional because a
    // session minted before this shipped has no way to carry it — those are treated as valid, since
    // refusing every pre-existing session would sign the whole userbase out on deploy.
    user: { id: string; issuedAt?: number } & DefaultSession['user'];
  }
}
