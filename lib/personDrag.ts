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

// Drop-target wiring for one bar. `canAccept(userId)` decides whether this person can go on it;
// `onAssign` does it. `isOver` drives the highlight, `justAssigned` a short confirmation pulse.
export function usePersonDrop(canAccept: (userId: string) => boolean, onAssign: (userId: string) => void) {
  const [isOver, setIsOver] = useState(false);
  const [justAssigned, setJustAssigned] = useState(false);

  const accepts = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(PERSON_DRAG_TYPE) && draggingPersonId !== null && canAccept(draggingPersonId);

  return {
    isOver,
    justAssigned,
    dropProps: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(PERSON_DRAG_TYPE)) return;
        if (!accepts(e)) {
          e.dataTransfer.dropEffect = 'none';
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isOver) setIsOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        // dragleave also fires when moving onto a child of the bar; only a real exit counts.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setIsOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        const userId = draggingPersonId!;
        onAssign(userId);
        hapticTap();
        setJustAssigned(true);
        window.setTimeout(() => setJustAssigned(false), 600);
      },
    },
  };
}
