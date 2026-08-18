'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type InviteInfo = { name: string; initials: string; color: string };
type Outcome = 'connected' | 'requested';

// Public page — excluded from proxy.ts's auth gate (same list as /login and /invite). Auto-fires
// the request call the moment it detects an authenticated session — no separate "Join" click.
// Unlike WorkspaceInvite's own /invite/[code] page, the accept step lands with the LINK OWNER, not
// here: this just sends a request (POST /api/connect/[code]/accept, `status: 'requested'`), the
// owner sees it in their Connections tab and explicitly accepts/declines it. The one exception —
// `status: 'connected'` — covers two cases the route itself already resolves: the owner had
// separately opened *my* link first (mutual auto-accept), or we were already connected.
export default function ConnectPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { status } = useSession();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fired, setFired] = useState(false); // guards against double-POST on re-render

  useEffect(() => {
    fetch(`/api/connect/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInvite)
      .catch(() => setNotFound(true));
  }, [code]);

  useEffect(() => {
    if (status !== 'authenticated' || !invite || fired) return;
    setFired(true);
    fetch(`/api/connect/${code}/accept`, { method: 'POST' })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => (ok ? setOutcome(data.status) : setError(data?.error || 'Could not connect')));
  }, [status, invite, fired, code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded bg-blue-500 text-white font-bold flex items-center justify-center mx-auto mb-3">S</div>
          <h1 className="text-lg font-semibold text-white">Siqt</h1>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 text-center">
          {notFound ? (
            <p className="text-xs text-neutral-400">This connect link is invalid or has been revoked.</p>
          ) : !invite ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : outcome === 'connected' ? (
            <>
              <p className="text-xs text-neutral-400 mb-1">You&apos;re now connected with</p>
              <p className="text-base font-semibold text-white mb-4">{invite.name}</p>
              <button
                onClick={() => router.push('/?view=directMessages')}
                className="w-full bg-blue-600 hover:bg-blue-500 rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
              >
                Open Network
              </button>
            </>
          ) : outcome === 'requested' ? (
            <>
              <p className="text-xs text-neutral-400 mb-1">Connection request sent to</p>
              <p className="text-base font-semibold text-white mb-4">{invite.name}</p>
              <p className="text-[11px] text-neutral-500 mb-4">They&apos;ll need to accept it before you can message each other.</p>
              <button
                onClick={() => router.push('/?view=directMessages')}
                className="w-full border border-neutral-700 hover:bg-neutral-800/60 rounded px-3 py-2 text-xs text-neutral-300 transition cursor-pointer"
              >
                Back to Network
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-400 mb-1">Connect with</p>
              <p className="text-base font-semibold text-white mb-4">{invite.name}</p>
              {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}
              {status === 'loading' ? (
                <p className="text-xs text-neutral-500">Checking your session…</p>
              ) : (
                <div className="space-y-2">
                  <a
                    href={`/login?callbackUrl=${encodeURIComponent(`/connect/${code}`)}`}
                    className="block w-full bg-blue-600 hover:bg-blue-500 rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
                  >
                    Sign in to connect
                  </a>
                  <a
                    href={`/login?mode=signup&callbackUrl=${encodeURIComponent(`/connect/${code}`)}`}
                    className="block w-full border border-neutral-700 hover:bg-neutral-800/60 rounded px-3 py-2 text-xs text-neutral-300 transition cursor-pointer"
                  >
                    Create an account to connect
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
