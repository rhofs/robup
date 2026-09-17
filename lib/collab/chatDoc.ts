import type { JSONContent } from '@tiptap/core';
import { parseMentions } from '../mentions';

// Chat messages are stored as the same plain-text `@[Label](kind:id)` string every other surface
// uses, NOT as editor JSON.
//
// That is deliberate and worth defending: the storage format is what the server reads to find who
// was mentioned, what the push notification quotes, what search indexes, and what every already-sent
// message in the database is. Changing the wire format to suit a new editor would mean migrating
// history and rewriting three unrelated readers. The editor is a way of typing; it is not the truth.
//
// So these two functions are the whole bridge: text in, document out, document back to text.

export function chatTextToDoc(text: string): JSONContent {
  const paragraphs = text.split('\n');
  return {
    type: 'doc',
    content: paragraphs.map((line) => ({
      type: 'paragraph',
      content: parseMentions(line)
        .map((seg) =>
          seg.type === 'text'
            ? seg.value
              ? { type: 'text' as const, text: seg.value }
              : null
            : { type: 'mention' as const, attrs: { kind: seg.kind, id: seg.id, label: seg.label } }
        )
        .filter((n): n is NonNullable<typeof n> => n !== null),
    })),
  };
}

export function chatDocToText(doc: JSONContent | null | undefined): string {
  if (!doc?.content) return '';
  const paragraph = (node: JSONContent): string =>
    (node.content ?? [])
      .map((child) => {
        if (child.type === 'text') return child.text ?? '';
        if (child.type === 'mention') {
          const { kind, id, label } = child.attrs ?? {};
          // Falls back to the label alone if the node somehow lost its ids — better a plain word in
          // the message than a broken token that renders as a dead chip for everyone who reads it.
          return kind && id ? `@[${label}](${kind}:${id})` : (label ?? '');
        }
        if (child.type === 'hardBreak') return '\n';
        return '';
      })
      .join('');
  return doc.content.map(paragraph).join('\n');
}
