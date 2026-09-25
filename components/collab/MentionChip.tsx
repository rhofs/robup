'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import type { MentionKind } from '../../lib/mentions';
import { MentionChip as Chip } from '../MentionText';
import type { MentionSuggestionExtensionOptions } from './mentionSuggestion';

// Node view for the `mention` node (lib/collab/mentionNode.ts). The chip itself is the same one a
// posted comment or chat message shows (components/MentionText.tsx) — this used to be a third copy
// of it, kept "in sync deliberately", which held until a new kind had to be added to all three.
// Only the wrapper is the editor's own: a node view has no route back to CollabDocEditor's props, so
// `onJump` comes from the extension's options (components/collab/mentionNodeView.tsx).
export default function MentionChip({ node, extension }: ReactNodeViewProps) {
  const { kind, id, label } = node.attrs as { kind: MentionKind; id: string; label: string };
  const onJump = (extension.options as MentionSuggestionExtensionOptions).onJump;
  return (
    <NodeViewWrapper as="span" className="inline">
      <span contentEditable={false}>
        <Chip kind={kind} id={id} label={label} onJump={onJump} />
      </span>
    </NodeViewWrapper>
  );
}
