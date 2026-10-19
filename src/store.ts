/**
 * Persistence for the enabled theme and the user's theme library.
 *
 * Source of truth is the extension configuration service (user scope).
 * localStorage mirrors the same data so the applier can paint at startup with
 * zero flash, and so reads stay right while the configuration is loading:
 * Nimbalyst fetches it in the background after activate() and until then
 * answers every get() with the manifest default (0, []). A default value
 * therefore says nothing, and the readers below fall back to the mirror.
 */
import type { ExtensionContext } from '@nimbalyst/extension-sdk';
import { BUILTIN_FAMILIES, LEGACY_BUILTIN_FAMILY_IDS, addNewBuiltinsInto, normalizeFamily, rehomeOrphansInto, type ThemeFamily } from './collection';
import { PRESETS } from './presets';
import { normalizeTheme, type ThemeFile } from './themeSpec';

const NS = 'com.fireworklabs.theme-editor';
const KEY_ENABLED = 'enabledTheme';
/** The whole theme collection (see getCollection). The key name predates 0.4.0. */
const KEY_USER_THEMES = 'userThemes';
const KEY_FAMILIES = 'themeFamilies';
const KEY_SEEDED = 'collectionSeeded';
const KEY_BUILTINS_SEEN = 'builtinFamiliesSeen';
const KEY_FAVORITES = 'favoriteThemes';

let ctx: ExtensionContext | null = null;

export function setExtensionContext(c: ExtensionContext | null): void {
  ctx = c;
}
export function getExtensionContext(): ExtensionContext | null {
  return ctx;
}

function lsGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${NS}/${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(`${NS}/${key}`);
    else window.localStorage.setItem(`${NS}/${key}`, JSON.stringify(value));
  } catch {
    /* storage may be unavailable; configuration still holds the value */
  }
}

function cfgGet<T>(key: string): T | null {
  try {
    const v = ctx?.services.configuration?.get<T | null>(key, null);
    return v ?? null;
  } catch {
    return null;
  }
}
async function cfgSet(key: string, value: unknown): Promise<void> {
  try {
    await ctx?.services.configuration?.update(key, value, 'user');
  } catch (e) {
    console.warn('[theme-editor] configuration update failed', e);
  }
}

/** A stored list: the configuration's when it has entries, else the mirror's. */
function storedList(key: string): unknown[] {
  const fromCfg = cfgGet<unknown>(key);
  if (Array.isArray(fromCfg) && fromCfg.length) return fromCfg;
  const fromLs = lsGet<unknown>(key);
  return Array.isArray(fromLs) ? fromLs : [];
}

function safeTheme(v: unknown): ThemeFile | null {
  try {
    return v ? normalizeTheme(v) : null;
  } catch {
    return null;
  }
}

export function getEnabledTheme(): ThemeFile | null {
  return safeTheme(cfgGet(KEY_ENABLED)) ?? safeTheme(lsGet(KEY_ENABLED));
}

export async function setEnabledTheme(theme: ThemeFile | null): Promise<void> {
  lsSet(KEY_ENABLED, theme);
  await cfgSet(KEY_ENABLED, theme);
}

function storedThemes(): ThemeFile[] {
  return storedList(KEY_USER_THEMES).map(safeTheme).filter((t): t is ThemeFile => t !== null);
}

/**
 * Before 0.4.0 `userThemes` held only the user's own themes and the presets
 * lived in code. Since then it holds the whole collection: on first run the
 * presets are copied in (after the user's themes) and `collectionSeeded` is
 * set, so presets can be edited and deleted like any other theme.
 */
function isSeeded(): boolean {
  return Math.max(cfgGet<number>(KEY_SEEDED) ?? 0, lsGet<number>(KEY_SEEDED) ?? 0) >= 1;
}

/** Every theme, in collection order. Correct before and after seeding. */
export function getCollection(): ThemeFile[] {
  const stored = storedThemes();
  if (isSeeded()) return stored;
  const ids = new Set(stored.map((t) => t.id));
  return [...stored, ...PRESETS.filter((p) => !ids.has(p.id))];
}

export function getFamilies(): ThemeFamily[] {
  return isSeeded() ? storedFamilies() : BUILTIN_FAMILIES.map((f) => ({ ...f }));
}

function storedFamilies(): ThemeFamily[] {
  const out: ThemeFamily[] = [];
  for (const f of storedList(KEY_FAMILIES)) {
    try {
      out.push(normalizeFamily(f));
    } catch {
      /* skip malformed entries */
    }
  }
  return out;
}

export async function setCollection(themes: ThemeFile[], families?: ThemeFamily[]): Promise<void> {
  const fams = families ?? getFamilies();
  lsSet(KEY_USER_THEMES, themes);
  lsSet(KEY_FAMILIES, fams);
  lsSet(KEY_SEEDED, 1);
  await cfgSet(KEY_USER_THEMES, themes);
  await cfgSet(KEY_FAMILIES, fams);
  await cfgSet(KEY_SEEDED, 1);
  for (const fn of collectionListeners) fn();
}

const collectionListeners = new Set<() => void>();

/** Called after every setCollection, including the startup repair, so an open gallery can reload. */
export function onCollectionChanged(fn: () => void): () => void {
  collectionListeners.add(fn);
  return () => void collectionListeners.delete(fn);
}

/**
 * Wait until the configuration has arrived, or `ms` have passed (a true
 * first run has no seeded flag to wait for).
 */
async function configurationArrived(ms = 3000): Promise<void> {
  if (!ctx?.services.configuration) return;
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if ((cfgGet<number>(KEY_SEEDED) ?? 0) >= 1) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Write the seeded collection once, so later reads come from storage. On
 * later runs, add built-in families that shipped after the collection was
 * seeded (each one once; see addNewBuiltinsInto), and give back families
 * that themes still name (see rehomeOrphansInto).
 *
 * Before 0.7.1 this read the seeded flag straight from the configuration,
 * which can still be loading at activate() and then reads 0. Seeding again
 * reset the family list to the built-ins, so families the user made (from an
 * image, by import, in the wizard) vanished and left their themes behind.
 */
export async function ensureSeeded(): Promise<void> {
  const allIds = BUILTIN_FAMILIES.map((f) => f.id);
  if (!isSeeded()) await configurationArrived();
  if (!isSeeded()) {
    const kept = storedFamilies();
    const ids = new Set(kept.map((f) => f.id));
    await setCollection(getCollection(), [...kept, ...BUILTIN_FAMILIES.filter((f) => !ids.has(f.id)).map((f) => ({ ...f }))]);
    await setBuiltinsSeen(allIds);
    return;
  }
  const stored = storedList(KEY_BUILTINS_SEEN).filter((x): x is string => typeof x === 'string');
  const seen = stored.length ? stored : LEGACY_BUILTIN_FAMILY_IDS;
  const fresh = allIds.every((id) => seen.includes(id)) ? null : addNewBuiltinsInto({ themes: getCollection(), families: getFamilies() }, seen);
  const added = fresh?.added ?? [];
  const r = rehomeOrphansInto(fresh?.state ?? { themes: getCollection(), families: getFamilies() });
  if (added.length || r.rebuilt.length) await setCollection(r.state.themes, r.state.families);
  if (added.length) toast('info', `Mr. Themes added ${added.length} new theme ${added.length === 1 ? 'family' : 'families'}: ${added.map((f) => f.name).join(', ')}.`);
  if (r.rebuilt.length) toast('info', `Mr. Themes restored ${r.rebuilt.length} theme ${r.rebuilt.length === 1 ? 'family' : 'families'} that had lost track of their themes: ${r.rebuilt.map((f) => f.name).join(', ')}.`);
  if (fresh) await setBuiltinsSeen(fresh.seen);
}

async function setBuiltinsSeen(ids: string[]): Promise<void> {
  lsSet(KEY_BUILTINS_SEEN, ids);
  await cfgSet(KEY_BUILTINS_SEEN, ids);
}

/** Theme ids the user starred, in the order they were starred. */
export function getFavorites(): string[] {
  return storedList(KEY_FAVORITES).filter((x): x is string => typeof x === 'string');
}

export async function setFavorites(ids: string[]): Promise<void> {
  lsSet(KEY_FAVORITES, ids);
  await cfgSet(KEY_FAVORITES, ids);
}

export function toast(kind: 'info' | 'warning' | 'error', message: string): void {
  const ui = ctx?.services.ui;
  if (!ui) return;
  if (kind === 'info') ui.showInfo(message);
  else if (kind === 'warning') ui.showWarning(message);
  else ui.showError(message);
}
