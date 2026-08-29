'use client';

import { X, Settings, Link2, Share2, Download } from 'lucide-react';
import { AppUser } from '../store/useTaskStore';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

function InstallRow() {
  const { canInstall, isStandalone, isIOS, promptInstall } = useInstallPrompt();
  if (isStandalone) return null;
  if (canInstall) {
    return (
      <button
        onClick={promptInstall}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
      >
        <Download className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="text-xs text-neutral-300">Install Siqt as an app</span>
      </button>
    );
  }
  if (isIOS) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 text-left">
        <Download className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        <span className="text-xs text-neutral-500">On iPhone/iPad: tap Share, then &quot;Add to Home Screen&quot;</span>
      </div>
    );
  }
  return null;
}

// Personal/account-level settings — distinct from the nav-rail's "Workspace settings" (which nav
// tabs are visible, workspace-wide). Currently just houses the two small utility actions that
// used to live as cramped icon buttons in the old sidebar identity strip (copy calendar link,
// connect Google for Doc export) — a real home for them, and a place future personal-account
// settings can land without needing a new panel each time.
export default function AccountSettingsPanel({
  user,
  onClose,
  onCopyCalendarLink,
}: {
  user: AppUser;
  onClose: () => void;
  onCopyCalendarLink: () => void;
}) {
  const connected = !!user.googleEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[380px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
            <Settings className="w-4 h-4" /> Settings
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-3 space-y-1">
          <button
            onClick={onCopyCalendarLink}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-neutral-800/60 cursor-pointer text-left transition"
          >
            <Link2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-xs text-neutral-300">Copy personal calendar feed link</span>
          </button>
          <a
            href={connected ? undefined : '/api/google/oauth/start'}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-left transition ${
              connected ? '' : 'hover:bg-neutral-800/60 cursor-pointer'
            }`}
          >
            <Share2 className={`w-3.5 h-3.5 shrink-0 ${connected ? 'text-green-500' : 'text-neutral-400'}`} />
            <span className="text-xs text-neutral-300">
              {connected ? `Google connected as ${user.googleEmail} — Docs export & Calendar sync` : 'Connect Google account for Docs export & Calendar sync'}
            </span>
          </a>
          <InstallRow />
        </div>
      </div>
    </div>
  );
}
