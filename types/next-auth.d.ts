import type { DefaultSession } from 'next-auth';

// Auth.js v5's default Session.user type has no `id` — auth.ts's session() callback attaches the
// app's own user id onto every session, this augmentation just tells TypeScript about it.
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
