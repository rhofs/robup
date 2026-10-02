'use client';

import SiqtMark from '../../components/SiqtMark';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { List, Calendar, FileText, MessageSquare } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { motion } from 'framer-motion';

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
  // Read after mount, never during render: this page is server-rendered, and asking Capacitor
  // whether it is native during render makes the server's HTML and the client's first pass
  // disagree. The same lesson the layout preference cost a round over.
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(Capacitor.isNativePlatform()), []);

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

  // One look for every screen size, taken from the phone app: soft-cornered dark surfaces, a pill
  // switch like the bottom nav's, 48 px fields and buttons. The old version was a two-column
  // marketing layout on desktop and a different stack on phones; "Jeg vil gjerne at både desktop og
  // mobil appen skal se noenlunde lik ut, føles som samme app, og at den ser mye penere og ryddigere
  // ut." Fields are 16 px text on purpose: iOS zooms the page into any smaller input on focus.
  const field =
    'w-full h-12 rounded-2xl bg-neutral-800/70 border border-transparent px-4 text-base text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/60 focus:bg-neutral-800 transition';

  return (
    <div className="relative min-h-dvh bg-neutral-950 flex flex-col items-center justify-center overflow-hidden px-4 pt-[calc(env(safe-area-inset-top)+32px)] pb-[calc(env(safe-area-inset-bottom)+32px)]">
      {/* Ambient light from above and a faint grid that fades out — depth without an image. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -z-0 left-1/2 -translate-x-1/2 -top-64 w-[900px] h-[640px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #3b82f6, transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black, transparent)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center mb-7">
          <SiqtMark className="w-16 h-16 mb-5 drop-shadow-[0_10px_28px_rgb(59_130_246/0.5)]" />
          <h1 className="text-[26px] sm:text-[30px] font-bold text-app-strong tracking-tight leading-[1.15]">
            Tasks, planning, docs and chat — <span className="text-blue-400">one place</span>.
          </h1>
          {/* Deliberately plain, not marketing copy: this is a personal tool, and an earlier
              "brings your team's work together..." blurb read as a real commercial product to
              anyone who landed here without context — "så ikke randoms tror det er noe 'ekte'." */}
          <p className="text-neutral-500 text-sm mt-2.5">Robins Project management tool</p>
        </div>

        <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/[0.06] rounded-[28px] p-5 shadow-2xl shadow-black/50">
          {/* The same pill switch as the phone's create sheet and bottom nav: blue tint, faint glow. */}
          <div className="relative flex rounded-full bg-neutral-800/70 p-1 mb-5">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`relative flex-1 h-9 rounded-full text-[14px] font-semibold cursor-pointer transition-colors ${
                  mode === m ? 'text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="loginModePill"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-blue-500/15 shadow-[0_0_12px_1px_rgb(59_130_246/0.28)]"
                  />
                )}
                <span className="relative">{m === 'signin' ? 'Sign in' : 'Create account'}</span>
              </button>
            ))}
          </div>

          {/* Google is hidden inside the app, and this is a rule rather than a preference: Google
              deliberately refuses OAuth inside an embedded WebView, because any app could read what
              you type in its own window. The button could never work here, and a button that cannot
              work is worse than none — someone presses it, gets a server error, and reasonably
              concludes their account is broken. That is exactly what happened to a colleague signing
              in for the first time.

              Anyone whose account was made with Google has no password, so the note below points at
              the one route that gives them one. The web login is unchanged. */}
          {inApp ? (
            <div className="mb-4 rounded-2xl bg-neutral-800/50 px-4 py-3">
              <p className="text-[13px] text-neutral-400">
                The app signs in with email and password. Google sign-in only works in a browser.
              </p>
              <p className="text-[13px] text-neutral-500 mt-1">
                Made your account with Google? Use <span className="text-neutral-300">Forgot password</span>{' '}
                below to set one — it works for Google accounts too.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => signIn('google', { redirectTo: callbackUrl })}
                className="w-full h-12 flex items-center justify-center gap-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700/80 text-[15px] font-semibold text-app-strong transition cursor-pointer"
              >
                <GoogleMark />
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-neutral-800" />
                <span className="text-[11px] text-neutral-500 uppercase tracking-wider">or</span>
                <div className="h-px flex-1 bg-neutral-800" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-2.5">
            {mode === 'signup' && (
              <input type="text" placeholder="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
            )}
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
            {error && <p className="text-[13px] text-red-400 px-1">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-2xl bg-blue-500 hover:bg-blue-400 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-[15px] font-semibold text-white shadow-[0_6px_24px_-6px_rgb(59_130_246/0.7)] transition cursor-pointer !mt-4"
            >
              {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            {/* Sign-in only — there's nothing to recover while creating an account. Kept inline
                rather than on its own page: the request is a single field, and the confirmation
                is deliberately the same whether or not the address exists (see the route), so
                there's no follow-up state worth a separate route for. */}
            {mode === 'signin' && (
              <div className="pt-2 text-center">
                {forgotSent ? (
                  <p className="text-[13px] text-neutral-400">If an account uses that email, a reset link is on its way.</p>
                ) : forgotOpen ? (
                  <div className="space-y-2.5 text-left">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Your email address"
                      className={field}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setForgotOpen(false)}
                        className="h-11 rounded-2xl bg-neutral-800 text-[14px] font-semibold text-neutral-400 cursor-pointer"
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
                        className="h-11 rounded-2xl bg-app-strong text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed text-[14px] font-semibold cursor-pointer"
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
                    className="text-[13px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                  >
                    Forgot your password?
                  </button>
                )}
              </div>
            )}
          </form>
        </div>

        {/* What's inside, as the app's own launcher tiles rather than a marketing grid. */}
        <div className="grid grid-cols-4 gap-2 mt-7">
          {FEATURES.map((f) => (
            <div key={f.title} title={f.description} className="flex flex-col items-center gap-1.5">
              <div className="w-11 h-11 rounded-2xl bg-neutral-900 border border-white/[0.06] flex items-center justify-center">
                <f.icon className="w-[18px] h-[18px] text-blue-400" />
              </div>
              <span className="text-[12px] font-medium text-neutral-400">{f.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Google's "G", in its own colours — the brand mark people look for on this button.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
