import { DOMParser as PMDOMParser, DOMSerializer, type Node as PMNode } from '@tiptap/pm/model';
import { collabSchema } from './schema';
import { isRichHtml, plainToHtml } from '../richText';

// Browser-only helpers for a task's description doc (components/TaskDescriptionDoc.tsx). Both go
// through the Docs schema rather than the DOM's own HTML handling: whatever is in Task.description
// comes out as Doc content — only nodes, marks and attributes the schema knows, nothing else — which
// is also what makes it safe to show.

// The description as Doc content. A DOMParser document is inert: no scripts run and no images load
// while it is read.
//
// Comment highlights are left behind: they point at comments in the doc they were made in, and a
// description copied from another task (a duplicate, a template) would carry highlights that open
// nothing. They have to go before parsing — a comment's <mark> is also what a highlight looks like,
// and the highlight is what it would be read as.
function parseDescription(description: string): PMNode {
  const html = isRichHtml(description) ? description : plainToHtml(description);
  const dom = new window.DOMParser().parseFromString(html, 'text/html');
  dom.body.querySelectorAll('mark[data-comment-id]').forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  return PMDOMParser.fromSchema(collabSchema).parse(dom.body);
}

// What a new description doc starts from — sent to app/api/tasks/[id]/description-doc.
export function descriptionToDocJSON(description: string | null): Record<string, unknown> | null {
  if (!description || typeof window === 'undefined') return null;
  try {
    return parseDescription(description).toJSON() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// The description drawn into `el` the way the editor will draw it, for the moment before the live
// doc has arrived.
export function renderDescriptionPreview(el: HTMLElement, description: string | null) {
  if (!description) {
    el.replaceChildren();
    return;
  }
  try {
    const doc = parseDescription(description);
    el.replaceChildren(DOMSerializer.fromSchema(collabSchema).serializeFragment(doc.content));
  } catch {
    el.replaceChildren();
  }
}
