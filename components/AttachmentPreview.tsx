'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, FileText, Minus, Pen, Plus, X } from 'lucide-react';
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
  onAnnotate,
}: {
  file: PreviewFile;
  onClose: () => void;
  // Supplied only where a marked-up copy has somewhere to go — a chat message's composer. The task
  // modal's preview has no composer to put one in, so it simply does not offer the button rather
  // than offering one that would have to ask "and now where?".
  onAnnotate?: (file: PreviewFile) => void;
  // Present when the file is one of several (a chat message's images): where it is among them,
  // and how to step. Arrows on the sides, and a sideways swipe on a touch screen.
  nav?: { index: number; count: number; onPrev: () => void; onNext: () => void };
}) {
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  const ext = extOf(file.url);
  const inline = file.kind === 'image' || INLINE_EXTS.has(ext);
  const isImage = file.kind === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
  // Held up here, not inside the image, because the header's buttons and the title both read it —
  // the buttons to drive it, the title to say what it is at.
  const [scale, setScale] = useState(1);
  // Back to 1 whenever the picture changes — carrying a zoom to the next image means arriving in
  // the middle of a photo you have not seen yet.
  //
  // Adjusted during render rather than in an effect. It is this component's own state reacting to
  // its own prop, which is the one case React sanctions for setting state while rendering; an
  // effect would paint one frame of the new image at the old zoom first, and cascade a render.
  const [scaleForUrl, setScaleForUrl] = useState(file.url);
  if (scaleForUrl !== file.url) {
    setScaleForUrl(file.url);
    setScale(1);
  }
  const zoomStep = useRef<((factor: number) => void) | null>(null);

  return (
    <div
      data-escape-closes="" className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/80 backdrop-blur-xs p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // An image gets a DEFINITE height; everything else is still sized by its content.
        //
        // This card had only a max-height, so its real height came from what was inside it. That
        // worked while the image was an ordinary child — it gave the card its size. Zoom made the
        // image absolutely positioned (it has to be, to be panned around inside a fixed frame), and
        // an absolutely positioned child is out of flow: it contributes no height at all. So the
        // body's `flex-1` had nothing to grow into, the card collapsed to its header, and the
        // picture was simply not drawn. Reported as "jeg ser ikke bildet før jeg trykker edit" — the
        // mark-up editor is its own full-screen layer with a real height, which is why the same
        // image appeared there.
        //
        // The lesson is general: taking a child out of flow silently removes whatever height it was
        // giving its parent, and a parent sized by its content has nothing left to be.
        //
        // Filling the screen is also the better answer for a picture — a lightbox that shrinks to a
        // small image leaves nowhere to zoom into.
        className={`w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
          isImage ? 'h-[calc(100dvh-2rem)]' : 'max-h-[calc(100dvh-2rem)]'
        }`}
      >
        <div className="px-4 py-3 flex items-center gap-2 border-b border-neutral-800 shrink-0">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-app-strong truncate">{file.fileName || 'File'}</span>
            {file.byteSize || nav || scale > 1.01 ? (
              <span className="block text-[11px] text-neutral-500">
                {[
                  nav ? `${nav.index + 1} of ${nav.count}` : null,
                  file.byteSize ? formatBytes(file.byteSize) : null,
                  // Only once it is not at rest: a permanent "100%" is noise on every single image.
                  scale > 1.01 ? `${Math.round(scale * 100)}%` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </span>
          {/* Buttons as well as gestures. A pinch is the natural way in on a phone and does not
              exist on a desktop with a mouse, and neither a pinch nor a wheel tells you that zoom
              is available at all — a control that can only be discovered by trying it is one most
              people never find. */}
          {isImage && onAnnotate && (
            <button
              onClick={() => onAnnotate(file)}
              title="Mark up"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
            >
              <Pen className="w-4 h-4" />
            </button>
          )}
          {isImage && (
            <>
              <button
                onClick={() => zoomStep.current?.(1 / 1.4)}
                disabled={scale <= 1}
                title="Zoom out"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition duration-100 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => zoomStep.current?.(1.4)}
                title="Zoom in"
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </>
          )}
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
          className={`relative flex-1 min-h-0 bg-neutral-950 flex items-center justify-center ${isImage ? 'overflow-hidden' : 'overflow-auto'}`}
          // Images handle their own gestures (see ZoomableImage) — a swipe there has to know
          // whether it is panning a zoomed picture or stepping to the next one, and this handler
          // cannot know that. Left in place for everything else, so swiping between PDFs in a
          // gallery still works exactly as it did.
          onTouchStart={(e) => {
            swipeFrom.current = !isImage && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
          }}
          onTouchEnd={(e) => {
            const from = swipeFrom.current;
            swipeFrom.current = null;
            if (!nav || !from || isImage) return;
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
            <ZoomableImage
              // Keyed on the file, so the pan offset inside it resets by remounting rather than by
              // an effect that has to undo the previous image's position.
              key={file.url}
              src={file.url}
              alt={file.fileName || ''}
              scale={scale}
              onScaleChange={setScale}
              registerZoomStep={(fn) => (zoomStep.current = fn)}
              canSwipe={!!nav}
              onSwipe={(dir) => (dir === 'next' ? nav?.onNext() : nav?.onPrev())}
            />
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

// A zoomable, pannable image.
//
// The preview could only show an image at whatever size it happened to fit — "jeg trenger at vi kan
// se bildet større, zoome inn". A screenshot of a spreadsheet or a frame of video is unreadable at
// phone width, and that is exactly the kind of thing people paste into a chat.
//
// It owns its own gestures rather than leaving them to the parent, because zoom and "swipe to the
// next image" are the same fingers doing different things and only one of them can be right at a
// time. The rule is positional, not modal: at rest a one-finger drag belongs to the gallery; once
// zoomed in it belongs to the image. Two fingers always mean zoom. Nothing has to be aimed at and
// there is no mode to leave.
function ZoomableImage({
  src,
  alt,
  scale,
  onScaleChange,
  registerZoomStep,
  canSwipe,
  onSwipe,
}: {
  src: string;
  alt: string;
  scale: number;
  onScaleChange: (scale: number) => void;
  // Hands the header's +/- buttons a way in. They sit outside this component because they belong
  // beside Download and Close, not on top of the picture.
  registerZoomStep: (fn: (factor: number) => void) => void;
  canSwipe: boolean;
  onSwipe: (dir: 'prev' | 'next') => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Live pointers, so one finger and two are told apart by counting rather than inferred from the
  // shape of a touch event.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const MIN = 1;
  const MAX = 6;

  // How far the image may be pushed before it would leave its own frame. Without this a zoomed
  // image can be shoved off screen with no way back except closing it.
  const clamp = (next: { x: number; y: number }, atScale: number) => {
    const box = boxRef.current;
    if (!box) return next;
    const maxX = Math.max(0, (box.clientWidth * (atScale - 1)) / 2);
    const maxY = Math.max(0, (box.clientHeight * (atScale - 1)) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  };

  // Zoom about a point, not about the centre, so whatever is under the cursor or between the
  // fingers stays there. Zooming to the centre and then hunting for the thing you wanted is the
  // difference between a viewer that feels direct and one that feels remote.
  const zoomAbout = (
    nextScale: number,
    clientX: number,
    clientY: number,
    from?: { scale: number; x: number; y: number }
  ) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const base = from ?? { scale, x: offset.x, y: offset.y };
    const target = Math.min(MAX, Math.max(MIN, nextScale));
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const ratio = target / base.scale;
    const next = clamp({ x: px - (px - base.x) * ratio, y: py - (py - base.y) * ratio }, target);
    onScaleChange(target);
    setOffset(target === 1 ? { x: 0, y: 0 } : next);
  };

  // The buttons zoom about the middle of the frame — there is no pointer to zoom about, and the
  // middle is where someone pressing a + button is looking.
  useEffect(() => {
    registerZoomStep((factor) => {
      const box = boxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      zoomAbout(scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, offset, registerZoomStep]);

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const pts = [...pointers.current.values()];
    setGesturing(true);
    if (pts.length === 2) {
      drag.current = null;
      pinch.current = {
        dist: dist(pts[0], pts[1]),
        scale,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
        ox: offset.x,
        oy: offset.y,
      };
    } else if (pts.length === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length === 2 && pinch.current) {
      const g = pinch.current;
      const d = dist(pts[0], pts[1]);
      if (g.dist > 0) zoomAbout((d / g.dist) * g.scale, g.cx, g.cy, { scale: g.scale, x: g.ox, y: g.oy });
      return;
    }

    const d = drag.current;
    // Panning only exists once there is something to pan. At rest the same drag is the gallery's
    // swipe, decided on release below.
    if (d && scale > 1) setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, scale));
  };

  const endPointer = (e: React.PointerEvent) => {
    const d = drag.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setGesturing(false);
    }
    if (!d || !wasSingle || scale > 1 || !canSwipe) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // Clearly sideways, and far enough not to be a tap that wandered — the same test the old touch
    // handler used, kept so the gesture feels identical where it still applies.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    onSwipe(dx < 0 ? 'next' : 'prev');
  };

  return (
    <div
      ref={boxRef}
      className="absolute inset-0 overflow-hidden flex items-center justify-center"
      // The browser must not claim these for its own scroll and pinch. This is a full-screen
      // overlay, so nothing underneath wanted them.
      style={{ touchAction: 'none', cursor: scale > 1 ? 'grab' : 'zoom-in' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={(e) => zoomAbout(scale > 1 ? 1 : 2.5, e.clientX, e.clientY)}
      onWheel={(e) => zoomAbout(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          // No easing while the fingers are down: smoothing a pinch makes it feel negotiated
          // rather than followed. The ease is for the buttons and the double-tap.
          transition: gesturing ? 'none' : 'transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
      />
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
  onAnnotate,
}: {
  files: PreviewFile[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onAnnotate?: (file: PreviewFile) => void;
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
      onAnnotate={onAnnotate}
      nav={count > 1 ? { index, count, onPrev: () => onIndex((index - 1 + count) % count), onNext: () => onIndex((index + 1) % count) } : undefined}
    />,
    document.body
  );
}
