'use client';

import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskListEmbedNode } from '../../lib/collab/taskListEmbedNode';
import TaskListEmbedBlock from './TaskListEmbedBlock';

export type TaskListEmbedExtensionOptions = {
  onOpenTask?: (taskId: string) => void;
};

// Client-only extension of the shared TaskListEmbedNode — adds the live React rendering, which the
// collab server does not need (same pattern as subpagesIndexNodeView.tsx).
export const ClientTaskListEmbedNode = TaskListEmbedNode.extend<TaskListEmbedExtensionOptions>({
  addOptions() {
    return { onOpenTask: undefined };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskListEmbedBlock);
  },
});
