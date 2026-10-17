import assert from 'node:assert/strict';
import * as C from '../src/collection';
import { PRESETS } from '../src/presets';
import { auditTheme } from '../src/contrast';
import { serializeThemeFile } from '../src/themeSpec';
import * as store from '../src/store';
const mem = new Map<string, string>();
(globalThis as any).window = { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } };
let n = 0; const ok = (m: string) => { n++; console.log('PASS', m); };

// parseImport
const one = C.parseImport(serializeThemeFile(PRESETS[0]));
assert.equal(one.family, null); assert.equal(one.themes.length, 1); assert.equal(one.themes[0].id, PRESETS[0].id); ok('single .nimtheme');
const harbor = C.BUILTIN_FAMILIES[0];
const famText = C.serializeFamilyFile({ ...harbor, id: 'tide', name: 'Tide' }, PRESETS.filter((p: any) => p.family === 'harbor'));
const fam = C.parseImport(famText);
assert.equal(fam.family.id, 'tide'); assert.equal(fam.themes.length, 6); assert.ok(fam.themes.every((t: any) => t.family === 'tide')); assert.deepEqual(fam.family.generator, harbor.generator); ok('family bundle round trip, members re-filed under bundle family');
assert.equal(C.parseImport(JSON.stringify(PRESETS.slice(0, 3))).themes.length, 3); ok('bare array');
assert.equal(C.parseImport(JSON.stringify({ themes: PRESETS.slice(0, 2) })).family, null); ok('{themes} without family');
assert.throws(() => C.parseImport('{nope'), /Not valid JSON/); assert.throws(() => C.parseImport('{"a":1}'), /Expected a theme/); ok('errors are readable');

// generated family (the kit's path): 6 themes, all pass the audit
const tide = C.generateFamilyThemes({ id: 'tidepool', name: 'Tidepool', generator: { dominant: 'teal', pops: ['sky', 'lime'], neutral: 'slate' } });
assert.equal(tide.length, 6); assert.equal(tide.flatMap((t: any) => auditTheme(t).filter((r: any) => !r.pass)).length, 0); ok('generated family: 6 themes, 0 audit failures');

// wizard: a family groups existing themes
const base = { themes: [...PRESETS], families: C.BUILTIN_FAMILIES.map((f: any) => ({ ...f })) };
const picks = ['harbor-dark-juicy', 'grove-light-subtle', 'plum-dark-pigment'];
const sw = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff'];
const made = C.saveFamilyInto(base, { name: 'Faves', description: 'Mine.', swatches: [...sw, '#123456', 'nope'], themeIds: picks }, null);
assert.equal(made.family.id, 'faves'); assert.equal(made.state.families[0].id, 'faves'); assert.equal(made.state.themes.length, 132);
assert.deepEqual(made.family.swatches, sw); assert.equal(made.moved, 3);
assert.deepEqual(made.state.themes.filter((t: any) => t.family === 'faves').map((t: any) => t.id).sort(), [...picks].sort());
assert.equal(made.state.themes.filter((t: any) => t.family === 'harbor').length, 5); ok('new family groups existing themes, moves them, keeps 5 valid swatches, creates none');
const edited = C.saveFamilyInto(made.state, { name: 'Faves', description: '', swatches: [], themeIds: ['grove-light-subtle'] }, 'faves');
assert.equal(edited.state.themes.filter((t: any) => t.family === 'faves').length, 1); assert.equal(edited.state.themes.find((t: any) => t.id === 'harbor-dark-juicy').family, undefined);
assert.equal(edited.family.swatches, undefined); assert.equal(edited.state.themes.length, 132); ok('edit: unselected members leave the family and stay in the collection');
const harborEdit = C.saveFamilyInto(base, { name: 'Harbor', description: 'x', swatches: sw, themeIds: base.themes.filter((t: any) => t.family === 'harbor').map((t: any) => t.id) }, 'harbor');
assert.deepEqual(harborEdit.family.generator, C.BUILTIN_FAMILIES[0].generator); ok('edit keeps a built-in family\'s generator as provenance');
assert.deepEqual(C.familyHeaderColors({ ...made.family }, [], true), sw); assert.equal(C.familyHeaderColors(C.BUILTIN_FAMILIES[0], [], true).length, 5);
assert.equal(C.familyHeaderColors({ id: 'x', name: 'X' }, PRESETS.slice(0, 2), true).length, 5); ok('header colors: own swatches, else generator, else members');
assert.ok(C.suggestedSwatches(PRESETS.slice(0, 3)).every((c: string) => /^#[0-9a-f]{6}$/.test(c))); ok('suggestions are opaque hex colors');

// swatches round-trip through the family file
const fileWithSw = C.serializeFamilyFile(made.family, made.state.themes.filter((t: any) => t.family === 'faves'));
assert.deepEqual(C.parseImport(fileWithSw).family.swatches, sw); ok('swatches survive .nimfamily export and import');

// Import theme vs Import family refuse each other's files
assert.equal(C.parseThemeImport(serializeThemeFile(PRESETS[0])).id, PRESETS[0].id);
assert.throws(() => C.parseThemeImport(fileWithSw), /Import family/); assert.throws(() => C.parseThemeImport(JSON.stringify(PRESETS.slice(0, 2))), /takes one/);
assert.equal(C.parseFamilyImport(fileWithSw).family.id, 'faves');
assert.throws(() => C.parseFamilyImport(serializeThemeFile(PRESETS[0])), /Import theme/); assert.throws(() => C.parseFamilyImport(JSON.stringify({ themes: PRESETS.slice(0, 2) })), /no "family"/);
ok('Import theme and Import family each refuse the other kind, with a pointer');

// import replace vs copy
const rep = C.importInto(base, C.parseImport(C.serializeFamilyFile(harbor, PRESETS.filter((p: any) => p.family === 'harbor'))), 'replace');
assert.equal(rep.state.themes.length, base.themes.length); assert.equal(rep.state.families.length, base.families.length); assert.equal(rep.familyId, 'harbor'); ok('import family, replace: no duplicates');
const cp = C.importInto(base, C.parseImport(C.serializeFamilyFile(harbor, PRESETS.filter((p: any) => p.family === 'harbor'))), 'copy');
assert.equal(cp.state.themes.length, base.themes.length + 6); assert.equal(cp.familyId, 'harbor-2'); assert.ok(cp.state.themes.slice(0, 6).every((t: any) => t.family === 'harbor-2' && t.id.endsWith('-2'))); ok('import family, copy: new family + new ids');
const loose = C.importInto({ themes: [], families: [] }, C.parseImport(serializeThemeFile(PRESETS[0])), 'copy');
assert.equal(loose.state.themes[0].family, undefined); ok('loose theme drops a family that does not exist here');

// delete family
const keep = C.deleteFamilyFrom(base, 'harbor', false);
assert.equal(keep.state.themes.length, 132); assert.equal(keep.state.themes.filter((t: any) => t.family === 'harbor').length, 0); assert.deepEqual(keep.removedThemeIds, []); ok('delete family, keep themes');
const drop = C.deleteFamilyFrom(base, 'harbor', true);
assert.equal(drop.state.themes.length, 126); assert.equal(drop.removedThemeIds.length, 6); ok('delete family and themes');

// restore
const r1 = C.restoreBuiltinsInto(keep.state);
assert.equal(r1.families, 1); assert.equal(r1.themes, 0); assert.equal(r1.state.themes.filter((t: any) => t.family === 'harbor').length, 6); ok('restore: kept themes rejoin restored family');
const r2 = C.restoreBuiltinsInto(drop.state);
assert.equal(r2.themes, 6); assert.equal(r2.state.themes.length, 132); ok('restore: deleted themes come back');
assert.deepEqual(C.missingBuiltins(base), { families: [], themes: [] }); ok('nothing missing on a fresh collection');

// store seeding
mem.set('com.fireworklabs.theme-editor/userThemes', JSON.stringify([{ id: 'mine', name: 'Mine', isDark: true, colors: { bg: '#000000' } }]));
assert.equal(store.getCollection().length, 133); assert.equal(store.getCollection()[0].id, 'mine'); assert.equal(store.getFamilies().length, 22); ok('pre-seed view: user themes then presets, builtin families');
await store.ensureSeeded();
assert.equal(JSON.parse(mem.get('com.fireworklabs.theme-editor/userThemes')!).length, 133); assert.equal(mem.get('com.fireworklabs.theme-editor/collectionSeeded'), '1'); ok('seed persisted');
await store.setCollection([], []);
assert.equal(store.getCollection().length, 0); assert.equal(store.getFamilies().length, 0); ok('after seeding, an empty collection stays empty (no re-seed)');
assert.equal(JSON.parse(mem.get('com.fireworklabs.theme-editor/builtinFamiliesSeen')!).length, 22); ok('seeding records every built-in family as seen');

// new built-in families reach collections seeded by an older version, once
const ids10 = C.BUILTIN_FAMILIES.slice(0, 10).map((f: any) => f.id);
const old = { themes: PRESETS.filter((p: any) => ids10.includes(p.family)), families: C.BUILTIN_FAMILIES.slice(0, 10).map((f: any) => ({ ...f })) };
const up = C.addNewBuiltinsInto(old, C.LEGACY_BUILTIN_FAMILY_IDS);
assert.equal(up.added.length, 12); assert.equal(up.state.themes.length, 132); assert.equal(up.state.families.length, 22); assert.equal(up.seen.length, 22); ok('upgrade: twelve new families and their 72 themes are added');
const gone = { themes: old.themes.filter((t: any) => t.family !== 'harbor'), families: old.families.filter((f: any) => f.id !== 'harbor') };
assert.equal(C.addNewBuiltinsInto(gone, C.LEGACY_BUILTIN_FAMILY_IDS).state.families.some((f: any) => f.id === 'harbor'), false); ok('upgrade: a deleted family that was already seen stays deleted');
assert.equal(C.addNewBuiltinsInto(up.state, up.seen).added.length, 0); ok('upgrade runs once');
const mine = { ...old, themes: [...old.themes, { ...PRESETS.find((p: any) => p.id === 'frost-dark-juicy'), name: 'My Frost' }] };
assert.equal(C.addNewBuiltinsInto(mine, C.LEGACY_BUILTIN_FAMILY_IDS).state.themes.filter((t: any) => t.id === 'frost-dark-juicy')[0].name, 'My Frost'); ok('upgrade keeps a theme the user already has under a built-in id');
mem.delete('com.fireworklabs.theme-editor/builtinFamiliesSeen');
await store.setCollection(old.themes, old.families);
await store.ensureSeeded();
assert.equal(store.getCollection().length, 132); assert.equal(store.getFamilies().length, 22); assert.equal(JSON.parse(mem.get('com.fireworklabs.theme-editor/builtinFamiliesSeen')!).length, 22); ok('store: a 0.5.x collection gains the new families on startup');

// generator options: paper and high contrast
const members = (id: string) => PRESETS.filter((p: any) => p.family === id);
assert.ok(members('parchment').filter((t: any) => !t.isDark).every((t: any) => t.colors.bg !== '#ffffff' && t.colors.bg !== members('grove').find((g: any) => g.id === t.id.replace('parchment', 'grove'))?.colors.bg)); ok('paper tints the light surfaces');
const { contrastRatio } = await import('../src/color');
assert.ok(members('beacon').every((t: any) => contrastRatio(t.colors.text, t.colors.bg) >= 10 && contrastRatio(t.colors.primary, t.colors.bg) >= 7 && contrastRatio(t.colors.border, t.colors.bg) >= 3)); ok('high contrast: text 10:1, accent 7:1, borders 3:1');
assert.equal(C.normalizeFamily({ name: 'B', generator: { dominant: 'blue', pops: [], neutral: 'gray', paper: 'amber', contrast: 'high' } }).generator?.contrast, 'high'); ok('family files carry paper and contrast');
assert.equal(PRESETS.flatMap((t: any) => auditTheme(t).filter((r: any) => !r.pass)).length, 0); ok('all 132 presets pass the audit');

// cycling and favorites
const frostDS = PRESETS.find((p: any) => p.id === 'frost-dark-subtle')!;
const ringF = C.cycleList(PRESETS, 'family', frostDS, []);
assert.equal(ringF.length, 6); assert.ok(ringF.every((t: any) => t.family === 'frost')); ok('cycle: family scope is the six members');
assert.equal(C.stepTheme(ringF, frostDS.id, 1)!.id, ringF[1].id); assert.equal(C.stepTheme(ringF, frostDS.id, -1)!.id, ringF[5].id); ok('cycle: steps and wraps both ways');
const loner = { ...frostDS, id: 'loner', family: undefined };
assert.equal(C.cycleList([...PRESETS, loner], 'family', loner, []).length, 133); ok('cycle: a theme without a family cycles through all');
const ringFav = C.cycleList(PRESETS, 'favorites', frostDS, ['pine-light-juicy', 'harbor-dark-subtle']);
assert.deepEqual(ringFav.map((t: any) => t.id), ['harbor-dark-subtle', 'frost-dark-subtle', 'pine-light-juicy']); ok('cycle: favorites in collection order, current included');
assert.equal(C.stepTheme([], 'x', 1), null); assert.equal(C.stepTheme(ringF, 'gone', 1)!.id, ringF[0].id); ok('cycle: empty list and missing current');
await store.setFavorites(['a', 'b']);
assert.deepEqual(store.getFavorites(), ['a', 'b']); assert.equal(mem.get('com.fireworklabs.theme-editor/favoriteThemes'), '["a","b"]'); ok('favorites persist');
// signature families: exact colors survive where they pass, and travel in family files
const mechaLJ = PRESETS.find((p: any) => p.id === 'mecha-light-juicy')!;
assert.equal(mechaLJ.colors.primary, '#1d4fa8'); ok('signature: an exact accent that passes is kept as is');
assert.ok(members('power-level').every((t: any) => contrastRatio(t.colors.primary, t.colors.bg) >= 4.5)); ok('signature: an accent that cannot pass is nudged until it does');
const sigFam = C.normalizeFamily({ name: 'S', generator: { dominant: 'blue', pops: ['red'], neutral: 'gray', signature: { primary: '#123456', pops: ['#ff0000', 'nope', '#00ff00'], night: 'bad', day: '#eeeeee' } } });
assert.deepEqual(sigFam.generator?.signature, { primary: '#123456', day: '#eeeeee', pops: ['#ff0000', '', '#00ff00'] }); ok('signature: family files keep valid colors and slot positions');
assert.equal(C.generateFamilyThemes(sigFam).flatMap((t: any) => auditTheme(t).filter((r: any) => !r.pass)).length, 0); ok('signature: an imported signature family passes the audit');
const { toHsl } = await import('../src/fromImage');
const plSide = PRESETS.find((p: any) => p.id === 'power-level-light-juicy')!.colors['bg-secondary'];
assert.ok(toHsl(plSide).s > 0.3 && Math.abs(toHsl(plSide).h - toHsl('#f26b1d').h) < 15); ok('signature light: sidebars carry a wash of the accent');
assert.ok(members('mecha').concat(members('power-level')).filter((t: any) => !t.isDark).every((t: any) => ['bg', 'bg-secondary', 'bg-tertiary'].every((k) => contrastRatio(t.colors.text, t.colors[k]) >= 7))); ok('signature light: text still reads 7:1 on every washed surface');

// family from an image
const { paletteFromPixels, familyFromPalette, nearestHue } = await import('../src/fromImage');
const img = (parts: [string, number][]) => {
  const px: number[] = [];
  for (const [hex, count] of parts) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < count; i++) px.push(c[0], c[1], c[2], 255);
  }
  return px;
};
const mechaPx = img([['#f2f2f2', 400], ['#1e50a2', 250], ['#d0202e', 150], ['#f6c200', 100], ['#0c1a33', 100]]);
const pal = paletteFromPixels(mechaPx);
assert.equal(pal.length, 5); assert.equal(pal[0].hex, '#f2f2f2'); assert.ok(Math.abs(pal[0].weight - 0.4) < 1e-9); ok('image: palette finds the five colors with their shares');
assert.equal(paletteFromPixels(img([['#336699', 10], ['#ffffff', 0]]).concat([0, 0, 0, 0])).length, 1); ok('image: transparent pixels are ignored');
const fromImg = familyFromPalette(pal, 'Hangar');
assert.equal(fromImg.id, 'hangar'); assert.equal(fromImg.generator?.dominant, nearestHue('#1e50a2')); assert.equal(fromImg.generator?.signature?.primary, '#1e50a2');
assert.deepEqual([...fromImg.generator!.signature!.pops!].sort(), ['#d0202e', '#f6c200']); assert.equal(fromImg.generator?.signature?.night, '#0c1a33'); assert.equal(fromImg.generator?.signature?.day, undefined); ok('image: accent, pops and night tint come from the picture');
assert.equal(C.generateFamilyThemes(fromImg).flatMap((t: any) => auditTheme(t).filter((r: any) => !r.pass)).length, 0); ok('image: the generated family passes the audit');
assert.throws(() => familyFromPalette(paletteFromPixels(img([['#808080', 50], ['#202020', 50], ['#f0f0f0', 50]])), 'Gray'), /too little color/); ok('image: a gray image is refused with a readable message');
const warm = familyFromPalette(paletteFromPixels(img([['#e8d9b5', 500], ['#c0392b', 200], ['#f1c40f', 120], ['#2e86c1', 100], ['#27ae60', 80]])), 'Warm');
const dbz = familyFromPalette(paletteFromPixels(img([['#f37021', 300], ['#1c3f95', 250], ['#ffd23f', 150], ['#4fc3f7', 100], ['#101a33', 200]])), 'Arena');
assert.deepEqual([...dbz.generator!.signature!.pops!].sort(), ['#1c3f95', '#4fc3f7', '#ffd23f']); ok('image: close hues that differ in lightness (gold by orange, cyan by blue) stay separate pops');
assert.equal(familyFromPalette(paletteFromPixels(img([['#f37021', 990], ['#1c3f95', 10]])), 'Edge').generator!.pops.length, 0); ok('image: a sliver under 2% is not a pop');
assert.equal(warm.generator?.neutral, 'stone'); assert.ok(!['yellow', 'amber', 'orange'].includes(warm.generator!.pops[1])); ok('image: warm grays pick stone, and the info slot avoids warm hues');
// bulk delete: families emptied by a delete go with it
const coll = { themes: [...PRESETS], families: C.BUILTIN_FAMILIES.map((f: any) => ({ ...f })) };
const frostIds = members('frost').map((t: any) => t.id);
const bulk = C.removeThemesFrom(coll, new Set([...frostIds, 'harbor-dark-juicy']));
assert.equal(bulk.state.themes.length, 125); assert.deepEqual(bulk.emptied.map((f: any) => f.id), ['frost']); assert.ok(!bulk.state.families.some((f: any) => f.id === 'frost') && bulk.state.families.some((f: any) => f.id === 'harbor')); ok('bulk delete: a family losing its last theme goes, a partly emptied one stays');
const withEmpty = { ...coll, families: [...coll.families, { id: 'empty', name: 'Empty' }] };
assert.ok(C.removeThemesFrom(withEmpty, new Set(['harbor-dark-juicy'])).state.families.some((f: any) => f.id === 'empty')); ok('bulk delete: an already empty family is left alone');

// remix: same colors, new roles
const R = await import('../src/remix');
const plFam = C.BUILTIN_FAMILIES.find((f: any) => f.id === 'power-level')!;
const palette = (g: any) => [g.signature?.primary, ...(g.signature?.pops ?? [])].filter(Boolean).sort();
const remixes = [1, 2, 3, 4, 5, 6].map((k) => R.remixFamily(plFam, k)!);
assert.ok(remixes.every((r: any) => JSON.stringify(r.generator) !== JSON.stringify(plFam.generator))); ok('remix: never the original');
assert.deepEqual(JSON.stringify(R.remixFamily(plFam, 3)), JSON.stringify(remixes[2])); ok('remix: remix n is stable');
assert.ok(new Set(remixes.map((r: any) => JSON.stringify(r.generator))).size >= 5); ok('remix: successive remixes differ');
assert.ok(remixes.every((r: any) => JSON.stringify(palette(r.generator)) === JSON.stringify(palette(plFam.generator)) && r.generator.signature.night === '#0f1830' && r.id === plFam.id)); ok('remix: same colors, same night tint, same id');
const remixThemes = C.generateFamilyThemes(remixes[0]);
assert.deepEqual(remixThemes.map((t: any) => t.id), members('power-level').map((t: any) => t.id)); ok('remix: theme ids match, so Replace keeps assignments');
assert.equal(remixes.flatMap((r: any) => C.generateFamilyThemes(r)).flatMap((t: any) => auditTheme(t).filter((x: any) => !x.pass)).length, 0); ok('remix: every remix passes the audit');
assert.ok(R.remixFamily(C.BUILTIN_FAMILIES[0], 1)!.generator!.signature === undefined); ok('remix: a Tailwind-only family stays Tailwind-only');
assert.equal(R.remixFamily({ id: 'x', name: 'X' }, 1), null); ok('remix: a family without a generator cannot be remixed');
console.log(`\n${n} passed`);
