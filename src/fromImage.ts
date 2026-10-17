/**
 * Theme family from an image: pixels to a small palette, palette to a
 * generator spec with a signature (exact colors), which families.ts turns
 * into six contrast-checked themes like any other family.
 *
 * Kept free of the DOM so it runs in the offline tests; the gallery decodes
 * the image onto a canvas and hands the pixels here.
 */
import { COLOR_HUES, type ThemeFamily } from './collection';
import { parseColor, toHex } from './color';
import { tw, type Hue } from './tailwind';
import { slugify } from './themeSpec';

/** One palette color and its share of the image's opaque pixels (0-1). */
export interface Swatch {
  hex: string;
  weight: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

export function toHsl(hex: string): HSL {
  const c = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * The image's main colors, most common first. Pixels are bucketed at 5 bits
 * per channel; buckets are then taken greedily, and any bucket within `minDistance`
 * (RGB) of a color already taken adds its weight to that color instead.
 */
export function paletteFromPixels(data: ArrayLike<number>, max = 8, minDistance = 52): Swatch[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = buckets.get(key);
    if (e) {
      e.r += r;
      e.g += g;
      e.b += b;
      e.n++;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
    total++;
  }
  if (!total) return [];
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const picked: { rgb: [number, number, number]; n: number }[] = [];
  for (const e of sorted) {
    const rgb: [number, number, number] = [e.r / e.n, e.g / e.n, e.b / e.n];
    let nearest = -1;
    let best = Infinity;
    picked.forEach((p, i) => {
      const dist = rgbDistance(p.rgb, rgb);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    if (nearest >= 0 && (best < minDistance || picked.length >= max)) picked[nearest].n += e.n;
    else picked.push({ rgb, n: e.n });
  }
  return picked
    .sort((a, b) => b.n - a.n)
    .map((p) => ({ hex: toHex({ r: p.rgb[0], g: p.rgb[1], b: p.rgb[2], a: 1 }), weight: p.n / total }));
}

/** The Tailwind color hue whose 500 shade sits nearest in hue angle. */
export function nearestHue(hex: string): Hue {
  const h = toHsl(hex).h;
  let best: Hue = 'blue';
  let bestD = Infinity;
  for (const hue of COLOR_HUES) {
    const d = hueDistance(h, toHsl(tw(hue, 500)).h);
    if (d < bestD) {
      bestD = d;
      best = hue;
    }
  }
  return best;
}

/** Colorful enough to carry an accent: not gray, not near black or white. */
function isChromatic(c: HSL): boolean {
  return c.s >= 0.22 && c.l >= 0.14 && c.l <= 0.9;
}

/** The neutral ladder whose temperature matches the image's grays (or its accent when it has none). */
function neutralFor(swatches: Swatch[], dominantHue: number): Hue {
  let x = 0;
  let y = 0;
  let w = 0;
  for (const sw of swatches) {
    const c = toHsl(sw.hex);
    if (isChromatic(c) || c.s < 0.04) continue;
    x += Math.cos((c.h * Math.PI) / 180) * sw.weight * c.s;
    y += Math.sin((c.h * Math.PI) / 180) * sw.weight * c.s;
    w += sw.weight * c.s;
  }
  const h = w > 0.002 ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : dominantHue;
  if (h >= 15 && h < 75) return 'stone';
  if (h >= 170 && h < 250) return 'slate';
  if (h >= 250 && h < 320) return 'zinc';
  return w > 0.002 ? 'neutral' : 'gray';
}

/** Hues that collide with the warning color when they carry info (pops[1]). */
const WARM_INFO: Hue[] = ['yellow', 'amber', 'orange'];

/**
 * A generator family from an image palette. The most colorful common color
 * becomes the accent, the next distinct colors (20° apart in hue, or clearly
 * lighter or darker) the pops, the image's darkest and lightest colors tint the dark and light
 * surfaces, and its grays choose the neutral. Throws when the image has too
 * little color to build from.
 */
export function familyFromPalette(swatches: Swatch[], name: string, description?: string): ThemeFamily {
  const colorful = swatches
    .map((sw) => ({ ...sw, hsl: toHsl(sw.hex) }))
    .filter((sw) => isChromatic(sw.hsl))
    .sort((a, b) => Math.sqrt(b.weight) * b.hsl.s - Math.sqrt(a.weight) * a.hsl.s);
  if (!colorful.length) throw new Error('This image has too little color to build a family from. Try one with at least one clear color.');
  const lead = colorful[0];
  const chosen = [lead];
  // A pop must cover a real part of the picture (not an edge blend) and read as its own color:
  // 20° away in hue from every color taken, or clearly lighter or darker.
  const distinct = (a: HSL, b: HSL) => hueDistance(a.h, b.h) >= 20 || Math.abs(a.l - b.l) >= 0.18;
  for (const sw of colorful.slice(1)) {
    if (chosen.length > 4) break;
    if (sw.weight >= 0.02 && chosen.every((c) => distinct(c.hsl, sw.hsl))) chosen.push(sw);
  }
  const pops = chosen.slice(1);
  // Keep a warm color out of the info slot when a cooler one can take it.
  if (pops.length > 2 && WARM_INFO.includes(nearestHue(pops[1].hex))) {
    const j = pops.findIndex((p, i) => i > 1 && !WARM_INFO.includes(nearestHue(p.hex)));
    if (j > 1) [pops[1], pops[j]] = [pops[j], pops[1]];
  }
  const byLight = [...swatches].sort((a, b) => toHsl(a.hex).l - toHsl(b.hex).l);
  const darkest = byLight[0];
  const lightest = byLight[byLight.length - 1];
  const dl = toHsl(darkest.hex);
  const ll = toHsl(lightest.hex);
  const clean = name.trim() || 'From image';
  return {
    id: slugify(clean),
    name: clean,
    description: description ?? 'Made from an image.',
    generator: {
      dominant: nearestHue(lead.hex),
      pops: pops.map((p) => nearestHue(p.hex)),
      neutral: neutralFor(swatches, lead.hsl.h),
      signature: {
        primary: lead.hex,
        ...(pops.length ? { pops: pops.map((p) => p.hex) } : {}),
        // Only colors that read as a tinted surface; a plain black or white leaves the neutral alone.
        ...(dl.l < 0.3 && dl.s > 0.08 ? { night: darkest.hex } : {}),
        ...(ll.l > 0.8 && ll.s > 0.08 ? { day: lightest.hex } : {}),
      },
    },
  };
}
