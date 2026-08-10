'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type InviteInfo = { workspaceName: string; role: 'admin' | 'member' };

// Public page — excluded from proxy.ts's auth gate (same list as /login) — since the whole point
// is showing "you're invited to X" to someone who doesn't have a session yet. Signed-in and
// signed-out visitors see different actions below; both end up at the same accept call.
export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { status } = useSession();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invites/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInvite)
      .catch(() => setNotFound(true));
  }, [code]);

  const handleJoin = async () => {
    setError(null);
    setJoining(true);
    const res = await fetch(`/api/invites/${code}/accept`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || 'Could not join workspace');
      setJoining(false);
      return;
    }
    router.push(`/?workspace=${data.workspaceId}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded bg-blue-500 text-white font-bold flex items-center justify-center mx-auto mb-3">
            R
          </div>
          <h1 className="text-lg font-semibold text-white">RobUp</h1>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
          {notFound ? (
            <p className="text-xs text-neutral-400">This invite link is invalid or has been revoked.</p>
          ) : !invite ? (
            <p className="text-xs text-neutral-500">Loading invite…</p>
          ) : (
            <>
              <p className="text-xs text-neutral-400 mb-1">You've been invited to join</p>
              <p className="text-base font-semibold text-white mb-4">{invite.workspaceName}</p>

              {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}

              {status === 'loading' ? (
                <p className="text-xs text-neutral-500">Checking your session…</p>
              ) : status === 'authenticated' ? (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
                >
                  {joining ? 'Joining…' : `Join ${invite.workspaceName}`}
                </button>
              ) : (
                <div className="space-y-2">
                  <a
                    href={`/login?callbackUrl=${encodeURIComponent(`/invite/${code}`)}`}
                    className="block w-full bg-blue-600 hover:bg-blue-500 rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
                  >
                    Sign in to join
                  </a>
                  <a
                    href={`/login?mode=signup&callbackUrl=${encodeURIComponent(`/invite/${code}`)}`}
                    className="block w-full border border-neutral-700 hover:bg-neutral-800/60 rounded px-3 py-2 text-xs text-neutral-300 transition cursor-pointer"
                  >
                    Create an account to join
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
