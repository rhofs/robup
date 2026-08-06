import { create } from 'zustand';

export type HistoryEntry = {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
};

interface HistoryStore {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  push: (entry: HistoryEntry) => void;
  pushCoalesced: (key: string, entry: HistoryEntry) => void;
  endCoalesce: () => void;
  transaction: <T>(label: string, fn: () => T) => T;
  undo: () => Promise<string | null>;
  redo: () => Promise<string | null>;
}

// `pendingGroups` holds in-progress `transaction()` frames (a stack so transactions can nest —
// nesting isn't used anywhere today, but the shape falls out naturally from "push into whichever
// frame is on top, else the real stacks"). `coalesceKey`/`coalesceEntry` remember the most recent
// `pushCoalesced` call so a burst of same-key pushes (e.g. every keystroke of a doc autosave)
// collapses into a single undo step instead of flooding the stack — see `pushCoalesced` below.
let pendingGroups: HistoryEntry[][] = [];
let coalesceKey: string | null = null;
let coalesceEntry: HistoryEntry | null = null;
let isReplaying = false;

const commitCoalesced = (target: (entry: HistoryEntry) => void) => {
  // Clear the pending entry BEFORE calling target, not after: `push` calls this with a target
  // of `push` itself (to flush a pending coalesce before a fresh push), so if `coalesceEntry`
  // were still set when that reentrant `push` call ran, it would see the same non-null entry,
  // try to commit it again, and recurse without bound — a real infinite loop, not hypothetical.
  const entry = coalesceEntry;
  coalesceKey = null;
  coalesceEntry = null;
  if (entry) target(entry);
};

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  push: (entry) => {
    // A fresh action invalidates whatever was available to redo.
    if (pendingGroups.length === 0) commitCoalesced((e) => useHistoryStore.getState().push(e));
    if (isReplaying) return;
    const top = pendingGroups[pendingGroups.length - 1];
    if (top) {
      top.push(entry);
      return;
    }
    set((state) => ({ undoStack: [...state.undoStack, entry], redoStack: [] }));
  },

  // Collapses a burst of same-key pushes (e.g. per-keystroke doc autosave) into one undo step:
  // the FIRST call in a burst is kept as-is (its `undo` captures the value the session started
  // from); every subsequent call with the same key replaces the top-of-stack entry's `redo`
  // (and the whole entry) with the latest one, so undo always reverts the whole editing session
  // in one step, not one keystroke at a time. Call `endCoalesce()` (on blur / session end) to
  // stop merging into it — the next `pushCoalesced` with the same key starts a new session.
  pushCoalesced: (key, entry) => {
    if (isReplaying) return;
    if (coalesceKey === key && coalesceEntry) {
      // Keep the FIRST call's `undo` (reverts to the value the session started from) — only
      // `redo` (and the label) advance to the latest call. Overwriting `undo` here would make
      // Ctrl+Z only revert the most recent keystroke instead of the whole editing session.
      coalesceEntry = { label: entry.label, undo: coalesceEntry.undo, redo: entry.redo };
      return;
    }
    commitCoalesced((e) => {
      const top = pendingGroups[pendingGroups.length - 1];
      if (top) top.push(e);
      else set((state) => ({ undoStack: [...state.undoStack, e], redoStack: [] }));
    });
    coalesceKey = key;
    coalesceEntry = entry;
  },

  endCoalesce: () => {
    commitCoalesced((e) => {
      const top = pendingGroups[pendingGroups.length - 1];
      if (top) top.push(e);
      else set((state) => ({ undoStack: [...state.undoStack, e], redoStack: [] }));
    });
  },

  // Handles both sync and async `fn`. Some actions (e.g. deletes that snapshot a subtree before
  // pushing) push to history AFTER an `await`, not synchronously — closing the group as soon as
  // `fn()` returns would miss those pushes entirely and silently ungroup them. So if `fn()`
  // returns a Promise, the group only closes once it resolves; callers that need the grouped
  // entry to exist before continuing should `await` the transaction's own return value.
  transaction: (label, fn) => {
    pendingGroups.push([]);
    const finish = () => {
      const group = pendingGroups.pop()!;
      if (group.length > 0) {
        const combined: HistoryEntry = {
          label,
          undo: async () => {
            for (let i = group.length - 1; i >= 0; i--) await group[i].undo();
          },
          redo: async () => {
            for (let i = 0; i < group.length; i++) await group[i].redo();
          },
        };
        get().push(combined);
      }
    };
    let result: ReturnType<typeof fn>;
    try {
      result = fn();
    } catch (err) {
      finish();
      throw err;
    }
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          finish();
          return value;
        },
        (err) => {
          finish();
          throw err;
        }
      ) as ReturnType<typeof fn>;
    }
    finish();
    return result;
  },

  undo: async () => {
    get().endCoalesce();
    const { undoStack } = get();
    if (undoStack.length === 0) return null;
    const entry = undoStack[undoStack.length - 1];
    isReplaying = true;
    try {
      await entry.undo();
    } finally {
      isReplaying = false;
    }
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    }));
    return entry.label;
  },

  redo: async () => {
    get().endCoalesce();
    const { redoStack } = get();
    if (redoStack.length === 0) return null;
    const entry = redoStack[redoStack.length - 1];
    isReplaying = true;
    try {
      await entry.redo();
    } finally {
      isReplaying = false;
    }
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    }));
    return entry.label;
  },
}));
