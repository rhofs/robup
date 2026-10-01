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
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { MentionNode } from './mentionNode';
import { SubpagesIndexNode } from './subpagesIndexNode';
import { CommentMark } from './commentMark';
import { FileAttachmentNode } from './fileAttachmentNode';
import { TaskListEmbedNode } from './taskListEmbedNode';

// Bumped whenever a node or mark is added to the schema below. An editor that does not know a node
// does not just fail to show it: y-prosemirror DELETES any element it cannot build from the shared
// document (y-tiptap's createNodeFromYElement, the catch branch) — so one tab left open on old code
// would silently strip every new block from the doc for everyone. The collab server refuses doc
// connections that do not present the current version (server/collabServer.ts, onAuthenticate), and
// CollabDocEditor sends it as its token and asks for a reload when it is turned away. Tabs from before
// this existed send no token at all, so they are turned away too.
//   1 — implicit, everything before checklists
//   2 — Heading 3, quote, divider, checklist (taskList/taskItem), live task list (taskListEmbed)
export const DOC_SCHEMA_VERSION = 2;
export const docSchemaToken = () => `doc-schema:${DOC_SCHEMA_VERSION}`;

// Paragraphs + mentions + bold/italic/underline/strike/headings(1-2)/bullet+ordered lists/text
// align/links/font family+size/text+highlight color. Shared by the server (schema/migration) and
// the client editor (as part of its fuller extension list) so both ever construct/read the exact
// same node shapes — a document built by one and read by the other can't drift apart. FontFamily/
// Color/FontSize all attach their own attribute onto the same shared `textStyle` mark rather than
// being three separate marks — Tiptap's own composition pattern, and why TextStyle itself has to
// be listed even though nothing directly toggles it.
export const collabExtensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Underline,
  Strike,
  Heading.configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  HardBreak,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Highlight.configure({ multicolor: true }),
  Image,
  CodeBlock,
  Blockquote,
  HorizontalRule,
  TaskList,
  TaskItem.configure({ nested: true }),
  TaskListEmbedNode,
  MentionNode,
  SubpagesIndexNode,
  CommentMark,
  FileAttachmentNode,
];

export const collabSchema = getSchema(collabExtensions);
