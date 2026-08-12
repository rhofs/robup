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
import { MentionNode } from './mentionNode';
import { SubpagesIndexNode } from './subpagesIndexNode';
import { CommentMark } from './commentMark';

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
  Heading.configure({ levels: [1, 2] }),
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
  MentionNode,
  SubpagesIndexNode,
  CommentMark,
];

export const collabSchema = getSchema(collabExtensions);
