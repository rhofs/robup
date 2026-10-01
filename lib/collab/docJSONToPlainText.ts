import { buildMentionToken, type MentionKind } from '../mentions';

type ProseMirrorJSONNode = {
  type: string;
  text?: string;
  attrs?: { kind?: MentionKind; id?: string; label?: string; alt?: string; src?: string; checked?: boolean };
  content?: ProseMirrorJSONNode[];
};

function inlineToText(nodes: ProseMirrorJSONNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text ?? '';
      // A file reads as its name — which is what search should find it by.
      if (node.type === 'fileAttachment') return `📎 ${(node.attrs as { name?: string } | undefined)?.name ?? 'File'}`;
      if (node.type === 'mention' && node.attrs?.kind && node.attrs.id && node.attrs.label) {
        return buildMentionToken(node.attrs.kind, node.attrs.id, node.attrs.label);
      }
      return '';
    })
    .join('');
}

// Recursively walks any block node into one or more plain-text lines — paragraphs/headings
// contribute one line each; bullet/ordered lists walk each listItem's own nested block(s) and
// prefix a marker, so a list/heading block still reads as a readable multi-line snippet in
// components/DocsBrowser.tsx's preview instead of silently going blank. Marks (bold/italic) are
// ignored throughout, same as before — this is a plain-text preview, not a formatted rendering.
function blockToLines(node: ProseMirrorJSONNode): string[] {
  if (node.type === 'paragraph' || node.type === 'heading') {
    return [inlineToText(node.content)];
  }
  // Atom block, no content array — the generic recurse-into-children fallback below would
  // silently contribute nothing at all rather than erroring, so give it an explicit placeholder.
  if (node.type === 'subpagesIndex') {
    return ['[Subpages]'];
  }
  if (node.type === 'taskListEmbed') {
    return ['[Tasks]'];
  }
  if (node.type === 'horizontalRule') {
    return ['---'];
  }
  if (node.type === 'blockquote') {
    return (node.content ?? []).flatMap(blockToLines).map((line) => `> ${line}`);
  }
  // Checklist: a box per item, ticked or not, the way plain-text to-do lists are usually written.
  if (node.type === 'taskList') {
    return (node.content ?? []).flatMap((item) => {
      const marker = item.attrs?.checked ? '[x] ' : '[ ] ';
      const lines = (item.content ?? []).flatMap(blockToLines);
      return lines.length ? lines.map((line, i) => (i === 0 ? `${marker}${line}` : line)) : [marker.trimEnd()];
    });
  }
  if (node.type === 'image') {
    return [`[Image${node.attrs?.alt ? `: ${node.attrs.alt}` : ''}]`];
  }
  // Unlike paragraphs, a codeBlock node's content is a single text node whose own `text` string
  // already contains literal `\n` characters for each line — inlineToText's plain concatenation
  // preserves that as-is, `.split('\n')` just breaks it back into one plain-text line per line so
  // it reads as a real multi-line snippet instead of one giant line. Fenced with ``` markers, the
  // universal plain-text convention for "this is code," same as every markdown-aware reader.
  if (node.type === 'codeBlock') {
    return ['```', ...inlineToText(node.content).split('\n'), '```'];
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = node.content ?? [];
    return items.flatMap((item, index) => {
      const lines = (item.content ?? []).flatMap(blockToLines);
      const marker = node.type === 'orderedList' ? `${index + 1}. ` : '- ';
      return lines.length ? lines.map((line, i) => (i === 0 ? `${marker}${line}` : line)) : [marker.trimEnd()];
    });
  }
  return (node.content ?? []).flatMap(blockToLines);
}

// The reverse of legacyContentToDocJSON — re-derives the plain-text `Doc.content` mirror from the
// live Tiptap/Yjs document on every persist (server/collabServer.ts's onStoreDocument), so
// components/DocsBrowser.tsx's preview keeps working unmodified. Re-emits `@[Label](kind:id)` via
// the same buildMentionToken every other mention surface uses, so content still looks exactly like
// it does today — not a "cleaned up" rendering.
export function docJSONToPlainText(doc: Record<string, any>): string {
  const typed = doc as ProseMirrorJSONNode;
  return (typed.content ?? []).flatMap(blockToLines).join('\n');
}
