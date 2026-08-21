'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { List, Calendar, FileText, MessageSquare, Building2 } from 'lucide-react';

// Same five icons as the real app's own nav rail (app/page.tsx), matching each feature exactly —
// a logged-out visitor should recognize the same icons once they're actually inside the app.
const FEATURES = [
  { icon: List, title: 'Tasks', description: 'Spaces, Folders, Lists, subtasks, and custom fields — organized your way.' },
  { icon: Calendar, title: 'Planner', description: 'A real Gantt-style calendar. Drag to reschedule, in Month, Week, or Day view.' },
  { icon: FileText, title: 'Docs', description: 'Real-time collaborative documents, nested wherever they make sense.' },
  { icon: MessageSquare, title: 'Chat', description: 'Channels and DMs, reactions and threads — built in, not bolted on.' },
  { icon: Building2, title: 'Office', description: 'A virtual floor plan showing who’s around and what room they’re in.' },
];

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
    <div className="min-h-screen bg-neutral-950 flex flex-col lg:flex-row">
      {/* Marketing side — backlog #7: this used to be nothing but the auth card below, dropping
          a logged-out visitor straight into a bare form with no explanation of what Siqt even is.
          ClickUp-style: a headline + short pitch + the same 5 feature icons the real app's own
          nav rail uses, so it's recognizable once someone's actually inside. */}
      <div className="flex-1 flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-blue-700 text-white font-black flex items-center justify-center shrink-0">
              S
            </div>
            <span className="text-white font-bold tracking-tight">Siqt</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
            One workspace for tasks, docs, and chat — running on your own server.
          </h1>
          <p className="text-neutral-400 text-base leading-relaxed mb-12 max-w-lg">
            Siqt brings Tasks, Planner, Docs, Chat, and a virtual Office together in one app —
            no third-party cloud in between. Your data stays on infrastructure you control.
          </p>

          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="w-9 h-9 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white mb-0.5">{f.title}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auth side — the exact same functional sign-in/signup card as before, just no longer
          carrying the entire page on its own. */}
      <div className="w-full lg:w-[420px] shrink-0 flex items-center justify-center border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-900/20 px-4 py-12">
        <div className="w-full max-w-sm">
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
    </div>
  );
}
