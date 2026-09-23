-- Indexes only: no table is read, written or reshaped, and an index can be added to a live database
-- without touching a row. SQLite does not index foreign keys on its own, and these tables had none.
-- CreateIndex
CREATE INDEX "ChatMessage_channel_id_created_at_idx" ON "ChatMessage"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "Comment_task_id_idx" ON "Comment"("task_id");

-- CreateIndex
CREATE INDEX "Doc_space_id_deleted_at_idx" ON "Doc"("space_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Doc_task_id_idx" ON "Doc"("task_id");

-- CreateIndex
CREATE INDEX "Event_workspace_id_idx" ON "Event"("workspace_id");

-- CreateIndex
CREATE INDEX "Task_list_id_deleted_at_idx" ON "Task"("list_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Task_parent_id_idx" ON "Task"("parent_id");

