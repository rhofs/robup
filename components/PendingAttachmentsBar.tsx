'use client';

import { FileText, X } from 'lucide-react';
import { formatBytes } from '../lib/formatBytes';
import type { PickedAttachment } from '../hooks/usePendingAttachments';

// The files waiting above a chat composer, one tile each. A row that scrolls sideways rather than
// wrapping: on a phone the composer sits on the keyboard, and ten images wrapping onto four lines
// would push the conversation off the screen. The caller owns the border and the corners, since
// those depend on what sits above and below it.
export default function PendingAttachmentsBar({
  items,
  onRemove,
  busy,
  className,
}: {
  items: PickedAttachment[];
  onRemove: (key: number) => void;
  // Uploading: the tiles dim and cannot be removed, so what is sent is what was shown.
  busy: boolean;
  className: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`flex gap-2 overflow-x-auto ${busy ? 'opacity-60' : ''} ${className}`}>
      {items.map((p) => (
        <div
          key={p.key}
          title={`${p.file.name} · ${formatBytes(p.file.size)}`}
          className={`relative shrink-0 h-14 rounded-lg border border-neutral-700 bg-neutral-800 overflow-hidden ${
            p.previewUrl ? 'w-14' : 'max-w-[190px] flex items-center gap-2 pl-2 pr-7'
          }`}
        >
          {p.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob URL; nothing for next/image to optimise
            <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <>
              <FileText className="w-4 h-4 shrink-0 text-neutral-400" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] text-neutral-200">{p.file.name}</span>
                <span className="block text-[10px] text-neutral-500">{formatBytes(p.file.size)}</span>
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            disabled={busy}
            title="Remove"
            aria-label={`Remove ${p.file.name}`}
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-neutral-950/80 text-neutral-200 hover:bg-neutral-950 flex items-center justify-center cursor-pointer disabled:cursor-default"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
