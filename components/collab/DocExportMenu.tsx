'use client';

import { useState } from 'react';
import { Download, FileText, Share2 } from 'lucide-react';
import FloatingPopover from '../FloatingPopover';
import { useTaskStore } from '../../store/useTaskStore';
import { useSessionStore } from '../../store/useSessionStore';

type DocExportMenuProps = {
  docId: string;
  onToast?: (message: string) => void;
};

// Small "Link existing"/"Link to task" style popover (same FloatingPopover already used right
// next to where this sits at both call sites) with two export paths: a plain download link for
// PDF (the server sets Content-Disposition: attachment, no client JS needed), and an action
// button for Google Docs, which needs the current signed-in identity to know which Google
// account to use/connect.
export default function DocExportMenu({ docId, onToast }: DocExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const users = useTaskStore((s) => s.users);
  const currentUserId = useSessionStore((s) => s.currentUserId);
  const currentUser = users.find((u) => u.id === currentUserId);

  const handleExportGoogle = async () => {
    if (!currentUserId) {
      onToast?.('Sign in first so the export knows which Google account to use.');
      return;
    }
    if (!currentUser?.googleEmail) {
      window.location.href = `/api/google/oauth/start?userId=${currentUserId}`;
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/docs/${docId}/export/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast?.(data.error || 'Could not export to Google Docs.');
        return;
      }
      window.open(data.url, '_blank');
      onToast?.('Exported to Google Docs — opened in a new tab.');
    } catch {
      onToast?.('Could not export to Google Docs.');
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <FloatingPopover
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      panelClassName="w-56 bg-neutral-900 border border-neutral-800 rounded shadow-xl py-1"
      anchor={
        <button
          onClick={() => setOpen((o) => !o)}
          title="Export this doc"
          className="text-[11px] text-neutral-400 hover:text-blue-400 px-2 py-1 rounded hover:bg-neutral-800/60 cursor-pointer flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      }
    >
      <a
        href={`/api/docs/${docId}/export/pdf`}
        download
        onClick={() => setOpen(false)}
        className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2"
      >
        <FileText className="w-3.5 h-3.5 shrink-0" /> Download PDF
      </a>
      <button
        onClick={handleExportGoogle}
        disabled={exporting}
        className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800/60 cursor-pointer flex items-center gap-2 disabled:opacity-50"
      >
        <Share2 className="w-3.5 h-3.5 shrink-0" />
        {currentUser?.googleEmail ? 'Export to Google Docs' : 'Connect Google to export'}
      </button>
    </FloatingPopover>
  );
}
