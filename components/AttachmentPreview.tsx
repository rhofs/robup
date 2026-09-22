'use client';

import { Download, FileText, X } from 'lucide-react';
import { formatBytes } from '../lib/formatBytes';

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
export default function AttachmentPreview({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const ext = extOf(file.url);
  const inline = file.kind === 'image' || INLINE_EXTS.has(ext);
  const isImage = file.kind === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/80 backdrop-blur-xs p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[calc(100dvh-2rem)] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-neutral-800 shrink-0">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-app-strong truncate">{file.fileName || 'File'}</span>
            {file.byteSize ? (
              <span className="block text-[11px] text-neutral-500">{formatBytes(file.byteSize)}</span>
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

        <div className="flex-1 min-h-0 bg-neutral-950 flex items-center justify-center overflow-auto">
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
