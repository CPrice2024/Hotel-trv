import { create } from "zustand";
import type { StaffUser } from "./api";

interface StaffState {
  user: StaffUser | null;
  setUser: (user: StaffUser | null) => void;
}

export const useStaffStore = create<StaffState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
