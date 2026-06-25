// roles.ts — the full cutting-role taxonomy, grouped, with per-geometry parametric factors.
//
// A role is APPLICABLE to a geometry only if it has factors for that geometry (so an
// end-mill family disables Drill/Tap/ThreadMill/etc. — those are other tool types, to be
// added when the app handles them). Each geometry has a DEFAULT-selected subset (the
// milling roles), which the build UI checks by default and which feeds the generator.
//
// Factors: feed-per-tooth f_z = tool_diameter × fpt; stepdown/stepover as (base, factor)
// where base is "dia" (cutting Ø) or "flute" (flute length); so = null → full-width pass.
// The Adaptive_Rough role is additionally length-derated by the lever model at generation.

export type Base = "dia" | "flute";
export type GeoKey = "square" | "ball";
export type Group = "Roughing" | "Finishing" | "Other milling" | "Special";

export interface RoleSpec {
  key: string;
  fpt: number;
  sd: [Base, number];
  so: [Base, number] | null;
  hem?: boolean;
  floor?: boolean;
}

interface RoleDef {
  key: string;
  group: Group;
  geo: { square?: Omit<RoleSpec, "key">; ball?: Omit<RoleSpec, "key"> };
}

export const GROUPS: Group[] = ["Roughing", "Finishing", "Other milling", "Special"];

// Authoritative taxonomy (Tim, 2026-06-23). Geometry-specific factors; missing geo = N/A.
export const ROLE_CATALOG: RoleDef[] = [
  // ---- Roughing
  { key: "Face_Rough", group: "Roughing", geo: { square: { fpt: 0.012, sd: ["dia", 0.1], so: ["dia", 0.75] } } },
  { key: "Adaptive_Rough", group: "Roughing", geo: {
      square: { fpt: 0.012, sd: ["flute", 1.0], so: ["dia", 0.1], hem: true },
      ball: { fpt: 0.01, sd: ["flute", 1.0], so: ["dia", 0.1], hem: true } } },
  { key: "Traditional_Rough", group: "Roughing", geo: {
      square: { fpt: 0.012, sd: ["dia", 1.5], so: ["dia", 0.35] },
      ball: { fpt: 0.01, sd: ["dia", 1.5], so: ["dia", 0.35] } } },
  { key: "Bore_Rough", group: "Roughing", geo: { square: { fpt: 0.012, sd: ["flute", 1.0], so: ["dia", 0.1] } } },
  // ---- Finishing
  { key: "Face_Finish", group: "Finishing", geo: { square: { fpt: 0.0075, sd: ["dia", 0.02], so: ["dia", 0.6] } } },
  { key: "Floor_Finish", group: "Finishing", geo: { square: { fpt: 0.0075, sd: ["dia", 0.05], so: ["dia", 0.7], floor: true } } },
  { key: "Wall_Finish", group: "Finishing", geo: {
      square: { fpt: 0.0075, sd: ["flute", 1.0], so: ["dia", 0.05] },
      ball: { fpt: 0.0075, sd: ["flute", 1.0], so: ["dia", 0.05] } } },
  { key: "Bore_Finish", group: "Finishing", geo: { square: { fpt: 0.0075, sd: ["flute", 1.0], so: ["dia", 0.03] } } },
  { key: "Surface", group: "Finishing", geo: { ball: { fpt: 0.0075, sd: ["dia", 0.05], so: ["dia", 0.05] } } },
  // ---- Other milling
  { key: "Slot", group: "Other milling", geo: {
      square: { fpt: 0.006, sd: ["dia", 1.0], so: null },
      ball: { fpt: 0.0055, sd: ["dia", 1.0], so: ["dia", 1.0] } } },
  { key: "Drill", group: "Other milling", geo: {} },
  { key: "Engrave", group: "Other milling", geo: {} },
  // ---- Special (other tool types — N/A for plain end mills, shown disabled)
  { key: "Chamfer", group: "Special", geo: {} },
  { key: "Keyseat", group: "Special", geo: {} },
  { key: "Tap", group: "Special", geo: {} },
  { key: "ThreadMill", group: "Special", geo: {} },
];

// Default-selected (checked) roles per geometry — the milling set we calibrate.
const DEFAULTS: Record<GeoKey, string[]> = {
  square: ["Adaptive_Rough", "Traditional_Rough", "Slot", "Wall_Finish", "Floor_Finish"],
  ball: ["Adaptive_Rough", "Traditional_Rough", "Slot", "Surface", "Wall_Finish"],
};

export const geoKey = (geometry: string): GeoKey => (geometry === "ballnose" ? "ball" : "square");
const byKey = new Map(ROLE_CATALOG.map((r) => [r.key, r]));

export function appliesTo(key: string, geo: GeoKey): boolean {
  return !!byKey.get(key)?.geo[geo];
}
export function defaultRoleKeys(geometry: string): string[] {
  return DEFAULTS[geoKey(geometry)];
}
export function roleSpec(key: string, geo: GeoKey): RoleSpec | null {
  const f = byKey.get(key)?.geo[geo];
  return f ? { key, ...f } : null;
}
/** The default-selected role specs for a geometry (used by defaultSquare/BallFamily). */
export function rolesFor(geometry: string): RoleSpec[] {
  const g = geoKey(geometry);
  return DEFAULTS[g].map((k) => roleSpec(k, g)!).filter(Boolean);
}
