'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, Globe, X } from 'lucide-react';

type PublicProfile = {
  id: string;
  name: string;
  initials: string;
  color: string;
  title: string | null;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
};

type ViewProfileModalProps = {
  userId: string | null;
  onClose: () => void;
  // Omitted at call sites that already have their own "message this person" affordance right
  // next to the trigger (redundant there) — present for Connections/Network, where this modal is
  // the more natural place to hand off into a DM once you're already looking at someone's profile.
  onStartDM?: (userId: string) => void;
};

// Read-only "someone else's profile" view (backlog #2, Network/Connections right-click+click
// feedback) — reuses GET /api/users/[id]'s existing publicUserSelect shape (already the one place
// this data safely leaves the server for a non-self id, see lib/prisma.ts) rather than adding a
// second endpoint. Deliberately not ProfilePage.tsx with an isEditable=false flag: that component
// is built entirely around inline click-to-edit fields (AvatarEditor/BioBlock/EditableField all
// assume they can write back), and threading a read-only mode through every one of them would be
// more code than this plain, separate display component.
export default function ViewProfileModal({ userId, onClose, onStartDM }: ViewProfileModalProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setProfile(null);
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <AnimatePresence>
      {userId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Profile</span>
              <button onClick={onClose} className="text-neutral-500 hover:text-white cursor-pointer -mt-1 -mr-1 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {loading || !profile ? (
              <div className="py-8 text-center text-xs text-neutral-500">{loading ? 'Loading…' : 'Could not load this profile.'}</div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-14 h-14 rounded-full text-base font-bold flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: profile.color }}
                    >
                      {profile.initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-white truncate">{profile.name}</div>
                    {profile.title && <div className="text-xs text-neutral-500 truncate">{profile.title}</div>}
                  </div>
                </div>

                {profile.bio && <p className="text-xs text-neutral-300 whitespace-pre-wrap">{profile.bio}</p>}

                {(profile.linkedinUrl || profile.websiteUrl) && (
                  <div className="space-y-1 pt-1">
                    {profile.linkedinUrl && (
                      <a
                        href={profile.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 truncate"
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" /> {profile.linkedinUrl}
                      </a>
                    )}
                    {profile.websiteUrl && (
                      <a
                        href={profile.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 truncate"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" /> {profile.websiteUrl}
                      </a>
                    )}
                  </div>
                )}

                {onStartDM && (
                  <button
                    onClick={() => {
                      onStartDM(profile.id);
                      onClose();
                    }}
                    className="w-full text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white py-2 rounded cursor-pointer transition"
                  >
                    Send message
                  </button>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
