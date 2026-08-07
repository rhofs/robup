import { getSchema } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { MentionNode } from './mentionNode';

// Deliberately minimal — paragraphs + mentions only, no bold/italic/lists/headings. Same
// formatting ceiling as the old <textarea>, just live. Shared by the server (schema/migration)
// and the client editor (as part of its fuller extension list) so both ever construct/read the
// exact same node shapes — a document built by one and read by the other can't drift apart.
export const collabExtensions = [Document, Paragraph, Text, MentionNode];

export const collabSchema = getSchema(collabExtensions);
