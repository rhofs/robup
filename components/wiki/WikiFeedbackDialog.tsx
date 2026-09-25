'use client';

import { useState } from 'react';
import { X, Bug, Lightbulb, Check } from 'lucide-react';
import type { HierarchyWorkspace } from '../../store/useTaskStore';
import { useWikiStore } from '../../store/useWikiStore';

// "Report a bug" / "Request a feature" from the wiki's quick links. Sends a title and details; the
// server turns them into a task in the list an admin chose (see the feedback route).
export default function WikiFeedbackDialog({
  workspace,
  kind,
  onClose,
  onOpenSettings,
}: {
  workspace: HierarchyWorkspace;
  kind: 'bug' | 'feature';
  onClose: () => void;
  // Given to owners/admins, so "no list chosen" comes with the way to fix it.
  onOpenSettings?: () => void;
}) {
  const feedbackListId = useWikiStore((s) => s.byWorkspace[workspace.id]?.feedbackListId ?? null);
  const sendFeedback = useWikiStore((s) => s.sendFeedback);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const isBug = kind === 'bug';
  const Icon = isBug ? Bug : Lightbulb;

  const send = async () => {
    if (!title.trim()) return;
    setState('sending');
    setError(null);
    const res = await sendFeedback(workspace.id, kind, title, details);
    if ('error' in res) {
      setError(res.error);
      setState('idle');
    } else setState('sent');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/70 backdrop-blur-xs p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-app-strong flex items-center gap-2">
            <Icon className={`w-4 h-4 ${isBug ? 'text-red-400' : 'text-amber-400'}`} />
            {isBug ? 'Report a bug' : 'Request a feature'}
          </h3>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-app-strong cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'sent' ? (
          <div className="p-6 text-center space-y-2">
            <span className="mx-auto w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Check className="w-5 h-5" />
            </span>
            <p className="text-sm text-app-strong font-medium">Thanks — it has been sent.</p>
            <p className="text-[12px] text-neutral-500">It is now a task the team will pick up.</p>
            <button onClick={onClose} className="mt-2 px-3 py-1.5 rounded-lg bg-neutral-800 text-[13px] text-app-strong cursor-pointer">
              Close
            </button>
          </div>
        ) : !feedbackListId ? (
          <div className="p-5 space-y-3">
            <p className="text-[13px] text-neutral-300">No list has been chosen for {isBug ? 'bug reports' : 'feature requests'} yet.</p>
            {onOpenSettings ? (
              <button onClick={onOpenSettings} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium cursor-pointer">
                Choose one in Wiki settings
              </button>
            ) : (
              <p className="text-[12px] text-neutral-500">Ask the owner or an admin to pick one in the wiki settings.</p>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isBug ? 'What went wrong, in a few words' : 'What would you like to be able to do?'}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-[14px] md:text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/70"
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder={isBug ? 'What did you do, what did you expect, and what happened instead?' : 'Why would it help? An example makes it easier.'}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-[14px] md:text-[13px] text-app-strong placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/70 resize-none"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[13px] text-neutral-400 hover:text-app-strong cursor-pointer">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={!title.trim() || state === 'sending'}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[13px] font-medium cursor-pointer"
              >
                {state === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
