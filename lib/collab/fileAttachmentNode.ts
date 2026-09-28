import { Node, mergeAttributes } from '@tiptap/core';

// A file placed in a doc — a contract template, a spreadsheet, a PDF — shown as a chip with its name
// that opens the file. Asked for with a ClickUp screenshot of exactly that ("I ClickUp kan vi putte
// filer inn i docs, som en link").
//
// An inline atom like the mention node: it moves and deletes as one unit, and sits in a line of text
// or on a line of its own. The file itself lives in public/uploads/docs (the upload route); the node
// only carries where it is and what it is called, because the stored name is a uuid and the name a
// person gave the file would otherwise be lost.
//
// Framework-agnostic so the collab server's schema (lib/collab/schema.ts) knows the node too; the
// React chip is layered on in components/collab/fileAttachmentView.tsx.
export interface FileAttachmentAttrs {
  url: string;
  name: string;
  size: number | null;
  mime: string | null;
}

export const FileAttachmentNode = Node.create({
  name: 'fileAttachment',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: null },
      name: { default: 'File' },
      size: { default: null },
      mime: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-file-url]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-url': node.attrs.url,
        'data-file-name': node.attrs.name,
      }),
      node.attrs.name,
    ];
  },

  renderText({ node }) {
    return node.attrs.name;
  },
});

// Where a file chip points, with the name to save it under — the upload route stores files under a
// uuid, and the serving route turns `name` into a Content-Disposition filename.
export function fileAttachmentHref(url: string, name: string): string {
  return `${url}?name=${encodeURIComponent(name)}`;
}
