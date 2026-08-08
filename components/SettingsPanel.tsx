'use client';

import { useState } from 'react';
import { X, Settings, Check } from 'lucide-react';

const HIDDEN_NAV_TABS_STORAGE_KEY = 'robup.hiddenNavTabs';

export type NavTabId = 'board' | 'calendar' | 'docs' | 'office';

const NAV_TABS: { id: NavTabId; label: string }[] = [
  { id: 'board', label: 'Tasks' },
  { id: 'calendar', label: 'Planner' },
  { id: 'docs', label: 'Docs' },
  { id: 'office', label: 'Office' },
];

// Same "only persist the non-default (hidden) minority" Set-of-ids shape as FolderTree.tsx's
// readCollapsedFolders/setFolderCollapsed — every tab defaults to visible, so an empty/missing
// key means "show everything," not "hide everything."
export function readHiddenNavTabs(): Set<NavTabId> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(HIDDEN_NAV_TABS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function setNavTabHidden(tabId: NavTabId, hidden: boolean) {
  try {
    const next = readHiddenNavTabs();
    if (hidden) next.add(tabId);
    else next.delete(tabId);
    localStorage.setItem(HIDDEN_NAV_TABS_STORAGE_KEY, JSON.stringify([...next]));
  } catch {}
}

// Structurally identical to TrashPanel.tsx (self-contained, onClose prop, centered overlay) —
// deliberately no framer-motion, instant mount/unmount, matching the "cheaper feel" direction of
// this session's other changes.
export default function SettingsPanel({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const [hidden, setHidden] = useState(() => readHiddenNavTabs());

  const toggle = (tabId: NavTabId) => {
    const next = !hidden.has(tabId);
    setNavTabHidden(tabId, next);
    setHidden(readHiddenNavTabs());
    onChange();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 backdrop-blur-xs" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[360px] bg-neutral-900 border border-neutral-800 rounded shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
            <Settings className="w-4 h-4" /> Settings
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 px-1 pb-1">Visible tabs</div>
          {NAV_TABS.map((tab) => {
            const visible = !hidden.has(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => toggle(tab.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-neutral-800/60 cursor-pointer"
              >
                <span className="text-xs text-neutral-300">{tab.label}</span>
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    visible ? 'bg-blue-600 border-blue-600' : 'border-neutral-700'
                  }`}
                >
                  {visible && <Check className="w-3 h-3 text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
