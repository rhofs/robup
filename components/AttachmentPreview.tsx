'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react';
import { formatBytes } from '../lib/formatBytes';
import { useBackLayer } from '../hooks/useBackLayer';

export type PreviewFile = {
  url: string;
  fileName: string | null;
  kind: 'image' | 'file';
  byteSize?: number | null;
};

// Images and PDFs a browser can render itself. Everything else gets the download button and an
// honest "nothing to show" — better than an empty frame that looks broken.
const INLINE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'csv']);

function extOf(url: string): string {
  return url.split('.').pop()?.toLowerCase() ?? '';
}

// Opens a file in the app instead of a new tab.
//
// A new tab was what this did first, and it is wrong for two reasons rather than one: you lose your
// place in the task you were reading, and in the Android app a new tab is a different browser
// entirely, so you come back to a cold start. Previewing in place keeps the task behind it.
//
// Download stays available and explicit — the point is that opening and keeping are two different
// intentions, and only one of them should be the default.
export default function AttachmentPreview({
  file,
  onClose,
  nav,
}: {
  file: PreviewFile;
  onClose: () => void;
  // Present when the file is one of several (a chat message's images): where it is among them,
  // and how to step. Arrows on the sides, and a sideways swipe on a touch screen.
  nav?: { index: number; count: number; onPrev: () => void; onNext: () => void };
}) {
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const ext = extOf(file.url);
  const inline = file.kind === 'image' || INLINE_EXTS.has(ext);
  const isImage = file.kind === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

  return (
    <div
      data-escape-closes="" className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/80 backdrop-blur-xs p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[calc(100dvh-2rem)] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-neutral-800 shrink-0">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-app-strong truncate">{file.fileName || 'File'}</span>
            {file.byteSize || nav ? (
              <span className="block text-[11px] text-neutral-500">
                {[nav ? `${nav.index + 1} of ${nav.count}` : null, file.byteSize ? formatBytes(file.byteSize) : null].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </span>
          <a
            href={file.url}
            download={file.fileName || true}
            title="Download"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            title="Close"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="relative flex-1 min-h-0 bg-neutral-950 flex items-center justify-center overflow-auto"
          onTouchStart={(e) => {
            swipeFrom.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
          }}
          onTouchEnd={(e) => {
            const from = swipeFrom.current;
            swipeFrom.current = null;
            if (!nav || !from) return;
            const dx = e.changedTouches[0].clientX - from.x;
            const dy = e.changedTouches[0].clientY - from.y;
            // Clearly sideways, and far enough not to be a tap that wandered.
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            if (dx < 0) nav.onNext();
            else nav.onPrev();
          }}
        >
          {nav && (
            <>
              <button
                type="button"
                onClick={nav.onPrev}
                title="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-neutral-950/70 text-neutral-200 hover:bg-neutral-950 flex items-center justify-center cursor-pointer active:scale-90 transition duration-100"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={nav.onNext}
                title="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-neutral-950/70 text-neutral-200 hover:bg-neutral-950 flex items-center justify-center cursor-pointer active:scale-90 transition duration-100"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt={file.fileName || ''} className="max-w-full max-h-full object-contain" />
          ) : inline ? (
            // A plain iframe rather than a PDF library: the browser already has a viewer, and
            // shipping one for a file type it renders natively is weight for nothing.
            <iframe src={file.url} title={file.fileName || 'File'} className="w-full h-[70vh] bg-white" />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
              <FileText className="w-8 h-8 text-neutral-600" />
              <p className="text-xs text-neutral-500">
                This kind of file cannot be shown here. Download it to open it.
              </p>
              <a
                href={file.url}
                download={file.fileName || true}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The same preview for a place that cannot render it at the top of the page itself — a chat message.
//
// "Kan vi fikse, så jeg kan åpne bilder i siqt? At det ikke åpner en ny fane i browseren?"
// (2026-11-16). Chat images were links with target="_blank"; the task modal had this preview all
// along and chat never got it.
//
// Through a portal, because a conversation sits inside panes that carry a transform (the pushes),
// and `position: fixed` inside a transformed element is fixed to that element, not to the screen.
// Back closes it (hooks/useBackLayer.ts) and so does Escape — the preview's backdrop carries the
// attribute lib/backdrop.ts looks for.
export function AttachmentLightbox({
  files,
  index,
  onIndex,
  onClose,
}: {
  files: PreviewFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  useBackLayer(true, onClose);
  const count = files.length;
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onIndex((index - 1 + count) % count);
      else if (e.key === 'ArrowRight') onIndex((index + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndex]);
  const file = files[index];
  if (!file) return null;
  return createPortal(
    <AttachmentPreview
      file={file}
      onClose={onClose}
      nav={count > 1 ? { index, count, onPrev: () => onIndex((index - 1 + count) % count), onNext: () => onIndex((index + 1) % count) } : undefined}
    />,
    document.body
  );
}
