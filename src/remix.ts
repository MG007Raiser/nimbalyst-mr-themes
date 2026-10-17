/**
 * Remix: the same family colors in new roles. A remix keeps a family's
 * palette (its signature colors, or its Tailwind hues) and its dark night
 * tint, and reshuffles which color leads, the order of the pops, the gray
 * underneath, and the color that tints the light page. Every remix goes
 * through the generator, so it is contrast-checked like any other family.
 *
 * Remixes are numbered: remixFamily(f, 1), (f, 2), ... are stable, so
 * "Remix again" walks a fixed sequence and never repeats the original.
 */
import { NEUTRAL_HUES, type FamilyGenerator, type ThemeFamily } from './collection';
import { mix } from './color';
import type { Signature } from './families';
import { tw, type Hue } from './tailwind';

const WHITE = '#ffffff';
const WARM_INFO: Hue[] = ['yellow', 'amber', 'orange'];

interface Entry {
  hue: Hue;
  /** Exact color when the family has a signature color in this slot. */
  hex?: string;
}

/** Small deterministic PRNG (mulberry32), so remix n is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The family's colors in slot order: the lead, then the pops. */
export function remixEntries(g: FamilyGenerator): Entry[] {
  const sig = g.signature;
  const out: Entry[] = [{ hue: g.dominant, ...(sig?.primary ? { hex: sig.primary } : {}) }];
  g.pops.forEach((hue, i) => {
    const hex = sig?.pops?.[i];
    out.push({ hue, ...(hex ? { hex } : {}) });
  });
  return out;
}

function sameGenerator(a: FamilyGenerator, b: FamilyGenerator): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** One candidate remix from a random source; may equal the original. */
function candidate(g: FamilyGenerator, next: () => number): FamilyGenerator {
  const entries = remixEntries(g);
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length) % list.length];
  // A new lead, then the rest in a shuffled order.
  const lead = entries[Math.floor(next() * entries.length) % entries.length];
  const rest = entries.filter((e) => e !== lead);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1)) % (i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  // Keep a warm color out of the info slot (pops[1]) when a cooler one can take it.
  if (rest.length > 2 && WARM_INFO.includes(rest[1].hue)) {
    const j = rest.findIndex((e, i) => i > 1 && !WARM_INFO.includes(e.hue));
    if (j > 1) [rest[1], rest[j]] = [rest[j], rest[1]];
  }
  // Mostly keep the original gray; sometimes try another.
  const neutral = next() < 0.5 ? g.neutral : pick(NEUTRAL_HUES);
  const sig = g.signature;
  const out: FamilyGenerator = { dominant: lead.hue, pops: rest.map((e) => e.hue), neutral };
  if (g.paper) out.paper = g.paper;
  if (g.contrast) out.contrast = g.contrast;
  if (sig) {
    const s: Signature = {};
    if (lead.hex) s.primary = lead.hex;
    if (rest.some((e) => e.hex)) s.pops = rest.map((e) => e.hex ?? '');
    // The dark night tint is part of the picture's mood: always kept.
    if (sig.night) s.night = sig.night;
    // The light page: the original day color, the new lead's wash (no day), or a wash of another color.
    const r = next();
    const other = rest.find((e) => e.hex)?.hex;
    if (r < 0.34 && sig.day) s.day = sig.day;
    else if (r > 0.67 && other) s.day = mix(other, WHITE, 0.88);
    out.signature = s;
  }
  return out;
}

/**
 * Remix number `n` (1, 2, 3, ...) of a generator family: same id, name and
 * description, new roles for its colors. Null for a family without a
 * generator (hand-authored or grouped themes) or with a single color and
 * nothing to shuffle.
 */
export function remixFamily(f: ThemeFamily, n: number): ThemeFamily | null {
  const g = f.generator;
  if (!g) return null;
  const next = rng(0x5eed + n * 7919);
  for (let tries = 0; tries < 24; tries++) {
    const c = candidate(g, next);
    if (!sameGenerator(c, g)) return { ...f, generator: c };
  }
  return null;
}

/** Whether a family can be remixed at all. */
export function canRemix(f: ThemeFamily): boolean {
  return remixFamily(f, 1) !== null;
}

/** The lead and pop colors of a generator, as swatches for the remix preview. */
export function roleColors(g: FamilyGenerator): { lead: string; pops: string[] } {
  const e = remixEntries(g);
  return { lead: e[0].hex ?? tw(e[0].hue, 500), pops: e.slice(1).map((x) => x.hex ?? tw(x.hue, 500)) };
}
