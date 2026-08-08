'use client';

import { useState } from 'react';
import { Image as ImageIcon, Pencil, Link2, Globe, X } from 'lucide-react';
import { AppUser } from '../store/useTaskStore';
import { EditableField } from './OfficePage';

type ProfilePageProps = {
  currentUser: AppUser | null;
  onUpdate: (patch: { avatarUrl?: string | null; bio?: string | null; linkedinUrl?: string | null; websiteUrl?: string | null }) => void;
};

// "Me" profile page — reached by clicking the avatar in the new sidebar zone. Picture and bio
// follow the exact same "plain URL string, inline click-to-edit" precedent Space.coverImageUrl
// already established (components/SpaceHome.tsx's CoverBanner/DescriptionBlock) — this app has no
// file/blob storage, so a real upload was never in scope. LinkedIn/website reuse the shared
// EditableField (exported from OfficePage.tsx, where it was previously private) rather than a
// third copy-paste of the same click-to-edit input.
export default function ProfilePage({ currentUser, onUpdate }: ProfilePageProps) {
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto text-[11px] text-neutral-500 px-1 py-8 text-center border border-dashed border-neutral-800 rounded">
        Pick "You are: ..." in the sidebar to see your profile.
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="text-sm font-semibold text-white">My Profile</h2>
      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded p-5 space-y-4">
        <div className="flex items-center gap-4">
          <AvatarEditor user={currentUser} onCommit={(url) => onUpdate({ avatarUrl: url })} />
          <div className="text-lg font-semibold text-white">{currentUser.name}</div>
        </div>

        <BioBlock value={currentUser.bio} onCommit={(value) => onUpdate({ bio: value })} />

        <div className="space-y-1.5 pt-1">
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
          className="w-56 bg-neutral-950 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
        />
        <button onClick={commit} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded cursor-pointer">
          Save
        </button>
        <button
          onClick={() => {
            setDraft(user.avatarUrl || '');
            setEditing(false);
          }}
          className="text-neutral-400 hover:text-white cursor-pointer"
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
      <span className="absolute inset-0 rounded-full bg-neutral-950/0 group-hover:bg-neutral-950/50 flex items-center justify-center transition">
        <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
      </span>
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
        className="w-full bg-neutral-950/60 border border-blue-500 rounded px-3 py-2 text-xs text-white focus:outline-none resize-none"
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
