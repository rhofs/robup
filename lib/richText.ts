import { MENTION_RE, mentionsToPlainText } from './mentions';

// A task's description: HTML from the rich editor (components/RichDescriptionEditor.tsx, the same
// formatting as Docs — "Mangler masse formatering for beskrivelsen … Kan du fikse så vi har det samme
// som i docs?", 2026-10-14) — or, for every description written before that, plain text with
// `@[Label](kind:id)` mention tokens. Both kinds live in the same column; these tell them apart and
// convert. No DOM here: the server uses it too (Google Calendar, the .ics feed).

// What the rich editor writes always starts with a block element.
export const isRichHtml = (s: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|hr|div)[\s>/]/i.test(s);

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// An old plain-text description as editor HTML: a paragraph per line, mention tokens as mention
// nodes (the shape lib/collab/mentionNode.ts parses).
export function plainToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let out = '';
      let last = 0;
      MENTION_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MENTION_RE.exec(line))) {
        out += escapeHtml(line.slice(last, m.index));
        const [, label, kind, id] = m;
        out += `<span data-mention-kind="${escapeHtml(kind)}" data-mention-id="${escapeHtml(id)}" data-mention-label="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
        last = m.index + m[0].length;
      }
      out += escapeHtml(line.slice(last));
      return `<p>${out}</p>`;
    })
    .join('');
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Plain text for places that only show plain text: lines kept, list items dashed, mentions as names.
export function richToPlainText(desc: string): string {
  if (!isRichHtml(desc)) return mentionsToPlainText(desc);
  return decodeEntities(
    desc
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, '\n')
      .replace(/<hr[^>]*>/gi, '\n---\n')
      .replace(/<span[^>]*data-mention-label="([^"]*)"[^>]*>.*?<\/span>/gi, '@$1')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n+(- )/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
