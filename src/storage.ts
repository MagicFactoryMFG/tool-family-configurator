// storage.ts — persistence behind a small interface (spec §8) so it can be swapped for a
// backend later, and so no browser-storage calls leak into the model or a sandboxed preview.
import type { ToolFamily } from "./leverModel";

export interface FamilyStore {
  load(): ToolFamily | null;
  save(f: ToolFamily): void;
  clear(): void;
}

const KEY = "tfc.family.v1";

export const localStore: FamilyStore = {
  load() {
    try {
      const s = localStorage.getItem(KEY);
      return s ? (JSON.parse(s) as ToolFamily) : null;
    } catch {
      return null;
    }
  },
  save(f) {
    try {
      localStorage.setItem(KEY, JSON.stringify(f));
    } catch {
      /* ignore quota / unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
