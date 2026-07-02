// storage.ts — persistence behind a small interface (spec §8) so it can be swapped for a
// backend later, and so no browser-storage calls leak into the model or a sandboxed preview.
import type { ToolFamily } from "./leverModel";
import type { RoleAnchor } from "./generate/anchors";
import type { ToolBlank } from "./generate/library";

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

// Shared Build/Configurator working state — survives navigation between the Build and Lever
// pages (they read/write the same key), so tuned anchors + the loaded family aren't lost.
export interface BuildState {
  familyKey: string;
  materialKey: string;
  maxRpm: number;
  roles: string[];
  anchors: Record<string, RoleAnchor>;
  blanks: ToolBlank[];
  source: string;
  libName: string;
  coatingFilter: string;
  sel?: number;
}

const BKEY = "tfc.build.v1";

export const buildStore = {
  load(): BuildState | null {
    try {
      const s = localStorage.getItem(BKEY);
      return s ? (JSON.parse(s) as BuildState) : null;
    } catch {
      return null;
    }
  },
  save(s: BuildState) {
    try {
      localStorage.setItem(BKEY, JSON.stringify(s));
    } catch {
      /* ignore quota / unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(BKEY);
    } catch {
      /* ignore */
    }
  },
};
