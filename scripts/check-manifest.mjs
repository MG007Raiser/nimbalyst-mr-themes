/**
 * Fail the build when manifest.json is not strict JSON or disagrees with
 * package.json.
 *
 * Nimbalyst reads manifest.json with JSON.parse and silently leaves out any
 * extension whose manifest does not parse, so a broken manifest ships an
 * extension that never appears in the app. 0.7.1 shipped a raw line break
 * inside the changelog string and disappeared from the extension list.
 *
 * Runs first in `npm run build`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(name) {
  const text = readFileSync(join(root, name), 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`${name} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const problems = [];
if (manifest.id !== 'com.fireworklabs.theme-editor') problems.push(`manifest id is ${manifest.id}; keep com.fireworklabs.theme-editor`);
if (manifest.version !== pkg.version) problems.push(`manifest version ${manifest.version} differs from package.json ${pkg.version}`);
if (manifest.main !== 'dist/index.js') problems.push(`manifest main is ${manifest.main}; expected dist/index.js`);
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`manifest.json ok (${manifest.id} ${manifest.version})`);
