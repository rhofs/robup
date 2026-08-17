import type { ReactNode } from 'react';

// Deliberately minimal — not a CommonMark parser, just the four token types actually asked for:
// fenced code blocks, inline code, bold, italic. Consistent with this codebase's existing
// preference for small hand-rolled utilities (see ChatPanel.tsx's own dayLabel/groupIntoDays)
// over pulling in a markdown dependency for four token types (confirmed nothing like this exists
// anywhere in the app yet).

const CODE_CLASS = 'px-1 py-0.5 rounded bg-[#18181b] border border-[#27272a] font-mono text-[0.9em]';

// Fenced blocks are split out first, over the raw string, so nothing inside one gets run through
// the inline pass below (an inline `*`/`` ` `` inside a code block must render literally).
const FENCE_RE = /```(?:[a-zA-Z0-9_-]*\n)?([\s\S]*?)```/g;

function splitCodeBlocks(body: string): { code: boolean; content: string }[] {
  const blocks: { code: boolean; content: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(body))) {
    if (m.index > last) blocks.push({ code: false, content: body.slice(last, m.index) });
    blocks.push({ code: true, content: m[1].replace(/\n$/, '') });
    last = FENCE_RE.lastIndex;
  }
  if (last < body.length || blocks.length === 0) blocks.push({ code: false, content: body.slice(last) });
  return blocks;
}

// One combined pass over a plain-text segment — `` `code` `` first (highest precedence, its
// contents are never re-parsed for bold/italic), then **bold**, then *italic*/_italic_.
const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const raw = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) nodes.push(<code key={key} className={CODE_CLASS}>{raw.slice(1, -1)}</code>);
    else if (m[2]) nodes.push(<strong key={key} className="font-semibold">{raw.slice(2, -2)}</strong>);
    else nodes.push(<em key={key}>{raw.slice(1, -1)}</em>);
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderChatMessageBody(body: string): ReactNode {
  return splitCodeBlocks(body).map((b, idx) =>
    b.code ? (
      <pre key={idx} className="my-1 px-2.5 py-2 rounded bg-[#18181b] border border-[#27272a] overflow-x-auto">
        <code className="font-mono text-[12px] text-neutral-200 whitespace-pre">{b.content}</code>
      </pre>
    ) : (
      <span key={idx} className="whitespace-pre-wrap">
        {renderInline(b.content, `t${idx}`)}
      </span>
    )
  );
}
