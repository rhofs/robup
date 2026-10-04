'use client';

import SheetLayer from './SheetLayer';
import { useSheetDrag } from './sheetDrag';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { fullViewportBox, overlayStyle, useVisibleViewport } from '../../hooks/useVisibleViewport';
import { X } from 'lucide-react';
import { hapticTap } from '../../lib/haptics';

// "Pick time": a 24-hour clock face, modelled on ClickUp's (the user's screenshot). Hours on two
// rings — 1–12 outside, 13–23 and 0 inside, each under the hour it shares a position with — then
// minutes on one ring. Tap or drag; lifting a finger on an hour moves on to the minutes, the way
// Android's own clock picker does. The two boxes on top switch between hour and minute by hand.

const SIZE = 280;
const C = SIZE / 2;
const OUTER = SIZE * 0.4;
const INNER = SIZE * 0.265;
const pad = (n: number) => String(n).padStart(2, '0');

function pointAt(index: number, radius: number) {
  const a = (index / 12) * 2 * Math.PI;
  return { x: C + radius * Math.sin(a), y: C - radius * Math.cos(a) };
}

export default function TimeDialSheet({
  initial,
  onSave,
  onClear,
  onClose,
}: {
  initial: { h: number; m: number } | null;
  onSave: (h: number, m: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const drag = useSheetDrag(onClose);
  // No text field here: laid out on the full height, not the visible box (see fullViewportBox).
  useVisibleViewport();
  const [h, setH] = useState(initial?.h ?? 9);
  const [m, setM] = useState(initial?.m ?? 0);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const dialRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Where on the face a pointer is, as an angle from 12 o'clock (clockwise) and a distance from the
  // centre — which ring it is on decides whether 3 means 3 or 15.
  const pick = (clientX: number, clientY: number, commit: boolean) => {
    const box = dialRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const scale = SIZE / box.width;
    const dist = Math.hypot(dx, dy) * scale;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const deg = (angle + 360) % 360;
    if (mode === 'hour') {
      const idx = Math.round(deg / 30) % 12;
      const inner = dist < (OUTER + INNER) / 2;
      const hour = inner ? (idx === 0 ? 0 : idx + 12) : idx === 0 ? 12 : idx;
      if (hour !== h) hapticTap();
      setH(hour);
      if (commit) setMode('minute');
    } else {
      const minute = Math.round(deg / 6) % 60;
      if (minute !== m && minute % 5 === 0) hapticTap();
      setM(minute);
    }
  };

  const handPoint =
    mode === 'hour'
      ? pointAt(h % 12, h === 0 || h > 12 ? INNER : OUTER)
      : pointAt(m / 5, OUTER);
  const selectedLabel = mode === 'hour' ? String(h) : pad(m);

  return (
    <SheetLayer z={95} dim={0.5} style={overlayStyle(fullViewportBox())} onClose={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        // A touch slower than the other sheets — still quick, but it should be seen arriving.
        transition={{ type: 'spring', stiffness: 290, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        className="relative bg-neutral-900 rounded-t-[28px] max-h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div {...drag.handleProps} className="relative flex items-center justify-center px-5 pt-5 pb-3">
          <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-neutral-700" />
          <h3 className="text-[17px] font-semibold text-app-strong">Pick time</h3>
          <button onClick={onClose} className="absolute right-4 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2 pb-5 font-mono">
          {(['hour', 'minute'] as const).map((which, i) => (
            <div key={which} className="contents">
              {i === 1 && <span className="text-2xl font-semibold text-app-strong">:</span>}
              <button
                onClick={() => setMode(which)}
                className={`w-16 h-16 rounded-2xl text-[26px] font-semibold text-app-strong cursor-pointer transition ${
                  mode === which ? 'bg-neutral-800 ring-2 ring-app-strong' : 'bg-neutral-800/60'
                }`}
              >
                {which === 'hour' ? pad(h) : pad(m)}
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <div
            ref={dialRef}
            className="relative rounded-full bg-neutral-800/50 touch-none select-none"
            style={{ width: SIZE, height: SIZE }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              pick(e.clientX, e.clientY, false);
            }}
            onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY, false)}
            onPointerUp={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              pick(e.clientX, e.clientY, true);
            }}
          >
            <svg width={SIZE} height={SIZE} className="absolute inset-0 pointer-events-none">
              <line x1={C} y1={C} x2={handPoint.x} y2={handPoint.y} className="stroke-app-strong" strokeWidth={2} />
              <circle cx={C} cy={C} r={4} className="fill-neutral-900 stroke-app-strong" strokeWidth={2} />
            </svg>
            <motion.div
              className="absolute w-11 h-11 -ml-[22px] -mt-[22px] rounded-full bg-app-strong text-neutral-900 flex items-center justify-center text-[15px] font-semibold font-mono pointer-events-none"
              animate={{ left: handPoint.x, top: handPoint.y }}
              transition={{ type: 'spring', stiffness: 600, damping: 40 }}
            >
              {selectedLabel}
            </motion.div>
            {mode === 'hour'
              ? Array.from({ length: 12 }, (_, i) => {
                  const outer = pointAt(i, OUTER);
                  const inner = pointAt(i, INNER);
                  const outerLabel = i === 0 ? 12 : i;
                  const innerLabel = i === 0 ? 0 : i + 12;
                  return (
                    <div key={i} className="contents">
                      {outerLabel !== h && (
                        <span className="absolute -translate-x-1/2 -translate-y-1/2 text-[15px] font-mono text-app-strong pointer-events-none" style={{ left: outer.x, top: outer.y }}>
                          {outerLabel}
                        </span>
                      )}
                      {innerLabel !== h && (
                        <span className="absolute -translate-x-1/2 -translate-y-1/2 text-[13px] font-mono text-neutral-400 pointer-events-none" style={{ left: inner.x, top: inner.y }}>
                          {innerLabel}
                        </span>
                      )}
                    </div>
                  );
                })
              : Array.from({ length: 12 }, (_, i) => {
                  const p = pointAt(i, OUTER);
                  const label = pad(i * 5);
                  return label === pad(m) ? null : (
                    <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 text-[15px] font-mono text-app-strong pointer-events-none" style={{ left: p.x, top: p.y }}>
                      {label}
                    </span>
                  );
                })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pt-6">
          <button onClick={onClear} className="h-12 rounded-2xl bg-neutral-800 text-[15px] font-semibold text-neutral-400 cursor-pointer">
            Clear
          </button>
          <button onClick={() => onSave(h, m)} className="h-12 rounded-2xl bg-app-strong text-neutral-900 text-[15px] font-semibold cursor-pointer">
            Save
          </button>
        </div>
      </motion.div>
    </SheetLayer>
  );
}
