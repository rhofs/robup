'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useSessionStore } from '@/store/useSessionStore';

// Bridges next-auth/react's useSession() into useSessionStore so the rest of the app (which only
// ever reads useSessionStore().currentUserId, per that file's own comment) doesn't need to know
// real auth exists at all. Mounted once in app/page.tsx's PageContent.
export function SessionSync() {
  const { data: session, status } = useSession();
  useEffect(() => {
    if (status === 'authenticated') useSessionStore.getState().setCurrentUserId(session?.user?.id ?? null);
    if (status === 'unauthenticated') useSessionStore.getState().setCurrentUserId(null);
  }, [status, session?.user?.id]);
  return null;
}
