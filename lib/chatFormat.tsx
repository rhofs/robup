import type { ReactNode } from 'react';

import { parseMentions } from './mentions';
import { MentionChip } from '../components/MentionText';
import { runMentionJump } from './mentionJump';
// Deliberately minimal — not a CommonMark parser, just the token types actually asked for:
// fenced code blocks, inline code, links, bold, italic. Consistent with this codebase's existing
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

// Web addresses in a message are links — "Kan ikke trykke på links i chat. Det er bare vanlig tekst"
// (2026-11-19). They were never linked at all; the formatter knew four token types and a URL was not
// one of them.
//
// What counts: http(s)://… and www.…, up to the next whitespace. Punctuation that ends a sentence is
// left out of the link ("se https://siqt.no." links siqt.no, not "siqt.no."), and so is a closing
// bracket the address did not open itself — "(https://example.com)" — while a Wikipedia address with
// "(disambiguation)" in it keeps its own.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url[url.length - 1];
    if (/[.,;:!?'"*_]/.test(last)) {
      url = url.slice(0, -1);
    } else if (last === ')' && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    } else if (last === ']' && (url.match(/\]/g)?.length ?? 0) > (url.match(/\[/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

// Only web addresses are ever made into links here, so nothing typed into a message can become a
// javascript: link. Another site opens in a new tab (in the Android app: the phone's browser, so
// Siqt stays where it was); an address on siqt.no itself opens in place.
function ChatLink({ href, text }: { href: string; text: string }) {
  let sameSite = false;
  try {
    sameSite = typeof window !== 'undefined' && new URL(href).origin === window.location.origin;
  } catch {
    // Not a URL after all; it still renders as a link to what was written.
  }
  return (
    <a
      href={href}
      {...(sameSite ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      // A message's own handlers (the long-press for its actions) must not also see the tap.
      onClick={(e) => e.stopPropagation()}
      className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 hover:decoration-blue-400 [overflow-wrap:anywhere]"
    >
      {text}
    </a>
  );
}

// Splits plain text into text and links. Runs before bold/italic for the same reason mentions do:
// `_` and `*` are common inside addresses (https://example.com/a_b_c), and the formatter would read
// them as italics and cut the address in half.
function renderLinks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    const url = trimUrl(m[0]);
    // "www." alone, or an address that was nothing but punctuation after the scheme.
    if (url.length < m[0].length) URL_RE.lastIndex = m.index + url.length;
    if (!/^(https?:\/\/|www\.)[^./]/i.test(url) || /^www\.$/i.test(url)) continue;
    if (m.index > last) nodes.push(...renderEmphasis(text.slice(last, m.index), `${keyPrefix}-${i}`));
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    nodes.push(<ChatLink key={`${keyPrefix}-l${i++}`} href={href} text={url} />);
    last = m.index + url.length;
  }
  if (last < text.length) nodes.push(...renderEmphasis(text.slice(last), `${keyPrefix}-${i}`));
  return nodes;
}

const CODE_RE = /`[^`\n]+`/g;
// **bold**, then *italic*/_italic_.
const EMPHASIS_RE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  EMPHASIS_RE.lastIndex = 0;
  while ((m = EMPHASIS_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const raw = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) nodes.push(<strong key={key} className="font-semibold">{raw.slice(2, -2)}</strong>);
    else nodes.push(<em key={key}>{raw.slice(1, -1)}</em>);
    last = EMPHASIS_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// A plain-text segment, in order of precedence: `` `code` `` first (its contents are never re-parsed
// — an address inside backticks stays code), then links, then **bold** and *italic*/_italic_.
// renderEmphasis and renderLinks keep their own regex state, so the nesting does not disturb this loop.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const code = new RegExp(CODE_RE.source, 'g');
  while ((m = code.exec(text))) {
    if (m.index > last) nodes.push(...renderLinks(text.slice(last, m.index), `${keyPrefix}-${i}`));
    nodes.push(<code key={`${keyPrefix}-c${i++}`} className={CODE_CLASS}>{m[0].slice(1, -1)}</code>);
    last = code.lastIndex;
  }
  if (last < text.length) nodes.push(...renderLinks(text.slice(last), `${keyPrefix}-${i}`));
  return nodes;
}

// Mentions are resolved BEFORE the inline formatter runs, not after.
//
// The token is `@[Some Title](task:id)`, and a title containing an underscore or an asterisk would
// otherwise be read as italics or bold by the formatter below and half the token would disappear
// into markup. Splitting first means the formatter only ever sees text that is genuinely text.
function renderWithMentions(text: string, keyPrefix: string): ReactNode[] {
  const segments = parseMentions(text);
  if (segments.length === 1 && segments[0].type === 'text') return renderInline(text, keyPrefix);
  return segments.map((seg, i) =>
    seg.type === 'text' ? (
      <span key={`${keyPrefix}-t${i}`}>{renderInline(seg.value, `${keyPrefix}-${i}`)}</span>
    ) : (
      <MentionChip key={`${keyPrefix}-m${i}`} kind={seg.kind} id={seg.id} label={seg.label} onJump={runMentionJump} />
    )
  );
}

export function renderChatMessageBody(body: string): ReactNode {
  return splitCodeBlocks(body).map((b, idx) =>
    b.code ? (
      <pre key={idx} className="my-1 px-2.5 py-2 rounded bg-[#18181b] border border-[#27272a] overflow-x-auto">
        <code className="font-mono text-[12px] text-neutral-200 whitespace-pre">{b.content}</code>
      </pre>
    ) : (
      <span key={idx} className="whitespace-pre-wrap">
        {renderWithMentions(b.content, `t${idx}`)}
      </span>
    )
  );
}
