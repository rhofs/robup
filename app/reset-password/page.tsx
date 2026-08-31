'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// Landing page for the emailed reset link. Its own route rather than a mode of /login: the token
// lives in the URL, and mixing that into the sign-in form's own state machine (which already
// juggles sign-in vs. sign-up) would make both harder to follow.
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Checked here purely as a typo guard; the server never sees `confirm` and enforces the real
    // length rule itself.
    if (password !== confirm) {
      setError('The two passwords don&rsquo;t match');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      // Straight to sign-in rather than auto-authenticating: the new password should be typed
      // once while it's still fresh in mind.
      setTimeout(() => router.push('/login'), 1800);
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error ?? 'Could not reset your password');
  };

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-app-strong font-semibold">This link is incomplete</p>
        <p className="text-xs text-neutral-400">Open the link straight from your email, or request a new one.</p>
        <Link href="/login" className="inline-block text-xs text-blue-400 hover:text-blue-300">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-2">
        <p className="text-sm text-app-strong font-semibold">Password updated</p>
        <p className="text-xs text-neutral-400">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <h1 className="text-sm font-bold text-app-strong mb-1">Choose a new password</h1>
        <p className="text-xs text-neutral-400">At least 8 characters.</p>
      </div>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        minLength={8}
        required
        className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat new password"
        required
        className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-blue-500"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password || !confirm}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-3 py-2 text-xs font-medium text-white cursor-pointer"
      >
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl shadow-black/40">
        {/* useSearchParams needs a Suspense boundary for a production build — same requirement
            app/login/page.tsx already documents for its own callbackUrl handling. */}
        <Suspense fallback={<p className="text-xs text-neutral-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
