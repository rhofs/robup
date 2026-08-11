'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { SubpagesIndexNode } from '../../lib/collab/subpagesIndexNode';
import SubpagesIndexBlock from './SubpagesIndexBlock';

export type SubpagesIndexExtensionOptions = {
  onOpenDoc?: (docId: string) => void;
};

// Client-only extension of the shared, framework-agnostic SubpagesIndexNode (see mentionNodeView.tsx
// for the identical pattern applied to `mention`) — adds the live React table rendering, which the
// server doesn't need.
export const ClientSubpagesIndexNode = SubpagesIndexNode.extend<SubpagesIndexExtensionOptions>({
  addOptions() {
    return { onOpenDoc: undefined };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpagesIndexBlock);
  },
});
