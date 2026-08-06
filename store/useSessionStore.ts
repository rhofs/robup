import { create } from 'zustand';

// Placeholder "who am I" concept for a single-user-per-browser dev tool with no real auth yet.
// Deliberately isolated in its own store (not folded into useTaskStore) so that when real
// login/sessions exist, this file is the only thing that needs replacing — everything else in
// the app just reads `useSessionStore().currentUserId` and doesn't know or care where it came
// from (a localStorage pick today, a session/JWT tomorrow).
const STORAGE_KEY = 'robup.currentUserId';

interface SessionStore {
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
}

const readStoredUserId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const useSessionStore = create<SessionStore>((set) => ({
  currentUserId: readStoredUserId(),
  setCurrentUserId: (id) => {
    set({ currentUserId: id });
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
}));
