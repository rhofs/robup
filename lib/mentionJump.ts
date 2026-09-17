import type { MentionKind } from './mentions';

// Where a mention chip goes when it is tapped.
//
// A registered handler rather than a prop, for the same reason lib/nativeBack.ts is: the thing that
// knows how to navigate (app/page.tsx — it owns activeView, the nav state and the task modal stack)
// is not the thing rendering the chip (a chat message, several components down, reached through no
// prop chain at all). Threading a callback down to it would mean giving ChatPanel a prop it has no
// other use for, and ChatSidebar, and the thread panel.
//
// One slot, set once by the page. Anything rendering a chip calls runMentionJump and does not need
// to know what happens next.
let handler: ((kind: MentionKind, id: string) => void) | null = null;

export function setMentionJumpHandler(fn: ((kind: MentionKind, id: string) => void) | null): void {
  handler = fn;
}

export function runMentionJump(kind: MentionKind, id: string): void {
  handler?.(kind, id);
}
