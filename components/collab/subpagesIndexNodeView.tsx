'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { SubpagesIndexNode } from '../../lib/collab/subpagesIndexNode';
import SubpagesIndexBlock from './SubpagesIndexBlock';
import type { TaskDoc } from '../../store/useTaskStore';

export type SubpagesIndexExtensionOptions = {
  onOpenDoc?: (docId: string) => void;
  // Same right-click menu the sidebar's own Doc rows open (rename/appearance/color/delete) —
  // without this, a subpage listed inside this in-content table had no way to do any of that
  // short of navigating into it first and finding it in the sidebar separately.
  onContextMenu?: (e: React.MouseEvent, doc: TaskDoc) => void;
};

// Client-only extension of the shared, framework-agnostic SubpagesIndexNode (see mentionNodeView.tsx
// for the identical pattern applied to `mention`) — adds the live React table rendering, which the
// server doesn't need.
export const ClientSubpagesIndexNode = SubpagesIndexNode.extend<SubpagesIndexExtensionOptions>({
  addOptions() {
    return { onOpenDoc: undefined, onContextMenu: undefined };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpagesIndexBlock);
  },
});
