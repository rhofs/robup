'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useSessionStore } from '@/store/useSessionStore';

// Bridges next-auth/react's useSession() into useSessionStore so the rest of the app (which only
// ever reads useSessionStore().currentUserId, per that file's own comment) doesn't need to know
// real auth exists at all. Mounted once in app/page.tsx's PageContent.
export function SessionSync() {
  const { data: session, status } = useSession();
  // Guards against a sign-out loop: signOut() itself triggers a re-render before the session
  // actually clears, and firing it twice would fight the redirect it's performing.
  const clearingOrphanRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated') useSessionStore.getState().setCurrentUserId(session?.user?.id ?? null);
    if (status === 'unauthenticated') useSessionStore.getState().setCurrentUserId(null);
  }, [status, session?.user?.id]);

  // Orphaned-session recovery.
  //
  // Sessions are JWT-only (see auth.ts), so the cookie stays cryptographically valid even after
  // the User row it points at is gone — which happens on any database reset, and would happen to
  // a real person whose account is deleted. proxy.ts's `authorized` check only asks whether a
  // session exists, so the page renders; but every API route resolves identity through
  // getCurrentUserId(), which verifies the row actually exists and correctly returns null. The
  // result was an app that looked signed in and was completely inert: "No workspace", "Sign in to
  // see your tasks", and "Not authenticated" on every single action, with no way out because even
  // the sign-out control lives behind the broken UI.
  //
  // GET /api/users is the precise probe: it returns [] for an unauthenticated caller and always
  // includes the caller themselves otherwise. So "we hold a session, but the server doesn't list
  // us" means exactly one thing — the session outlived its user. Sign out so the normal login
  // flow takes over instead of leaving someone staring at a dead page.
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id || clearingOrphanRef.current) return;
    const myId = session.user.id;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/users');
        if (!res.ok || cancelled) return;
        const users: { id: string }[] = await res.json();
        if (cancelled || users.some((u) => u.id === myId)) return;
        clearingOrphanRef.current = true;
        await signOut({ callbackUrl: '/login' });
      } catch {
        // Network/parse failure says nothing about whether the session is valid — leave it alone
        // rather than signing someone out over a blip.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  return null;
}
