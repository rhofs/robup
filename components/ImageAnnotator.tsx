'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Circle, Minus, Pen, Square, Trash2, Undo2, X } from 'lucide-react';
import { useBackLayer } from '../hooks/useBackLayer';

// Drawing on an image and sending the result back as a new one.
//
// "Om vi kan legge til en funksjon hvor man kan edite, med markører osv, og lagre som ny i chat, og
// med kommentar om man ønsker." The use is pointing at something: a screenshot with "this bit" circled
// says in one image what a paragraph of text says badly.
//
// Three decisions worth stating, because each had an obvious alternative:
//
// 1. **It never touches the original.** Saving produces a new file that goes into the composer as a
//    pending attachment. The image someone else sent stays exactly as they sent it, and the marked-up
//    copy arrives as its own message with its own author — which is also what makes a reply to it
//    read correctly later.
// 2. **The comment is the composer**, not a field in here. Saving drops the file where every other
//    attachment lands, so the text box, the reply quote, the emoji button and Send all already work
//    and all behave the way they do everywhere else. A second message box inside this editor would
//    have been a worse copy of one that already exists ten pixels below.
// 3. **Shapes are kept as data in the image's own pixel coordinates**, not painted into a canvas as
//    you go. Undo is then simply dropping the last one, and the export is drawn once at the image's
//    true size — so a mark made on a phone-sized view of a 4000px screenshot is sharp in the result
//    rather than upscaled from what the phone was showing.

type Tool = 'pen' | 'arrow' | 'rect' | 'ellipse';
type Shape = {
  tool: Tool;
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

// Six, and no picker. A colour wheel is a decision to make before you can make a mark; these are
// chosen to stay visible against a screenshot of almost anything, which is the only job they have.
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#111111'];
const WIDTHS = [4, 9, 18];

export default function ImageAnnotator({
  src,
  fileName,
  onCancel,
  onSave,
}: {
  src: string;
  fileName: string | null;
  onCancel: () => void;
  onSave: (file: File) => void;
}) {
  useBackLayer(true, onCancel);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const drawing = useRef<Shape | null>(null);
  const [, forceRedraw] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded through a separate Image so the natural size is known before anything is drawn, and
  // crossOrigin so the canvas stays untainted — a tainted canvas cannot be exported at all, which
  // would turn the whole feature into a drawing surface with no way to keep what you drew.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setError('Could not load the image.');
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  const drawShape = (ctx: CanvasRenderingContext2D, s: Shape) => {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = s.points;
    if (pts.length === 0) return;
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (s.tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }
    if (s.tool === 'rect') {
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      return;
    }
    if (s.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    // Arrow: the shaft, then a head whose size follows the stroke width so a thick arrow does not
    // end in a pinhead.
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(s.width * 3.2, 12);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 7), b.y - head * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 7), b.y - head * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  };

  // One redraw per change, over the whole picture. Cheap enough at these sizes, and it means there
  // is exactly one piece of code that knows what a finished drawing looks like — the preview and
  // the exported file cannot drift apart because they are the same function.
  const paint = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    ctx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, 0, 0);
    for (const s of shapes) drawShape(ctx, s);
    if (drawing.current) drawShape(ctx, drawing.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !ready) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) paint(ctx, img);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, shapes]);

  // Display coordinates to image coordinates. The canvas is laid out to fit the screen while its
  // backing store is the image's true size, so everything drawn has to cross that gap exactly once —
  // here, on the way in. Everything downstream then works in real pixels.
  const toImage = (e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * img.naturalWidth,
      y: ((e.clientY - rect.top) / rect.height) * img.naturalHeight,
    };
  };

  // Stroke width is given in image pixels, so it has to grow with how much the picture is shrunk to
  // fit — otherwise a 4px line on a 4000px screenshot is invisible on the phone drawing it.
  const scaledWidth = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return width;
    const rect = canvas.getBoundingClientRect();
    return width * Math.max(1, img.naturalWidth / Math.max(1, rect.width));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toImage(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drawing.current = { tool, color, width: scaledWidth(), points: [p] };
    forceRedraw((n) => n + 1);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toImage(e);
    if (!p) return;
    // A pen keeps every point; the shapes only ever need where it started and where it is now.
    if (drawing.current.tool === 'pen') drawing.current.points.push(p);
    else drawing.current.points = [drawing.current.points[0], p];
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && img) paint(ctx, img);
  };

  const onPointerUp = () => {
    const s = drawing.current;
    drawing.current = null;
    if (!s) return;
    // A tap that never moved is not a mark. Without this, every stray touch leaves a dot that has
    // to be undone.
    if (s.points.length < 2) {
      forceRedraw((n) => n + 1);
      return;
    }
    setShapes((prev) => [...prev, s]);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not build the image');
      // Named after the original so the two are obviously related in a conversation, and always
      // .png — the drawing has hard edges and flat colour, which is what PNG is for, and re-encoding
      // a JPEG would soften the original underneath the marks.
      const base = (fileName || 'image').replace(/\.[^.]+$/, '');
      onSave(new File([blob], `${base}-markup.png`, { type: 'image/png' }));
    } catch (err) {
      // Nearly always a tainted canvas — an image served without CORS headers cannot be exported.
      // Saying so beats a button that silently does nothing.
      setError(err instanceof Error ? err.message : 'Could not save the image');
      setSaving(false);
    }
  };

  const toolButton = (id: Tool, Icon: typeof Pen, label: string) => (
    <button
      key={id}
      onClick={() => setTool(id)}
      title={label}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition duration-100 active:scale-90 cursor-pointer ${
        tool === id ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return createPortal(
    <div data-escape-closes="" className="fixed inset-0 z-[90] flex flex-col bg-scrim/90 backdrop-blur-xs">
      <div className="px-3 py-2.5 flex items-center gap-1 border-b border-neutral-800 bg-neutral-900 shrink-0">
        <button
          onClick={onCancel}
          title="Cancel"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 active:scale-90 transition duration-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <span className="min-w-0 flex-1 text-sm text-app-strong truncate">Mark up image</span>
        <button
          onClick={() => setShapes((prev) => prev.slice(0, -1))}
          disabled={shapes.length === 0}
          title="Undo"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition duration-100 cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShapes([])}
          disabled={shapes.length === 0}
          title="Clear all"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition duration-100 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={save}
          disabled={!ready || saving}
          className="shrink-0 ml-1 flex items-center gap-1.5 px-4 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium active:scale-95 transition duration-100 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" /> {saving ? 'Adding…' : 'Add to message'}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-hidden">
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            // The browser must not take these for scrolling — every one of them is a mark.
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>

      {/* The tools sit at the BOTTOM, where a thumb is — not in the header beside Cancel. This is
          the part of the screen that gets used over and over while the header is pressed twice. */}
      <div className="shrink-0 border-t border-neutral-800 bg-neutral-900 px-3 py-2.5 flex items-center justify-center gap-3 flex-wrap pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <div className="flex items-center gap-0.5">
          {toolButton('pen', Pen, 'Freehand')}
          {toolButton('arrow', ArrowUpRight, 'Arrow')}
          {toolButton('rect', Square, 'Rectangle')}
          {toolButton('ellipse', Circle, 'Ellipse')}
        </div>
        <div className="w-px h-6 bg-neutral-800" />
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              style={{ backgroundColor: c }}
              className={`w-6 h-6 rounded-full border transition active:scale-90 duration-100 cursor-pointer ${
                color === c ? 'border-blue-400 ring-2 ring-blue-500/50' : 'border-neutral-700'
              }`}
            />
          ))}
        </div>
        <div className="w-px h-6 bg-neutral-800" />
        <div className="flex items-center gap-0.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              title={`${w === WIDTHS[0] ? 'Thin' : w === WIDTHS[1] ? 'Medium' : 'Thick'} line`}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition duration-100 active:scale-90 cursor-pointer ${
                width === w ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-app-strong hover:bg-neutral-800/60'
              }`}
            >
              <Minus className="w-5 h-5" style={{ strokeWidth: w / 2.5 }} />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
