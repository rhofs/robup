'use client';

import { useState } from 'react';
import { hapticTap } from './haptics';

// Assign by dragging a face onto a task or event bar in the Planner.
//
// Native HTML drag-and-drop, not the pointer handlers the bars already use to move and resize: those
// capture the pointer on the bar itself, and a second pointer-drag system aimed at the same element
// would have to share that capture. The native kind runs on its own events (dragover/drop), so the
// two cannot interfere. The cost is that it is desktop only — touch browsers do not start a native
// drag from a finger — which is also where the team strip is shown.
//
// Who is being dragged is kept here rather than in dataTransfer, because dragover is not allowed to
// read dataTransfer's contents (only its types). A bar needs to know *during* the hover whether this
// person can go on it — already assigned, or from another workspace — to show "no" before the drop
// instead of doing nothing after it.
export const PERSON_DRAG_TYPE = 'application/x-siqt-person';

let draggingPersonId: string | null = null;

export function startPersonDrag(e: React.DragEvent, userId: string) {
  draggingPersonId = userId;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(PERSON_DRAG_TYPE, userId);
  // A plain-text fallback so the drag is valid everywhere; nothing reads it.
  e.dataTransfer.setData('text/plain', '');
}

export function endPersonDrag() {
  draggingPersonId = null;
}

// Drop-target wiring for one bar. `refusal(userId)` says why this person cannot go on it, or null if
// they can; `onAssign` does it. `isOver` drives the highlight (`refused` turns it red), `justAssigned`
// a short confirmation pulse.
//
// A refused drop is still caught, and says why in a toast (the 'siqt-toast' event, shown by the
// page). It used to be turned away silently — the browser's "not allowed" cursor and nothing else —
// so dropping a colleague on a task in your own Personal workspace, or on a private task they cannot
// open, looked like the feature working on some bars and not others ("det går på noen, men ikke alle").
export function usePersonDrop(refusal: (userId: string) => string | null, onAssign: (userId: string) => void) {
  const [isOver, setIsOver] = useState(false);
  const [refused, setRefused] = useState(false);
  const [justAssigned, setJustAssigned] = useState(false);

  const isPerson = (e: React.DragEvent) => e.dataTransfer.types.includes(PERSON_DRAG_TYPE) && draggingPersonId !== null;

  return {
    isOver,
    refused,
    justAssigned,
    dropProps: {
      onDragOver: (e: React.DragEvent) => {
        if (!isPerson(e)) return;
        e.preventDefault();
        const no = refusal(draggingPersonId!) !== null;
        e.dataTransfer.dropEffect = no ? 'move' : 'copy';
        if (!isOver) setIsOver(true);
        if (refused !== no) setRefused(no);
      },
      onDragLeave: (e: React.DragEvent) => {
        // dragleave also fires when moving onto a child of the bar; only a real exit counts.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsOver(false);
        setRefused(false);
      },
      onDrop: (e: React.DragEvent) => {
        setIsOver(false);
        setRefused(false);
        if (!isPerson(e)) return;
        e.preventDefault();
        const userId = draggingPersonId!;
        const why = refusal(userId);
        if (why) {
          window.dispatchEvent(new CustomEvent('siqt-toast', { detail: why }));
          return;
        }
        onAssign(userId);
        hapticTap();
        setJustAssigned(true);
        window.setTimeout(() => setJustAssigned(false), 600);
      },
    },
  };
}
