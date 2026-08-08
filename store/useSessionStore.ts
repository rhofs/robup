import { create } from 'zustand';

// "Who am I" — this file's shape was deliberately kept stable through the move from a localStorage
// pick to a real Auth.js session (components/SessionSync.tsx now populates it from useSession()),
// exactly per the plan this comment used to describe: everything else in the app just reads
// `useSessionStore().currentUserId` and doesn't know or care where it came from.
interface SessionStore {
  currentUserId: string | null;
  setCurrentUserId: (id: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  currentUserId: null,
  setCurrentUserId: (id) => set({ currentUserId: id }),
}));
