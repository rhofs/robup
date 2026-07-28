'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type FloatingPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchor: ReactNode;
  align?: 'left' | 'right';
  panelClassName?: string;
  children: ReactNode;
};

const MARGIN = 6;

export default function FloatingPopover({
  open,
  onClose,
  anchor,
  align = 'left',
  panelClassName = '',
  children,
}: FloatingPopoverProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const updatePosition = () => {
      if (!anchorRef.current) return;
      const anchorRect = anchorRef.current.getBoundingClientRect();
      // The panel isn't necessarily rendered yet (first pass) — use the actual
      // size when it exists, otherwise a conservative guess for the first render.
      const panelRect = panelRef.current?.getBoundingClientRect();
      const panelWidth = panelRect?.width || 240;
      const panelHeight = panelRect?.height || 0;

      let top = anchorRect.bottom + 4;
      if (panelHeight && top + panelHeight > window.innerHeight - MARGIN) {
        const above = anchorRect.top - panelHeight - 4;
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - panelHeight - MARGIN);
      }

      let left = anchorRect.left;
      let right = window.innerWidth - anchorRect.right;
      if (align === 'left' && left + panelWidth > window.innerWidth - MARGIN) {
        left = Math.max(MARGIN, window.innerWidth - panelWidth - MARGIN);
      }
      if (align === 'right' && right + panelWidth > window.innerWidth - MARGIN) {
        right = Math.max(MARGIN, window.innerWidth - panelWidth - MARGIN);
      }

      setCoords((prev) => {
        if (prev && prev.top === top && prev.left === left && prev.right === right) return prev;
        return { top, left, right };
      });
    };

    updatePosition();
    // Run once more after the panel has mounted, so flip/clamping uses real measurements.
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div ref={anchorRef} className="inline-block">
        {anchor}
      </div>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.top,
              ...(align === 'right' ? { right: coords.right } : { left: coords.left }),
            }}
            className={`z-50 ${panelClassName}`}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
