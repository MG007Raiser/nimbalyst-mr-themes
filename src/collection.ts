/**
 * The Theme Collection model: themes, theme families, and the import/export
 * file formats that carry them.
 *
 * Every theme lives in one flat collection (the built-in presets are copied
 * in on first run, so they can be edited and deleted like any other). A theme
 * belongs to at most one family, named by its `family` field. In the gallery
 * a family is a group of existing themes with a name, sub text (description)
 * and five header swatches; new themes for a family are designed with the
 * Family Builder Kit and arrive by import. `generator` (dominant hue, up to
 * four pops, neutral) records how built-in and kit-generated families were
 * made; generateFamilyThemes builds the six variants from it (families.ts).
 *
 * Files:
 * - `*.nimtheme`: one theme (see themeSpec.ts).
 * - `*.nimfamily`: one family and its themes:
 *     { "kind": "mr-themes/family", "format": 1,
 *       "family": { "id", "name", "description"?, "generator"? },
 *       "themes": [ <theme>, ... ] }
 *   Every theme in the file is filed under that family on import.
 * The importer also accepts a bare array of themes, or `{ "themes": [...] }`.
 */
import { FAMILIES, FACTIONS, VARIATIONS, buildTheme, familySwatches, type FamilySpec, type Signature } from './families';
import { PRESETS } from './presets';
import { HUES, type Hue } from './tailwind';
import { isValidColor } from './color';
import { normalizeTheme, resolveTheme, serializeThemeFile, slugify, type ThemeFile } from './themeSpec';

export const FAMILY_FILE_KIND = 'mr-themes/family';
export const FAMILY_FILE_VERSION = 1;

export interface FamilyGenerator {
  dominant: Hue;
  /** Up to four, most important first. */
  pops: Hue[];
  neutral: Hue;
  /** Light surfaces tinted like paper with this hue (see FamilySpec.paper). */
  paper?: Hue;
  /** 'high' raises every contrast target (see FamilySpec.contrast). */
  contrast?: 'high';
  /** Exact colors pinned on top of the base (see Signature in families.ts). */
  signature?: Signature;
}

export interface ThemeFamily {
  id: string;
  name: string;
  /** The sub text under the family name. */
  description?: string;
  /** The five colors shown in the family header. When missing, derived from the generator or the members. */
  swatches?: string[];
  /** How the family's six variants were generated (built-ins and toolkit families). Kept as provenance. */
  generator?: FamilyGenerator;
}

export const FAMILY_SWATCH_COUNT = 5;

export const NEUTRAL_HUES: Hue[] = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
export const COLOR_HUES: Hue[] = HUES.filter((h) => !NEUTRAL_HUES.includes(h));

export const BUILTIN_FAMILIES: ThemeFamily[] = FAMILIES.map((f) => ({
  id: f.id,
  name: f.name,
  description: f.description,
  generator: {
    dominant: f.dominant, pops: [...f.pops], neutral: f.neutral,
    ...(f.paper ? { paper: f.paper } : {}), ...(f.contrast ? { contrast: f.contrast } : {}),
    ...(f.signature ? { signature: { ...f.signature, ...(f.signature.pops ? { pops: [...f.signature.pops] } : {}) } } : {}),
  },
}));

/**
 * The built-in families of upstream Mr. Themes 0.5.0. A collection seeded
 * before builtinFamiliesSeen existed has seen these; every later built-in
 * family is added to it once by addNewBuiltinsInto.
 */
export const LEGACY_BUILTIN_FAMILY_IDS = ['harbor', 'grove', 'plum', 'ember', 'rosewater', 'lagoon'];

/**
 * Add built-in families the user has never been offered, with their themes.
 * Families already seen are left alone, so one the user deleted stays deleted
 * (Restore built-ins brings it back). Returns the ids to record as seen.
 */
export function addNewBuiltinsInto(s: CollectionState, seen: string[]): { state: CollectionState; added: ThemeFamily[]; seen: string[] } {
  const famIds = new Set(s.families.map((f) => f.id));
  const themeIds = new Set(s.themes.map((t) => t.id));
  const fresh = BUILTIN_FAMILIES.filter((f) => !seen.includes(f.id) && !famIds.has(f.id));
  const freshIds = new Set(fresh.map((f) => f.id));
  const themes = PRESETS.filter((p) => freshIds.has(p.family ?? '') && !themeIds.has(p.id));
  return {
    state: { themes: [...s.themes, ...themes], families: [...s.families, ...fresh.map((f) => ({ ...f }))] },
    added: fresh,
    seen: [...new Set([...seen, ...BUILTIN_FAMILIES.map((f) => f.id)])],
  };
}

export function toFamilySpec(f: ThemeFamily): FamilySpec | null {
  if (!f.generator) return null;
  return { id: f.id, name: f.name, description: f.description ?? '', ...f.generator };
}

/** The six variants of a generator-backed family, dark first. Ids are `<family>-<faction>-<variation>`. */
export function generateFamilyThemes(f: ThemeFamily): ThemeFile[] {
  const spec = toFamilySpec(f);
  if (!spec) return [];
  const out: ThemeFile[] = [];
  for (const faction of FACTIONS) for (const v of VARIATIONS) out.push(buildTheme(spec, faction, v));
  return out;
}

function isHue(v: unknown): v is Hue {
  return typeof v === 'string' && (HUES as string[]).includes(v);
}

export function normalizeFamily(input: unknown): ThemeFamily {
  if (!input || typeof input !== 'object') throw new Error('Family must be a JSON object');
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Untitled family';
  const out: ThemeFamily = { id: typeof o.id === 'string' && o.id.trim() ? slugify(o.id) : slugify(name), name };
  if (typeof o.description === 'string' && o.description.trim()) out.description = o.description.trim();
  if (Array.isArray(o.swatches)) {
    const sw = o.swatches.filter((c): c is string => typeof c === 'string' && isValidColor(c)).slice(0, FAMILY_SWATCH_COUNT);
    if (sw.length) out.swatches = sw;
  }
  const g = o.generator as Record<string, unknown> | undefined;
  if (g && typeof g === 'object' && isHue(g.dominant) && isHue(g.neutral)) {
    const pops = Array.isArray(g.pops) ? g.pops.filter(isHue).slice(0, 4) : [];
    out.generator = { dominant: g.dominant, pops, neutral: g.neutral };
    if (isHue(g.paper)) out.generator.paper = g.paper;
    if (g.contrast === 'high') out.generator.contrast = 'high';
    const sig = normalizeSignature(g.signature);
    if (sig) out.generator.signature = sig;
  }
  return out;
}

/** Keep only valid colors from a signature; null when nothing is left. */
function normalizeSignature(input: unknown): Signature | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const color = (v: unknown) => (typeof v === 'string' && isValidColor(v) ? v.trim() : undefined);
  const out: Signature = {};
  const primary = color(o.primary);
  const night = color(o.night);
  const day = color(o.day);
  if (primary) out.primary = primary;
  if (night) out.night = night;
  if (day) out.day = day;
  if (Array.isArray(o.pops)) {
    // Slots are positional, so an invalid entry becomes a gap the Tailwind pop fills, not a shift.
    const pops = o.pops.slice(0, 4).map((v) => color(v) ?? '');
    if (pops.some(Boolean)) out.pops = pops;
  }
  return Object.keys(out).length ? out : null;
}

export interface ImportPayload {
  /** Present when the file was a family bundle. */
  family: ThemeFamily | null;
  themes: ThemeFile[];
}

/**
 * Read any importable JSON: a single theme, a family bundle, a bare array of
 * themes, or `{ themes: [...] }`. Throws with a readable message otherwise.
 */
export function parseImport(raw: string): ImportPayload {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim());
  } catch (e) {
    throw new Error(`Not valid JSON (${(e as Error).message})`);
  }
  if (Array.isArray(data)) {
    const themes = data.map((t) => normalizeTheme(t));
    if (!themes.length) throw new Error('The file has no themes');
    return { family: null, themes };
  }
  if (!data || typeof data !== 'object') throw new Error('Expected a theme, a theme family, or a list of themes');
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.themes)) {
    const family = o.family && typeof o.family === 'object' ? normalizeFamily(o.family) : null;
    const themes = o.themes.map((t) => normalizeTheme(t));
    if (!themes.length && !family) throw new Error('The file has no themes');
    if (family) for (const t of themes) t.family = family.id;
    return { family, themes };
  }
  if (o.colors && typeof o.colors === 'object') return { family: null, themes: [normalizeTheme(o)] };
  throw new Error('Expected a theme (with "colors"), a theme family (with "family" and "themes"), or a list of themes');
}

/** Serialize a family and its themes as a `.nimfamily` file. */
export function serializeFamilyFile(family: ThemeFamily, themes: ThemeFile[]): string {
  const out = {
    kind: FAMILY_FILE_KIND,
    format: FAMILY_FILE_VERSION,
    family: {
      id: family.id,
      name: family.name,
      ...(family.description ? { description: family.description } : {}),
      ...(family.swatches?.length ? { swatches: family.swatches } : {}),
      ...(family.generator ? { generator: family.generator } : {}),
    },
    // Reuse the single-theme serializer so key order matches `.nimtheme` files.
    themes: themes.map((t) => JSON.parse(serializeThemeFile({ ...t, family: family.id }))),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** A slug not in `taken`, suffixed -2, -3, ... when needed. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base);
  let id = root;
  let n = 2;
  while (taken.has(id)) id = `${root}-${n++}`;
  return id;
}

/* ---- Pure collection operations (the gallery adds side effects: persist, applier, projects) ---- */

export interface CollectionState {
  themes: ThemeFile[];
  families: ThemeFamily[];
}

export function withoutFamily(t: ThemeFile): ThemeFile {
  const next = { ...t };
  delete next.family;
  return next;
}

export function setThemeFamily(s: CollectionState, themeId: string, familyId: string | null): CollectionState {
  return {
    ...s,
    themes: s.themes.map((t) => (t.id !== themeId ? t : familyId ? { ...t, family: familyId } : withoutFamily(t))),
  };
}

/**
 * Add an imported payload. With mode 'replace', a family or theme whose id is
 * already present is overwritten in place (its id, and so its assignments,
 * survive); with 'copy' it gets a fresh id. New themes go to the front.
 */
export function importInto(s: CollectionState, payload: ImportPayload, mode: 'replace' | 'copy'): { state: CollectionState; familyId: string | null } {
  let families = [...s.families];
  let familyId: string | null = null;
  if (payload.family) {
    const fam = payload.family;
    if (mode === 'replace' && families.some((f) => f.id === fam.id)) {
      familyId = fam.id;
      families = families.map((f) => (f.id === fam.id ? fam : f));
    } else {
      familyId = uniqueSlug(fam.id, new Set(families.map((f) => f.id)));
      families = [{ ...fam, id: familyId }, ...families];
    }
  }
  const famIds = new Set(families.map((f) => f.id));
  const themes = [...s.themes];
  const ids = new Set(themes.map((t) => t.id));
  const added: ThemeFile[] = [];
  for (const raw of payload.themes) {
    // A loose theme keeps its family only if that family exists here.
    const t: ThemeFile = familyId ? { ...raw, family: familyId } : raw.family && famIds.has(raw.family) ? { ...raw } : withoutFamily(raw);
    const i = themes.findIndex((x) => x.id === t.id);
    if (i >= 0 && mode === 'replace') {
      themes[i] = t;
    } else {
      t.id = uniqueSlug(t.id, ids);
      ids.add(t.id);
      added.push(t);
    }
  }
  return { state: { themes: [...added, ...themes], families }, familyId };
}

/** What the New/Edit family wizard collects: a group of existing themes, not new ones. */
export interface FamilyForm {
  name: string;
  /** Sub text shown under the name. */
  description: string;
  /** The five header colors. */
  swatches: string[];
  /** Collection themes in the family. A theme in another family moves here. */
  themeIds: string[];
}

/**
 * Create a family (existingId null) or update one from the wizard. Selected
 * themes join it (moving from any other family); on edit, members that were
 * unselected leave it and stay in the collection. An existing family keeps its
 * generator as provenance.
 */
export function saveFamilyInto(s: CollectionState, form: FamilyForm, existingId: string | null): { state: CollectionState; family: ThemeFamily; moved: number } {
  const existing = existingId ? s.families.find((f) => f.id === existingId) : undefined;
  const swatches = form.swatches.filter(isValidColor).slice(0, FAMILY_SWATCH_COUNT);
  const family: ThemeFamily = {
    id: existingId ?? uniqueSlug(form.name, new Set(s.families.map((f) => f.id))),
    name: form.name.trim() || 'Untitled family',
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(swatches.length ? { swatches } : {}),
    ...(existing?.generator ? { generator: existing.generator } : {}),
  };
  const chosen = new Set(form.themeIds);
  let moved = 0;
  const themes = s.themes.map((t) => {
    if (chosen.has(t.id)) {
      if (t.family && t.family !== family.id && s.families.some((f) => f.id === t.family)) moved++;
      return t.family === family.id ? t : { ...t, family: family.id };
    }
    return t.family === family.id ? withoutFamily(t) : t;
  });
  const families = existingId ? s.families.map((f) => (f.id === existingId ? family : f)) : [family, ...s.families];
  return { state: { themes, families }, family, moved };
}

/**
 * Colors worth offering as family header swatches, from a set of themes:
 * each theme's accent first, then links, info, status and code colors.
 */
export function suggestedSwatches(themes: ThemeFile[]): string[] {
  const out: string[] = [];
  const add = (c: string | undefined) => {
    if (!c || !isValidColor(c) || c.startsWith('rgba')) return;
    const k = c.toLowerCase();
    if (!out.includes(k)) out.push(k);
  };
  const resolved = themes.map((t) => resolveTheme(t));
  for (const r of resolved) add(r.core.primary);
  for (const r of resolved) {
    add(r.core.link);
    add(r.core.info);
    add(r.extended.purple);
    add(r.extended['code-function']);
    add(r.extended['code-attr']);
    add(r.core.success);
    add(r.core.warning);
    add(r.core.error);
  }
  return out;
}

/** The five header colors a family shows: its own, else its generator's hues, else its members' accents. */
export function familyHeaderColors(f: ThemeFamily, members: ThemeFile[], dark: boolean): string[] {
  if (f.swatches?.length) return f.swatches;
  const spec = toFamilySpec(f);
  if (spec) return familySwatches(spec, dark);
  return suggestedSwatches(members).slice(0, FAMILY_SWATCH_COUNT);
}

/** Parse an "Import theme" file: exactly one theme. Family files are pointed at "Import family". */
export function parseThemeImport(raw: string): ThemeFile {
  const p = parseImport(raw);
  if (p.family) throw new Error(`This file is the ${p.family.name} theme family. Use “Import family” under Theme Families.`);
  if (p.themes.length !== 1) throw new Error(`This file holds ${p.themes.length} themes. Import theme takes one; wrap several in a family file and use “Import family”.`);
  return p.themes[0];
}

/** Parse an "Import family" file: a family bundle. Single themes are pointed at "Import theme". */
export function parseFamilyImport(raw: string): ImportPayload & { family: ThemeFamily } {
  const p = parseImport(raw);
  if (!p.family) {
    throw new Error(p.themes.length === 1
      ? 'This file is a single theme. Use “Import theme” in the Theme Collection.'
      : 'This file has no "family" entry. A family file looks like { "kind": "mr-themes/family", "family": { … }, "themes": [ … ] }.');
  }
  return p as ImportPayload & { family: ThemeFamily };
}

/** Delete a family; its themes are deleted too, or kept without a family. */
export function deleteFamilyFrom(s: CollectionState, familyId: string, withThemes: boolean): { state: CollectionState; removedThemeIds: string[] } {
  const families = s.families.filter((f) => f.id !== familyId);
  const members = s.themes.filter((t) => t.family === familyId).map((t) => t.id);
  const themes = withThemes
    ? s.themes.filter((t) => t.family !== familyId)
    : s.themes.map((t) => (t.family === familyId ? withoutFamily(t) : t));
  return { state: { themes, families }, removedThemeIds: withThemes ? members : [] };
}

export function missingBuiltins(s: CollectionState): { families: ThemeFamily[]; themes: ThemeFile[] } {
  const famIds = new Set(s.families.map((f) => f.id));
  const themeIds = new Set(s.themes.map((t) => t.id));
  return { families: BUILTIN_FAMILIES.filter((f) => !famIds.has(f.id)), themes: PRESETS.filter((p) => !themeIds.has(p.id)) };
}

/**
 * Bring back deleted built-in families and themes. Existing entries are left
 * as they are (edits survive). A built-in theme that was kept when its family
 * was deleted rejoins the family when that family comes back.
 */
export function restoreBuiltinsInto(s: CollectionState): { state: CollectionState; families: number; themes: number } {
  const missing = missingBuiltins(s);
  const restored = new Set(missing.families.map((f) => f.id));
  const home = new Map(PRESETS.map((p) => [p.id, p.family ?? '']));
  const kept = s.themes.map((t) => {
    const h = home.get(t.id);
    return !t.family && h && restored.has(h) ? { ...t, family: h } : t;
  });
  return {
    state: { themes: [...kept, ...missing.themes], families: [...s.families, ...missing.families.map((f) => ({ ...f }))] },
    families: missing.families.length,
    themes: missing.themes.length,
  };
}

export type CycleScope = 'family' | 'all' | 'favorites';

/**
 * The themes the editor's previous/next buttons walk through, in collection
 * order: the current theme's family (all themes when it has none), every
 * theme, or the favorites. The current theme is always included so the
 * position reads correctly even when it is not a favorite.
 */
export function cycleList(themes: ThemeFile[], scope: CycleScope, current: ThemeFile, favorites: string[]): ThemeFile[] {
  if (scope === 'family' && current.family) return themes.filter((t) => t.family === current.family);
  if (scope === 'favorites') {
    const fav = new Set(favorites);
    return themes.filter((t) => fav.has(t.id) || t.id === current.id);
  }
  return themes;
}

/** The theme `delta` steps from `currentId` in `list`, wrapping around. */
export function stepTheme(list: ThemeFile[], currentId: string, delta: number): ThemeFile | null {
  if (!list.length) return null;
  const i = list.findIndex((t) => t.id === currentId);
  if (i < 0) return list[delta < 0 ? list.length - 1 : 0];
  return list[(((i + delta) % list.length) + list.length) % list.length];
}
