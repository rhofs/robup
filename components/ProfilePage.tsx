'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Image as ImageIcon, Pencil, Link2, Globe, AtSign, X, AlertTriangle, ChevronRight } from 'lucide-react';
import { AppUser } from '../store/useTaskStore';
import { EditableField } from './OfficePage';

type ProfilePageProps = {
  currentUser: AppUser | null;
  onUpdate: (patch: { avatarUrl?: string | null; bio?: string | null; linkedinUrl?: string | null; websiteUrl?: string | null }) => void;
  // Separate from onUpdate above (which is fire-and-forget/always-optimistic, see
  // useTaskStore.ts's own updateUser) — a taken/invalid username is a real, expected outcome that
  // needs to actually reach the UI, not be silently swallowed.
  onSetUsername: (username: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
};

// "Me" profile page — reached by clicking the avatar in the new sidebar zone. Picture and bio
// follow the exact same "plain URL string, inline click-to-edit" precedent Space.coverImageUrl
// already established (components/SpaceHome.tsx's CoverBanner/DescriptionBlock) — this app has no
// file/blob storage, so a real upload was never in scope. LinkedIn/website reuse the shared
// EditableField (exported from OfficePage.tsx, where it was previously private) rather than a
// third copy-paste of the same click-to-edit input.
export default function ProfilePage({ currentUser, onUpdate, onSetUsername }: ProfilePageProps) {
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Sign in to see your profile.
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-sm font-semibold text-app-strong">My Profile</h2>
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded p-5 space-y-4">
        <div className="flex items-center gap-4">
          <AvatarEditor user={currentUser} onCommit={(url) => onUpdate({ avatarUrl: url })} />
          <div className="text-lg font-semibold text-app-strong">{currentUser.name}</div>
        </div>

        <BioBlock value={currentUser.bio} onCommit={(value) => onUpdate({ bio: value })} />

        <div className="space-y-1.5 pt-1">
          <UsernameField value={currentUser.username} onCommit={onSetUsername} />
          <EditableField
            icon={Link2}
            value={currentUser.linkedinUrl}
            placeholder="Add your LinkedIn URL..."
            onCommit={(v) => onUpdate({ linkedinUrl: v })}
          />
          <EditableField
            icon={Globe}
            value={currentUser.websiteUrl}
            placeholder="Add a website / other social link..."
            onCommit={(v) => onUpdate({ websiteUrl: v })}
          />
        </div>
      </div>

      <DangerZone user={currentUser} />
    </div>
  );
}

// Deleting your own account entirely — distinct from the Team panel's "remove from workspace"
// (app/page.tsx), which only ever un-links membership, never touches the account itself. This is
// the one place a whole User row can be destroyed, and it only ever acts on the signed-in
// caller's own id (enforced again server-side in DELETE /api/users/[id], not just here). Needs
// re-proving identity before it fires — password re-entry for Credentials accounts, or typing
// your exact email for Google-only accounts (no password to check against).
//
// Collapsed behind its own expand toggle, not shown outright on page load — an extra layer of
// friction before the red "delete" UI is even visible at all, on top of the confirm step inside
// it. Collapsing back on cancel/close also resets the confirm step, so re-expanding always starts
// from the same neutral state.
function DangerZone({ user }: { user: AppUser }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setConfirming(false);
    setPassword('');
    setConfirmEmail('');
    setError(null);
  };

  const collapse = () => {
    setExpanded(false);
    reset();
  };

  const handleDelete = async () => {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user.hasPassword ? { password } : { confirmEmail }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || 'Could not delete account');
      setBusy(false);
      return;
    }
    await signOut({ redirectTo: '/login' });
  };

  if (!expanded) {
    return (
      <div className="max-w-xl mx-auto border border-neutral-800/80 rounded">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between px-5 py-3 text-left cursor-pointer group"
        >
          <span className="text-xs font-medium text-neutral-400 group-hover:text-neutral-300">Danger zone</span>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto border border-red-900/50 bg-red-950/10 rounded p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-red-400">Danger zone</div>
            <p className="text-[11px] text-neutral-500 mt-0.5">Deleting your account is permanent — every task, comment, and doc tied only to you goes with it. This can't be undone.</p>
          </div>
        </div>
        <button onClick={collapse} title="Collapse" className="shrink-0 text-neutral-500 hover:text-neutral-300 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="text-[11px] text-red-400 hover:text-red-300 border border-red-900/60 hover:bg-red-950/40 rounded px-3 py-1.5 cursor-pointer transition"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-2">
          {user.hasPassword ? (
            <input
              type="password"
              autoFocus
              placeholder="Confirm your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-red-500"
            />
          ) : (
            <input
              type="email"
              autoFocus
              placeholder={`Type "${user.email ?? 'your email'}" to confirm`}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-xs text-app-strong focus:outline-none focus:border-red-500"
            />
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={busy || (user.hasPassword ? !password : !confirmEmail)}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs py-2 rounded font-medium cursor-pointer transition"
            >
              Permanently delete
            </button>
            <button onClick={reset} className="flex-1 border border-neutral-700 hover:border-neutral-600 text-neutral-300 text-xs py-2 rounded cursor-pointer transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AvatarEditor({ user, onCommit }: { user: AppUser; onCommit: (url: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.avatarUrl || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(user.avatarUrl || '');
              setEditing(false);
            }
          }}
          placeholder="Paste an image URL…"
          className="w-56 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-app-strong focus:outline-none"
        />
        <button onClick={commit} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded cursor-pointer">
          Save
        </button>
        <button
          onClick={() => {
            setDraft(user.avatarUrl || '');
            setEditing(false);
          }}
          className="text-neutral-400 hover:text-app-strong cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="group relative shrink-0 cursor-pointer" title="Change photo">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} className="w-16 h-16 rounded-full object-cover" />
      ) : (
        <span
          className="w-16 h-16 rounded-full text-lg font-bold flex items-center justify-center text-white"
          style={{ backgroundColor: user.color }}
        >
          {user.initials}
        </span>
      )}
      <span className="absolute inset-0 rounded-full bg-scrim/0 group-hover:bg-scrim/50 flex items-center justify-center transition">
        <ImageIcon className="w-4 h-4 text-app-strong opacity-0 group-hover:opacity-100" />
      </span>
    </button>
  );
}

// Not the shared EditableField (used for LinkedIn/website below) — those are fire-and-forget, and
// a taken/invalid username is a real outcome someone needs to actually see, not silently swallow.
// The person's own username is what someone else now has to already know to send a connection
// request (app/api/connections/lookup replaced open name search) — shown as "@handle" once set,
// same convention as Twitter/Discord/etc.
function UsernameField({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (username: string | null) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Live "is this handle free" hint while typing (GET /api/users/username-available). Advisory
  // only — the unique constraint on User.username plus PATCH's own P2002 catch stay the real
  // guarantee, since someone else can always claim a name between this check and the save. What
  // this fixes is only *when* you find out: before, a taken username failed at Save with no
  // warning while choosing it.
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  const trimmedDraft = draft.trim().toLowerCase();
  const unchanged = trimmedDraft === (value || '');

  useEffect(() => {
    if (!editing || !trimmedDraft || unchanged) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    // Debounced, not per-keystroke: an availability lookup mid-word ("ro", "rob", "robi") answers
    // a question nobody asked yet, and every one of those is a real round trip.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/username-available?username=${encodeURIComponent(trimmedDraft)}`);
        if (!res.ok) {
          setAvailability('idle');
          return;
        }
        const data = await res.json();
        setAvailability(data.available ? 'available' : data.reason === 'invalid' ? 'invalid' : 'taken');
      } catch {
        // A failed check says nothing about the name — stay quiet rather than claim it's taken.
        setAvailability('idle');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, trimmedDraft, unchanged]);

  const commit = async () => {
    const trimmed = draft.trim().toLowerCase();
    if (trimmed === (value || '')) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    const result = await onCommit(trimmed || null);
    setSaving(false);
    if (result.ok) {
      setError(null);
      setEditing(false);
    } else {
      setError(result.error);
    }
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <AtSign className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
          <input
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(value || '');
                setError(null);
                setEditing(false);
              }
            }}
            placeholder="username"
            className="flex-1 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-app-strong focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={commit}
            // Blocked on a known-taken name rather than letting it fail at the server: the check
            // is advisory, but there's no reason to send a write we already know will 409.
            disabled={saving || availability === 'taken' || availability === 'checking'}
            className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 cursor-pointer shrink-0"
          >
            Save
          </button>
        </div>
        {error && <p className="text-[10px] text-red-400 pl-5">{error}</p>}
        {!error && availability === 'checking' && <p className="text-[10px] text-neutral-500 pl-5">Checking…</p>}
        {!error && availability === 'available' && <p className="text-[10px] text-green-400 pl-5">@{trimmedDraft} is available</p>}
        {!error && availability === 'taken' && <p className="text-[10px] text-red-400 pl-5">@{trimmedDraft} is already taken</p>}
        {!error && availability === 'invalid' && (
          <p className="text-[10px] text-neutral-500 pl-5">3–20 characters: lowercase letters, numbers, underscores.</p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full flex items-center gap-1.5 text-xs text-left cursor-pointer group"
    >
      <AtSign className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
      {value ? (
        <span className="text-neutral-300 group-hover:text-blue-400">{value}</span>
      ) : (
        <span className="text-neutral-500 group-hover:text-blue-400 italic">Set a username so people can find you...</span>
      )}
    </button>
  );
}

function BioBlock({ value, onCommit }: { value: string | null; onCommit: (value: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || null);
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value || '');
            setEditing(false);
          }
        }}
        rows={3}
        placeholder="Write a short bio…"
        className="w-full bg-neutral-950/60 border border-blue-500 rounded px-3 py-2 text-xs text-app-strong focus:outline-none resize-none"
      />
    );
  }

  return (
    <div onClick={() => setEditing(true)} className="group flex items-start gap-2 px-3 py-2 rounded hover:bg-neutral-800/40 cursor-text -mx-3">
      {value ? (
        <p className="text-xs text-neutral-300 whitespace-pre-wrap flex-1">{value}</p>
      ) : (
        <p className="text-xs text-neutral-500 italic flex-1">Write a short bio…</p>
      )}
      <Pencil className="w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
    </div>
  );
}
