'use client';

import { useEffect, useRef } from 'react';

// Sits at the end of a partially-rendered task list and asks for the next page once it scrolls into
// view. See app/page.tsx's visibleTaskCount for why the list grows in pages rather than being
// windowed: every row participates in drag-and-drop, a shared layout transition into the task
// modal, and enter/exit animations, all of which assume the row exists.
//
// rootMargin gives it a screen's worth of lead time, so the next page is already rendered by the
// time the user reaches it and the growth is never something they wait for.
export default function TaskListSentinel({
  remaining,
  onLoadMore,
}: {
  remaining: number;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Held in a ref so the observer below never needs re-creating when the callback identity changes
  // — re-creating it mid-scroll would drop the very intersection it exists to catch.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin: '600px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="py-3 text-center">
      <button
        onClick={onLoadMore}
        className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
      >
        {remaining} more
      </button>
    </div>
  );
}
