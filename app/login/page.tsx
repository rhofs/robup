'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

// Thin Suspense wrapper around the real page — useSearchParams() (needed below for
// callbackUrl/mode) requires one for production builds, same precedent as app/page.tsx's own
// PageContent split (see PLANNING.md's browser back/forward session).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to land after a successful sign-in/sign-up — defaults to the app shell, but an invite
  // link routes through here as /login?callbackUrl=/invite/[code] so the person ends up back on
  // the invite page (now signed in) instead of the plain dashboard. Auth.js's own auto-redirect
  // to this page (when an unauthenticated visit hits proxy.ts) can hand back an *absolute*
  // callbackUrl built from its own inferred origin rather than the browser's actual one — harmless
  // when that happens to be the same host, but on a LAN a second machine reaching this app via
  // e.g. http://192.168.1.51:3000 got redirected back to http://localhost:3000/ after signing
  // in — an address that resolves to *that machine's own* loopback, not this server. Since a
  // same-app redirect should never actually need to leave the current origin, stripping any
  // protocol+host prefix down to just the path+query makes this correct regardless of which
  // origin is serving the app.
  const rawCallbackUrl = searchParams.get('callbackUrl') || '/';
  const callbackUrl = rawCallbackUrl.replace(/^https?:\/\/[^/]+/, '') || '/';
  const [mode, setMode] = useState<'signin' | 'signup'>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error || 'Could not create account');
          setBusy(false);
          return;
        }
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Invalid email or password');
        setBusy(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Something went wrong');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded bg-blue-500 text-white font-bold flex items-center justify-center mx-auto mb-3">
            Q
          </div>
          <h1 className="text-lg font-semibold text-white">Qvip</h1>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex mb-4 border border-neutral-800 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 text-xs py-1.5 cursor-pointer transition ${
                mode === 'signin' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 text-xs py-1.5 cursor-pointer transition ${
                mode === 'signup' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Create account
            </button>
          </div>

          <button
            type="button"
            onClick={() => signIn('google', { redirectTo: callbackUrl })}
            className="w-full flex items-center justify-center gap-2 bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white hover:bg-neutral-800/60 transition cursor-pointer mb-4"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-[10px] text-neutral-500 uppercase tracking-wide">or</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
