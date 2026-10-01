'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskListEmbedNode } from '../../lib/collab/taskListEmbedNode';
import TaskListEmbedBlock from './TaskListEmbedBlock';

export type TaskListEmbedExtensionOptions = {
  onOpenTask?: (taskId: string) => void;
  // The doc's own Space, where a List made from the block goes by default.
  spaceId?: string;
};

// Client-only extension of the shared TaskListEmbedNode — adds the live React rendering, which the
// collab server does not need (same pattern as subpagesIndexNodeView.tsx).
export const ClientTaskListEmbedNode = TaskListEmbedNode.extend<TaskListEmbedExtensionOptions>({
  addOptions() {
    return { onOpenTask: undefined, spaceId: undefined };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskListEmbedBlock);
  },
});
