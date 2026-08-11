import { getSchema } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Heading from '@tiptap/extension-heading';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import HardBreak from '@tiptap/extension-hard-break';
import { MentionNode } from './mentionNode';
import { SubpagesIndexNode } from './subpagesIndexNode';
import { CommentMark } from './commentMark';

// Paragraphs + mentions + bold/italic/headings(1-2)/bullet+ordered lists. Shared by the server
// (schema/migration) and the client editor (as part of its fuller extension list) so both ever
// construct/read the exact same node shapes — a document built by one and read by the other
// can't drift apart.
export const collabExtensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Heading.configure({ levels: [1, 2] }),
  BulletList,
  OrderedList,
  ListItem,
  HardBreak,
  MentionNode,
  SubpagesIndexNode,
  CommentMark,
];

export const collabSchema = getSchema(collabExtensions);
