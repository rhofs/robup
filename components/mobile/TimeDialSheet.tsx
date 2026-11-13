'use client';

import SheetLayer from './SheetLayer';
import { useSheetDrag } from './sheetDrag';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useTransform } from 'framer-motion';
import { fullViewportBox, liveOverlayStyle, overlayStyle, useVisibleViewport } from '../../hooks/useVisibleViewport';
import { X } from 'lucide-react';
import { hapticTap } from '../../lib/haptics';
import { closeOnBackdrop } from '../../lib/backdrop';
import {
  DIAL_CENTER as C,
  DIAL_SIZE as SIZE,
  INNER_RING as INNER,
  KNOB_RADIUS,
  OUTER_RING as OUTER,
  handTarget,
  hourAt,
  minuteAt,
  pointOnDial,
  shortestTurn,
  type DialMode,
} from '../../lib/clockHand';

// "Pick time": a 24-hour clock face, modelled on ClickUp's (the user's screenshot). Hours on two
// rings — 1–12 outside, 13–23 and 0 inside, each under the hour it shares a position with — then
// minutes on one ring. Tap or drag; lifting a finger on an hour moves on to the minutes, the way
// Android's own clock picker does. The two boxes on top switch between hour and minute by hand.
//
// How the hand is drawn (2026-11-13, after "streken kommer umiddelbart … mens ballen kommer etter"):
// one animated angle and one animated length (lib/clockHand.ts), and everything that moves — the
// line, the knob, the dot inside it — is computed from those two on the same frame. Before, the line
// was plain SVG that jumped to the new time while the knob was a separate element springing after it.
//
// The knob is not an element carrying a number. It is a second copy of the whole face in the knob's
// colours, clipped to a circle that travels with the hand — so the numbers never move or swap; the
// knob passes over them and they change colour underneath it.

const pad = (n: number) => String(n).padStart(2, '0');

// A press or a change of ring/mode: the hand sweeps there, with a hint of weight.
const SETTLE = { type: 'spring', stiffness: 380, damping: 32 } as const;
// Under a dragging finger: critically damped and quick, so it keeps up without wobbling.
const FOLLOW = { type: 'spring', stiffness: 1400, damping: 75 } as const;
// How long the hand rests on a picked hour before the face turns to minutes — long enough to see it
// land, short enough not to be waited for.
const ADVANCE_MS = 260;

const LABEL = 'absolute -translate-x-1/2 -translate-y-1/2 font-mono tabular-nums';

// The numbers of the face, once per colour scheme: 'face' as they normally look, 'knob' as they look
// under the knob. Hour and minute sets cross-fade when the mode changes.
function DialLabels({ mode, tone }: { mode: DialMode; tone: 'face' | 'knob' }) {
  const strong = tone === 'knob' ? 'text-neutral-900' : 'text-app-strong';
  const soft = tone === 'knob' ? 'text-neutral-900' : 'text-neutral-400';
  const at = (deg: number, r: number) => {
    const p = pointOnDial(deg, r);
    return { left: p.x, top: p.y };
  };
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={mode}
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.06 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {mode === 'hour'
          ? Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="contents">
                <span className={`${LABEL} text-[15px] ${strong}`} style={at(i * 30, OUTER)}>
                  {i === 0 ? 12 : i}
                </span>
                <span className={`${LABEL} text-[13px] ${soft}`} style={at(i * 30, INNER)}>
                  {i === 0 ? '00' : i + 12}
                </span>
              </div>
            ))
          : Array.from({ length: 60 }, (_, i) =>
              i % 5 === 0 ? (
                <span key={i} className={`${LABEL} text-[15px] ${strong}`} style={at(i * 6, OUTER)}>
                  {pad(i)}
                </span>
              ) : tone === 'face' ? (
                // The minutes in between, as marks to aim at.
                <span key={i} className="absolute -translate-x-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-neutral-600" style={at(i * 6, OUTER)} />
              ) : null
            )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function TimeDialSheet({
  initial,
  onSave,
  onClear,
  onClose,
  keepKeyboard = false,
  dialog = false,
}: {
  // A centred window instead of a bottom sheet — desktop (see DateSheet's own `dialog`).
  dialog?: boolean;
  // See DateSheet's: opened over a field that keeps its keyboard.
  keepKeyboard?: boolean;
  initial: { h: number; m: number } | null;
  onSave: (h: number, m: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const drag = useSheetDrag(onClose);
  const visible = useVisibleViewport();
  const [h, setH] = useState(initial?.h ?? 9);
  const [m, setM] = useState(initial?.m ?? 0);
  const [mode, setMode] = useState<DialMode>('hour');
  const dialRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // True once a press has turned into a drag — the hand then follows (FOLLOW) rather than sweeps.
  const following = useRef(false);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = handTarget(mode, h, m);
  const angle = useMotionValue(target.deg);
  const reach = useMotionValue(target.r);
  const x = useTransform(() => C + reach.get() * Math.sin((angle.get() * Math.PI) / 180));
  const y = useTransform(() => C - reach.get() * Math.cos((angle.get() * Math.PI) / 180));
  const knobClip = useMotionTemplate`circle(${KNOB_RADIUS}px at ${x}px ${y}px)`;

  // The angle the hand has been sent to, whole turns included — see shortestTurn.
  const turned = useRef(target.deg);
  useEffect(() => {
    turned.current += shortestTurn(turned.current, target.deg);
    const spring = following.current ? FOLLOW : SETTLE;
    const running = [animate(angle, turned.current, spring), animate(reach, target.r, spring)];
    return () => running.forEach((a) => a.stop());
  }, [target.deg, target.r, angle, reach]);

  const cancelAdvance = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  };
  useEffect(() => cancelAdvance, []);

  const goTo = (next: DialMode) => {
    cancelAdvance();
    setMode(next);
  };

  // Where on the face a pointer is, as an angle from 12 o'clock (clockwise) and a distance from the
  // centre — which ring it is on decides whether 3 means 3 or 15.
  const pick = (clientX: number, clientY: number) => {
    const box = dialRef.current?.getBoundingClientRect();
    if (!box) return;
    const scale = SIZE / box.width;
    const dx = (clientX - (box.left + box.width / 2)) * scale;
    const dy = (clientY - (box.top + box.height / 2)) * scale;
    if (mode === 'hour') {
      const hour = hourAt(dx, dy);
      if (hour !== h) hapticTap();
      setH(hour);
    } else {
      const minute = minuteAt(dx, dy);
      if (minute !== m && minute % 5 === 0) hapticTap();
      setM(minute);
    }
  };

  const release = (e: React.PointerEvent, pickToo: boolean) => {
    if (!dragging.current) return;
    dragging.current = false;
    following.current = false;
    if (pickToo) pick(e.clientX, e.clientY);
    if (pickToo && mode === 'hour') advance.current = setTimeout(() => setMode('minute'), ADVANCE_MS);
  };

  const inner = (
    <>
        <div {...(dialog ? {} : drag.handleProps)} className="relative flex items-center justify-center px-5 pt-5 pb-3">
          {!dialog && <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-neutral-700" />}
          <h3 className="text-[17px] font-semibold text-app-strong">Pick time</h3>
          <button onClick={onClose} className="absolute right-4 w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2 pb-5 font-mono tabular-nums">
          {(['hour', 'minute'] as const).map((which, i) => (
            <div key={which} className="contents">
              {i === 1 && <span className="text-2xl font-semibold text-neutral-500">:</span>}
              <button
                onClick={() => goTo(which)}
                className={`w-16 h-16 rounded-2xl text-[26px] font-semibold text-app-strong cursor-pointer transition ${
                  mode === which ? 'bg-neutral-800 ring-2 ring-app-strong' : 'bg-neutral-800/60 hover:bg-neutral-800'
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
            className="relative rounded-full bg-neutral-800/50 ring-1 ring-inset ring-neutral-700/40 touch-none select-none cursor-pointer"
            style={{ width: SIZE, height: SIZE }}
            onPointerDown={(e) => {
              cancelAdvance();
              dragging.current = true;
              following.current = false;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              pick(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              following.current = true;
              pick(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => release(e, true)}
            onPointerCancel={(e) => release(e, false)}
          >
            <svg width={SIZE} height={SIZE} className="absolute inset-0 pointer-events-none">
              <motion.line x1={C} y1={C} x2={x} y2={y} className="stroke-app-strong" strokeWidth={2} strokeLinecap="round" />
              <circle cx={C} cy={C} r={3.5} className="fill-app-strong" />
            </svg>
            <div className="absolute inset-0 pointer-events-none">
              <DialLabels mode={mode} tone="face" />
            </div>
            <motion.div className="absolute inset-0 rounded-full bg-app-strong pointer-events-none" style={{ clipPath: knobClip }}>
              <DialLabels mode={mode} tone="knob" />
              {/* A minute between two numbers has nothing under the knob to show — mark its centre. */}
              <motion.span
                className="absolute left-0 top-0 -ml-[3px] -mt-[3px] w-1.5 h-1.5 rounded-full bg-neutral-900"
                style={{ x, y }}
                initial={false}
                animate={{ opacity: mode === 'minute' && m % 5 !== 0 ? 1 : 0 }}
                transition={{ duration: 0.12 }}
              />
            </motion.div>
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
    </>
  );

  if (dialog) {
    return (
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-scrim/50 p-4" {...closeOnBackdrop(onClose)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[360px] max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl pb-5"
        >
          {inner}
        </motion.div>
      </div>
    );
  }

  return (
    <SheetLayer z={95} dim={0.5} style={keepKeyboard ? liveOverlayStyle(visible) : overlayStyle(fullViewportBox())} onClose={onClose}>
      <motion.div
        onMouseDownCapture={keepKeyboard ? (e) => e.preventDefault() : undefined}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        // A touch slower than the other sheets — still quick, but it should be seen arriving.
        transition={{ type: 'spring', stiffness: 290, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        {...drag.sheetProps}
        className="relative bg-neutral-900 rounded-t-[28px] max-h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        {inner}
      </motion.div>
    </SheetLayer>
  );
}
