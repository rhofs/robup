import { collabSchema } from '@/lib/collab/schema';
import { legacyContentToDocJSON } from '@/lib/collab/legacyContentToDocJSON';

// The text an agent writes for a new Doc, as the document the editor shows. Agents write Markdown
// by habit; pasted in as plain text it would arrive as a page of "##" and "**". This reads the
// part of Markdown that maps cleanly onto what a Siqt Doc has — headings, bullet / numbered / check
// lists, quotes, code blocks, rules, bold, italic, links — and leaves everything else as the text
// it was. It is deliberately small: a line it does not recognise is a paragraph, never an error.
//
// The result is checked against the editor's own schema (lib/collab/schema.ts). If it does not
// fit, the plain text is used instead, so the words are never lost to a formatting mistake.

type PM = { type: string; attrs?: Record<string, unknown>; content?: PM[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };

const INLINE = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;

function inline(text: string): PM[] {
  const out: PM[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    const bold = m[2] ?? m[3];
    const italic = m[4] ?? m[5];
    if (bold) out.push({ type: 'text', text: bold, marks: [{ type: 'bold' }] });
    else if (italic) out.push({ type: 'text', text: italic, marks: [{ type: 'italic' }] });
    else if (m[6]) out.push({ type: 'text', text: m[6], marks: [{ type: 'link', attrs: { href: m[7] } }] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const paragraph = (text: string): PM => {
  const content = inline(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

export function markdownToDocJSON(markdown: string): Record<string, unknown> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: PM[] = [];
  // Consecutive list lines of one kind become one list.
  const pushItem = (listType: 'bulletList' | 'orderedList' | 'taskList', item: PM) => {
    const prev = blocks[blocks.length - 1];
    if (prev?.type === listType) prev.content!.push(item);
    else blocks.push({ type: listType, content: [item] });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ type: 'codeBlock', ...(code.length ? { content: [{ type: 'text', text: code.join('\n') }] } : {}) });
      continue;
    }
    if (!line.trim()) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', attrs: { level: heading[1].length }, content: inline(heading[2].trim()) });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      continue;
    }
    const check = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (check) {
      pushItem('taskList', { type: 'taskItem', attrs: { checked: check[1] !== ' ' }, content: [paragraph(check[2])] });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      pushItem('bulletList', { type: 'listItem', content: [paragraph(bullet[1])] });
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      pushItem('orderedList', { type: 'listItem', content: [paragraph(numbered[1])] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({ type: 'blockquote', content: [paragraph(quote[1])] });
      continue;
    }
    blocks.push(paragraph(line));
  }
  const doc = { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
  try {
    collabSchema.nodeFromJSON(doc).check();
    return doc;
  } catch {
    return legacyContentToDocJSON(markdown);
  }
}
