'use client';

import { useState } from 'react';
import { Building2, CalendarIcon, CheckCircle2, FileText, ListChecks, MessageSquare, X } from 'lucide-react';

// First-run walkthrough. Shown once per person (User.onboardedAt, so it follows them across
// devices rather than living in localStorage), and dismissible at every step — reported directly:
// "du kommer inn, og det er ikke lett å vite hvor man skal starte."
//
// Deliberately a short guided sequence rather than an interface tour with callouts pinned to real
// elements. Those break silently whenever the thing they point at moves, and this app's layout has
// changed a lot lately; a self-contained panel that *explains* and then hands over one real action
// stays correct on its own.

const AREAS = [
  { icon: ListChecks, name: 'Spaces', text: 'Your work, organised as Spaces → Lists → Tasks. Assign people, set dates, drag things around.' },
  { icon: CalendarIcon, name: 'Planner', text: 'Everything with a date, on a calendar. Drag to reschedule, and sync it to your own Google Calendar.' },
  { icon: FileText, name: 'Docs', text: 'Documents that live next to the work, editable together in real time.' },
  { icon: MessageSquare, name: 'Chat', text: 'Channels and direct messages, so discussion stays with the project.' },
];

type Props = {
  userName: string;
  hasRealWorkspace: boolean;
  onCreateWorkspace: () => void;
  onGoToMyTasks: () => void;
  onFinish: () => void;
};

export default function OnboardingFlow({ userName, hasRealWorkspace, onCreateWorkspace, onGoToMyTasks, onFinish }: Props) {
  const [step, setStep] = useState(0);
  const firstName = userName.trim().split(/\s+/)[0] || 'there';
  const lastStep = 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/70 backdrop-blur-xs px-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-app-strong">
              {step === 0 ? `Welcome, ${firstName}` : 'Where do you want to start?'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {step === 0 ? 'Siqt keeps tasks, planning, docs and chat in one place.' : 'You can change this later — nothing here is permanent.'}
            </p>
          </div>
          {/* Escapable at every step. An onboarding someone can't get out of is worse than none. */}
          <button onClick={onFinish} title="Skip" className="text-neutral-500 hover:text-app-strong cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-5">
          {step === 0 ? (
            <div className="space-y-3">
              {AREAS.map(({ icon: Icon, name, text }) => (
                <div key={name} className="flex gap-3">
                  <span className="w-8 h-8 rounded-lg bg-neutral-800/60 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-blue-400" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-app-strong">{name}</div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Two honest starting points rather than one forced path. A personal workspace
                  already exists for every account (created at signup), so working alone is a
                  complete option — not a lesser one to be talked out of. */}
              <button
                onClick={() => {
                  onFinish();
                  onGoToMyTasks();
                }}
                className="w-full text-left flex gap-3 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/40 transition cursor-pointer"
              >
                <span className="w-8 h-8 rounded-lg bg-neutral-800/60 flex items-center justify-center shrink-0">
                  <ListChecks className="w-4 h-4 text-blue-400" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-app-strong">Just me, for now</div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Go to My Tasks and add your first one. Private to you.
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  onFinish();
                  onCreateWorkspace();
                }}
                className="w-full text-left flex gap-3 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/40 transition cursor-pointer"
              >
                <span className="w-8 h-8 rounded-lg bg-neutral-800/60 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-blue-400" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-app-strong">
                    {hasRealWorkspace ? 'Add another workspace' : 'Set up a workspace for my team'}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    A shared space you can invite colleagues into.
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-neutral-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {[0, 1].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-blue-500' : 'w-1.5 bg-neutral-700'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onFinish} className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer">
              Skip
            </button>
            {step < lastStep && (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1.5 rounded font-medium cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
