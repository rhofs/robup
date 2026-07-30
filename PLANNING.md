# RobUp — Planning & Progress

_Last updated: 2026-07-30_

RobUp is a ClickUp-style task manager: Next.js 16 (App Router, Turbopack) + Prisma/SQLite + Zustand. Paused for a while in favor of Huly, now being actively picked back up.

## What's built and working

**Hierarchy:** Workspace > Space > Folder (nested, unlimited depth, optional) > List > Task > Subtask. A List can live directly under a Space with no folder. Spaces, Folders, and Lists all support a custom color + icon via right-click context menu ("Edit appearance" / "Rename" / "Delete" where applicable — Lists have no delete yet, see Next steps).

**Organizing the tree:**
- Drag-and-drop reparenting (drag a List/Folder onto another Folder to nest it, onto a Space header to un-nest it to that Space's top level) works **across Spaces**, not just within one — including moving a Folder with nested sub-folders/lists, which cascades their `spaceId` server-side.
- Drag-to-*reorder* siblings (drop a Folder on a sibling Folder, a List on a sibling List, or a Space header on another Space header) reorders them in place instead of nesting/doing nothing. Folder-onto-folder disambiguates by relationship: dropping on an existing sibling reorders; dropping on a folder elsewhere in the tree nests, same as before.
- Folder expand/collapse state persists across reloads (`localStorage`, key `robup.collapsedFolders`).
- Dropping a *task* onto a Space or Folder (rather than a specific List) lands it in the first List found anywhere inside, recursively — if there isn't one, a toast explains why instead of doing nothing silently.

**Tasks (list view):**
- Sortable/resizable/reorderable columns (Name, Status, Assignee, dates, custom fields), persisted in `localStorage`.
- Custom fields, per-space statuses, assignees, archive/restore, bulk select + move/archive/delete.
- Task detail modal: subtasks table, named docs with autosave, comments/activity feed (collapsible, animated in/out), timeframe (start/due + time-of-day). Row-into-modal "magic move" expand animation.
- Sidebar: recursive Folder/List tree (`components/FolderTree.tsx`).

**Calendar view** (`components/calendar/`), labeled "Planner" in the nav rail:
- Month / Week / Day granularity, Gantt-style bars with lane assignment so a task keeps the same lane across week breaks — lane assignment and the visible-lane cap are now computed **per connected overlap cluster**, not globally across the whole visible range (see today's session), so a task that's no longer crowded reliably becomes visible again.
- Overflow past the visible-lane cap ("+N more") lives in its own reserved strip below the bars, not overlapping them, and is clickable to drill into that day.
- Day view lays out same-day timed events in side-by-side columns instead of stacking them on top of each other.
- Drag to reschedule: move (preserves duration) and resize-from-either-edge (works even on tasks that only have one of start/due set).
- Cross-week-row dragging via a live "ghost" preview. ISO week numbers, hover "+" quick-add per day, header "+ New task" button.
- Task creation is a required dialog (`components/CreateTaskModal.tsx`): Space and List must both be chosen explicitly — no "unsorted" fallback.
- **Calendar has its own sidebar mode**: multi-select filter (checkboxes, tri-state at any folder depth) instead of the Tasks tab's single-selection navigation. Same `FolderTree` component, different mode.

**Navigation:** Huly-style narrow icon rail (Tasks / Planner) to the left of the sidebar. (Internally `activeView` is still `'board' | 'calendar'`.)

**Visual design:** Matches Huly's look — neutral gray (`neutral-*`, not `slate-*`, which has a blue undertone) for chrome, blue reserved for buttons/selected state, sharp-ish corners, custom thin scrollbars, muted/pastel accent palette (`FIELD_COLOR_CHOICES` in `page.tsx`) for statuses/Space/Folder/List colors and user avatars.

## Today's session (2026-07-30)

**Part 1 — Gantt bars silently vanishing on crowded days** (user report: bars disappear past 4 overlapping and don't come back). Two real, separate bugs found and fixed (committed `73d83b4`):
- The "+N more" overflow indicator was rendered inside the day-number badge's own zone — the exact spot where visible bars start — so on the busiest days (the ones that most needed the indicator) it was painted over and invisible. Fixed by giving it its own reserved strip (`overflowTop` in `CalendarView.tsx`, rendered in `WeekRow.tsx`) with explicit `z-10` (needed because the day-cell's full-height button was otherwise intercepting clicks despite later DOM order — root cause not fully explained, pragmatically fixed).
- **Day view** had no lane/collision logic at all for same-day timed events — they rendered `absolute left-0 right-0` directly on top of each other, so only the last one in paint order was ever visible, no indication anything else was there. Fixed with a new `layoutDayColumns` helper (`lib/ganttLayout.ts`) that splits same-day overlapping events into side-by-side columns, grouped per connected overlap cluster.
- While re-verifying, the user found a third, deeper issue: freeing up space on a crowded day didn't reduce its "+N more" count or bring a hidden task back. Root cause: `assignLanes`'s lane numbering and cap-compaction ran **globally** across the whole visible month, so a task with real breathing room on its own day could stay stuck past the cap just because some unrelated pileup elsewhere in the month still occupied the low lane numbers. Fixed by scoping both lane assignment and compaction to each connected overlap cluster instead of the whole range. (Introduced-then-caught a same-day edge case in the process: the cluster-merge boundary used strict `<` instead of `<=`, which wrongly treated two tasks with an identical single-day range as non-overlapping.)

**Part 2 — five "smaller polish" items from the previous session's Next steps list**, all done and Playwright-verified:
1. Raised `MONTH_MAX_LANES`/`WEEK_MAX_LANES` (4→6, 8→12) now that bars are thinner, so more overlap is visible before "+N more" kicks in.
2. Folder expand/collapse now persists (`localStorage`).
3. Folder context menu gained Rename + Delete (previously only "Edit appearance").
4. Dropping a task onto a Folder row now lands it in the first List found recursively inside, instead of doing nothing.
5. Drag-to-reorder among Folder/List siblings, using a new `order` field already on both models — see "Organizing the tree" above for the reorder-vs-nest disambiguation rule.

**Part 3 — four more requests from continued use**, all done and Playwright-verified:
1. **Cross-Space drag-and-drop.** Previously, moving a List/Folder into a different Space's Folder or onto its header silently did nothing — the code only ever looked up the drop target inside the *source* Space. Fixed by searching all Spaces for the target, and by teaching the API (`/api/folders/[id]`, `/api/lists/[id]`) to accept a `spaceId` change; moving a Folder now cascades the new `spaceId` down through every nested sub-folder and List server-side. Cross-Space moves resync via a new lightweight `refetchWorkspaces` store action instead of trying to hand-patch two Space objects' arrays in place.
2. **List context menu** (Rename + Edit appearance), mirroring Folder's. `List` gained nullable `color`/`icon` columns.
3. **Space reordering**, same drag-to-reorder pattern as Folder/List, using a new `order` field on `Space`. Space headers are now both draggable (`space-drag:${id}`) and droppable (`space:${id}`, reused from the existing task-drop/cross-Space-move target — same "reuse the existing droppable, dispatch on the dragged id's prefix" trick used for List reordering, to avoid a second droppable colliding on the same rect).
4. **Toast on invalid task drop.** Dropping a task onto a Space or Folder with no List anywhere inside it (recursively) now shows a bottom-of-screen message explaining why, instead of silently doing nothing. First minimal toast system in the app (`toast` state + `showToast()` in `page.tsx`, no library).

All of today's work verified in a real browser via Playwright against the dev server, not just eyeballed — including cascading `spaceId` updates checked via direct `/api/workspaces` fetches, not just optimistic UI state.

Schema changes today: `List.color`, `List.icon`, `Space.order` (all via `prisma db push`, no migrations dir in this project).

## Next steps / not built yet

**Bigger features, not started:**

- **Space "home page."** Clicking a Space currently jumps straight to a flat view of every task inside it. Wanted instead: a dedicated home page for the Space (editable description, maybe an image) — where "see all tasks" moves to isn't decided yet (a button on that home page? still available by clicking a List?). Needs a design pass before implementation.
- **Multi-select Lists in the sidebar** (Shift-click for a range, Ctrl/Cmd-click to toggle individual ones), showing the union of tasks across every selected List instead of just one at a time. Overlaps conceptually with the Planner sidebar's existing tri-state checkbox filter, but that's Calendar-only and multi-select — this would be for the Tasks-tab single-selection navigation, which is a different code path (`activeListId` is currently a single value, not a set).
- **Browser back/forward button support.** The app has no URL-based routing at all right now (`activeSpaceId`/`activeListId`/modal stack are all plain `useState`, nothing pushed to browser history), so the back button leaves the app entirely instead of stepping back through the last space/list/modal visited. Needs a scoping decision: just Space/List navigation, or modals (task detail open/close) too — the latter is a much bigger change.
- **Ctrl+Z / undo.** Still wanted, not started. Needs its own scoping pass: everything (task edits, deletes, moves, folder/list/space changes, status/custom-field edits, comments...) or just the most common/costly-to-redo actions (delete, bulk move)? A comprehensive undo stack across every mutation type in this app is a substantial project on its own.
- **Office tab.** A new top-level nav-rail tab (alongside Tasks/Planner) — scope/design not fleshed out yet.
- **Docs nesting.** Task docs are currently a flat per-task list with autosave and `order`. Nesting them is not designed yet.
- **Real-time collaborative editing** for Docs via Yjs + Tiptap + Hocuspocus. Needs its own backend process.
- **`.ics` calendar feed** for external calendar apps to subscribe to. Needs a public, token-scoped API route.

**Smaller polish items / known UX friction:**

- **Reordering Spaces is hard to use, especially moving one upward** — there's no indicator of where it'll land before you drop it. Wanted: either the row you're hovering over shifts out of the way live (a proper `SortableContext`-style animated reorder, like the existing column/status/doc reordering already does) or some other "here's where this will go" preview. Right now it's an all-or-nothing drop with no visual feedback until after.
- **The "+N more" overflow indicator in the Planner month view sits ambiguously between two day cells.** Wanted: pin it clearly to the bottom of *its own* day, and consider a visual treatment that reads more like "more Gantt bars are stacked here" (e.g. a thin partial/ghost bar) rather than plain text, so it's obvious at a glance that it means more tasks rather than reading as unrelated to the day above or below it.
- No task-drop-onto-List-via-Folder precise positioning — dropping a task always lands at the *first* list found, never a specific nested one two folders deep, unless you navigate there directly.
- `deleteList` doesn't exist yet — no UI or API path to delete a List at all (only rename/appearance/move).

## Known bugs / things to remember

- **dnd-kit gotcha**: `useDraggable`/`useDroppable` bind to the *nearest ancestor* `DndContext` by React-tree position, not by id-naming intent. Fix: one shared `DndContext` for all sidebar/task dragging, dispatch in `onDragEnd` by inspecting the dragged id's prefix (`task id`, `list-drag:`, `folder-drag:`, `space-drag:`).
- **A second droppable on the exact same DOM rect ties in collision detection** — dnd-kit's `closestCenter` can't meaningfully prefer one over the other when their centers are identical, so the "winner" is effectively arbitrary. Hit this twice: once (correctly avoided) by reusing List's existing `list:` task-drop target for List-reorder instead of adding a second droppable there; and initially got it wrong for Space reordering in the same way before applying the same fix. When something is draggable AND needs a reorder-drop-target at the same location, reuse an existing droppable id and disambiguate by the *dragged* id's prefix instead of registering a second `useDroppable` there.
- **Interval/cluster boundary math needs `<=`, not `<`, for single-point-in-time ranges.** A same-day task has `start === end`; a merge-overlapping-intervals boundary check using strict `<` will treat two such tasks as non-overlapping neighbors instead of a real conflict. Hit this in `assignLanes` (calendar lanes) — watch for it again if any other interval-clustering code gets added.
- **Async store actions in drag-end handlers are fire-and-forget.** `reorderSpace`/`reorderList`/`updateFolder` etc. return promises but callers don't await them — fine for the app itself (optimistic local state updates synchronously), but when verifying via a direct API fetch right after a script-driven drag, give the network request a moment (a few hundred ms to ~1s) before checking, or the check can race ahead of the PATCH actually landing and look like a failure that isn't one.
- **Framer Motion `layoutId` gotcha**: matches globally by default (no `LayoutGroup` in this app) — scope the id string to whatever makes two instances *actually* the same logical element (see `TaskRow`'s `navScope` prop).
- Tailwind's `slate-*` palette has a real blue undertone — use `neutral-*` for "neutral gray."
- This machine reliably needs a dev-server restart after any `prisma db push`/schema change: `prisma generate` fails with `EPERM` on the query-engine DLL while the dev server holds it open. Find the node processes via `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` (look for `next dev`/`start-server.js` under the project path), stop them, `prisma generate`, then restart `npm run dev`. Hit this twice today (once for `List.color`/`icon`, once for `Space.order`) — budget for it any time a Prisma schema field is added.
- Turbopack dev-mode cold-compile quirk: the very first hit to a changed API route can occasionally return a truncated/empty response, throwing "Unexpected end of JSON input" client-side. Harmless, resolves on the next request.
- Seed/dev data currently has "Ideer" and "IDeer irl" test folders, plus a "Marketing Super" empty folder under Marketing — cosmetic leftovers from verification passes, feel free to reset.
