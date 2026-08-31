'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { List, Calendar, FileText, MessageSquare } from 'lucide-react';

// Same four icons as the real app's own nav rail (app/page.tsx), matching each feature exactly —
// a logged-out visitor should recognize the same icons once they're actually inside the app. Was
// five (Office included) — trimmed to the four the user actually asked to lead with, and the
// self-hosting/"your own server" pitch below was dropped entirely: Siqt isn't something a visitor
// can run on their own infrastructure, so claiming that was a real, direct-feedback-flagged
// overpromise ("we don't offer it on their own server"), not a style choice.
const FEATURES = [
  { icon: List, title: 'Tasks', description: 'Spaces, Lists, and subtasks — organized your way.' },
  { icon: Calendar, title: 'Planner', description: 'A visual monthly calendar. Drag a task to reschedule it.' },
  { icon: FileText, title: 'Docs', description: 'Real-time collaborative documents, right next to the work.' },
  { icon: MessageSquare, title: 'Chat', description: 'Channels and DMs, without leaving the app.' },
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
  // Forgot-password request, inline under the sign-in form. `forgotSent` is set regardless of the
  // response, since the route deliberately answers identically whether or not the address exists.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
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
    <div className="relative min-h-screen bg-neutral-950 flex flex-col lg:flex-row overflow-hidden">
      {/* A single soft radial glow instead of a flat black field — the previous version was
          honest about its content but visually inert. Pure CSS (no image asset), fixed behind
          everything (-z-10), sized generously so it reads as ambient light rather than a visible
          shape with an edge. */}
      <div
        className="pointer-events-none absolute -z-10 -top-40 -left-40 w-[720px] h-[720px] rounded-full opacity-[0.15] blur-3xl"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
        aria-hidden
      />
      {/* Marketing side — backlog #7: this used to be nothing but the auth card below, dropping
          a logged-out visitor straight into a bare form with no explanation of what Siqt even is.
          Copy trimmed to four features and rewritten to drop every self-hosting/"your own
          infrastructure" claim (see FEATURES' own comment) — simpler and, more importantly,
          actually true. */}
      {/* order-2 on mobile: stacked vertically, this marketing column came first and pushed the
          sign-in card entirely below the fold — you had to scroll down to log in at all. The card
          leads on phones now; on lg+ the row order is restored so the layout is unchanged there. */}
      <div className="order-2 lg:order-1 flex-1 flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
        <div className="max-w-xl">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-black flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
              S
            </div>
            <span className="text-app-strong font-bold tracking-tight text-lg">Siqt</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-app-strong tracking-tight leading-[1.1] mb-5">
            Tasks, planning, docs, and chat — <span className="text-blue-400">one place</span>.
          </h1>
          {/* Deliberately plain, not marketing copy: this is a personal tool, and the previous
              "brings your team's work together..." blurb read as a real commercial product to
              anyone who landed here without context. Per direct instruction — "så ikke randoms
              tror det er noe 'ekte'." */}
          <p className="text-neutral-400 text-base leading-relaxed mb-14 max-w-md">
            Robins Project management tool
          </p>

          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                  <f.icon className="w-4.5 h-4.5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-app-strong mb-0.5">{f.title}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auth side — the exact same functional sign-in/signup card as before (form/handlers
          untouched), just a slightly more polished shell (rounded-xl, a touch more padding and
          shadow) to match the marketing side's own refresh. */}
      <div className="order-1 lg:order-2 w-full lg:w-[420px] shrink-0 flex items-center justify-center border-b lg:border-b-0 lg:border-l border-neutral-800 bg-neutral-900/20 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl shadow-black/40">
          <div className="flex mb-4 border border-neutral-800 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 text-xs py-1.5 cursor-pointer transition ${
                mode === 'signin' ? 'bg-neutral-800 text-app-strong' : 'text-neutral-400 hover:text-neutral-200'
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
                mode === 'signup' ? 'bg-neutral-800 text-app-strong' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Create account
            </button>
          </div>

          <button
            type="button"
            onClick={() => signIn('google', { redirectTo: callbackUrl })}
            className="w-full flex items-center justify-center gap-2 bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong hover:bg-neutral-800/60 transition cursor-pointer mb-4"
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
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-2 text-xs font-medium text-white transition cursor-pointer"
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            {/* Sign-in only — there's nothing to recover while creating an account. Kept inline
                rather than on its own page: the request is a single field, and the confirmation
                is deliberately the same whether or not the address exists (see the route), so
                there's no follow-up state worth a separate route for. */}
            {mode === 'signin' && (
              <div className="pt-1 text-center">
                {forgotSent ? (
                  <p className="text-[11px] text-neutral-400">
                    If an account uses that email, a reset link is on its way.
                  </p>
                ) : forgotOpen ? (
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Your email address"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForgotOpen(false)}
                        className="flex-1 border border-neutral-700 hover:border-neutral-600 rounded px-3 py-1.5 text-[11px] text-neutral-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!forgotEmail.trim() || forgotBusy}
                        onClick={async () => {
                          setForgotBusy(true);
                          await fetch('/api/auth/forgot-password', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: forgotEmail.trim() }),
                          }).catch(() => {});
                          setForgotBusy(false);
                          // Shown regardless of the response, matching the route's own
                          // deliberately identical answer either way.
                          setForgotSent(true);
                        }}
                        className="flex-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed rounded px-3 py-1.5 text-[11px] text-app-strong font-medium cursor-pointer"
                      >
                        {forgotBusy ? 'Sending…' : 'Send reset link'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotOpen(true);
                    }}
                    className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    Forgot your password?
                  </button>
                )}
              </div>
            )}
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
