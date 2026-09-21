'use strict';
/**
 * rebrand() — the load-time product-name swap applied to every translated
 * string (see src/renderer/src/i18n/index.ts).
 *
 * Tested because it runs over EVERY UI string in three locales, and because
 * the thing that makes it safe is a negative: it must never touch an
 * identifier. `munderdiffl.in`, `munderdifflin://`, `munder-difflin/hire@1`
 * and the `munder-` config prefixes all identify stored state or external
 * contracts, and rewriting one of them inside a string would be a silent,
 * hard-to-trace break.
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const { rebrand, APP_NAME, UPSTREAM_APP_NAME } = loadTs('src/shared/brand.ts');
const en = require('../src/renderer/src/i18n/locales/en.json');

test('renames the display form', () => {
  assert.equal(rebrand('Restart Munder Difflin to finish updating.'), `Restart ${APP_NAME} to finish updating.`);
});

test('renames every occurrence in one string', () => {
  assert.equal(
    rebrand('Munder Difflin talks to Munder Difflin'),
    `${APP_NAME} talks to ${APP_NAME}`
  );
});

test('leaves identifiers and URLs alone — they have no space', () => {
  for (const id of [
    'https://munderdiffl.in/blog/run-munder-difflin-on-open-models/',
    'munderdifflin://hire?src=https://example.com/a.json',
    'munder-difflin/hire@1',
    'munder-hive',
    'in.munderdiffl.app',
    '\\\\.\\pipe\\munder-difflin-abc'
  ]) {
    assert.equal(rebrand(id), id, `must not rewrite ${id}`);
  }
});

test('walks nested objects and arrays', () => {
  const out = rebrand({ a: { b: 'Munder Difflin Pro' }, c: ['x', 'Munder Difflin'] });
  assert.deepEqual(out, { a: { b: `${APP_NAME} Pro` }, c: ['x', APP_NAME] });
});

test('preserves non-string leaves', () => {
  assert.deepEqual(rebrand({ n: 1, t: true, z: null }), { n: 1, t: true, z: null });
});

test('leaves i18next interpolation placeholders intact', () => {
  assert.equal(rebrand('Restart Munder Difflin from v{{v}}.'), `Restart ${APP_NAME} from v{{v}}.`);
});

test('the real en.json contains the old name, and none survives the transform', () => {
  const raw = JSON.stringify(en);
  assert.ok(raw.includes(UPSTREAM_APP_NAME), 'fixture check: en.json should still ship upstream spelling');
  const done = JSON.stringify(rebrand(en));
  assert.equal(done.includes(UPSTREAM_APP_NAME), false, 'a display occurrence survived rebrand()');
  // ...while the identifier spellings inside the same file are untouched.
  assert.equal(done.includes('munderdiffl.in'), raw.includes('munderdiffl.in'));
});
