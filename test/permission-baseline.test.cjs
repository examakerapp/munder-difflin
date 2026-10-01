'use strict';
/**
 * permissionBaseline — the rules every hive agent is spawned with.
 *
 * These tests pin what was established by running a real Claude Code (2.1.280)
 * against fake secrets, not by reading docs. Each one guards a specific way the
 * baseline could be "simplified" back into a leak:
 *
 *  - the unrooted `**\/.env` form matched only inside the agent's working
 *    directory and let a `.env` next to the code be read silently;
 *  - an `ask` rule stopped a direct Read but a folder-wide Grep still returned
 *    the secret — only `deny` stopped both, and it held in auto mode too;
 *  - shell commands that print file contents bypass file-path rules entirely,
 *    so they must never be pre-approved.
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const {
  permissionBaseline,
  ROUTINE_ALLOW,
  SECRET_FILE_RULES,
  BASELINE_MODE
} = loadTs('src/shared/permissionBaseline.ts');

test('secret rules are ROOTED, so they match outside the working directory', () => {
  // Regression: `Read(**/.env)` leaked FAKE_OUTSIDE=abc123 in a live run because
  // a repo sits outside a non-coding agent's cwd.
  for (const rule of SECRET_FILE_RULES) {
    assert.match(rule, /^Read\(\/\/\*\*\//, `${rule} must start with Read(//**/`);
  }
});

test('the .env family is covered, including dated backups', () => {
  // `.env.*` is what catches `.env.local`, `.env.production` and the committed
  // `.env.bak.2026-08-14` style backups that are not gitignored.
  assert.ok(SECRET_FILE_RULES.includes('Read(//**/.env)'));
  assert.ok(SECRET_FILE_RULES.includes('Read(//**/.env.*)'));
});

test('protection on puts secrets in DENY — never ask', () => {
  // Regression: `ask` let a folder-wide Grep return the secret's contents.
  const p = permissionBaseline(true);
  assert.deepEqual(p.deny, [...SECRET_FILE_RULES]);
  assert.equal(p.ask, undefined);
});

test('protection off omits the rules entirely — the operator’s call', () => {
  const p = permissionBaseline(false);
  assert.equal(p.deny, undefined);
  assert.equal(p.ask, undefined);
});

test('starts in acceptEdits, so hive writes never prompt but stray writes do', () => {
  assert.equal(BASELINE_MODE, 'acceptEdits');
  assert.equal(permissionBaseline(true).defaultMode, 'acceptEdits');
});

test('no content-printing shell command is pre-approved', () => {
  // Any of these can print a secret through the shell, where the Read rules
  // above do not reach. Unlisted is not blocked — it asks, which is correct.
  const printers = ['cat', 'head', 'tail', 'sort', 'uniq', 'cut', 'awk', 'sed', 'find', 'less', 'more', 'grep', 'rg', 'type'];
  for (const rule of ROUTINE_ALLOW) {
    const m = rule.match(/^Bash\(([a-z-]+)/);
    if (m) assert.ok(!printers.includes(m[1]), `${rule} can print file contents`);
  }
  assert.ok(!ROUTINE_ALLOW.some((r) => /^Bash\(git (log|show|diff|blame)/.test(r)),
    'git log -p / show / diff can print a committed secret');
});

test('nothing destructive or file-editing is pre-approved', () => {
  for (const banned of ['Edit', 'Write', 'NotebookEdit', 'Bash(rm:*)', 'Bash(git push:*)', 'Bash(git commit:*)']) {
    assert.ok(!ROUTINE_ALLOW.includes(banned), `${banned} must not run unprompted`);
  }
});

test('the hive can still do its own housekeeping', () => {
  // A handled message is moved into inbox/.done/. If this ever prompts, every
  // agent stalls on its own inbox.
  assert.ok(ROUTINE_ALLOW.includes('Bash(mv:*)'));
  assert.ok(ROUTINE_ALLOW.includes('Bash(mkdir:*)'));
  for (const t of ['Read', 'Glob', 'Grep']) assert.ok(ROUTINE_ALLOW.includes(t));
});

test('each call returns fresh arrays, so one agent cannot mutate another’s rules', () => {
  const a = permissionBaseline(true);
  a.allow.push('Bash(rm:*)');
  a.deny.length = 0;
  const b = permissionBaseline(true);
  assert.ok(!b.allow.includes('Bash(rm:*)'));
  assert.equal(b.deny.length, SECRET_FILE_RULES.length);
});

test('only the two named read-only Question Inbox scripts run unasked — never node in general', () => {
  assert.ok(ROUTINE_ALLOW.includes('Bash(node tools/validate-batch.cjs:*)'));
  assert.ok(ROUTINE_ALLOW.includes('Bash(node tools/build-reference.cjs:*)'));
  for (const blanket of ['Bash(node:*)', 'Bash(node)', 'Bash(node *)', 'Bash(node tools:*)']) {
    assert.ok(!ROUTINE_ALLOW.includes(blanket), `${blanket} would run any script unasked`);
  }
  // Every node rule names one specific script.
  for (const r of ROUTINE_ALLOW.filter((x) => x.startsWith('Bash(node'))) {
    assert.match(r, /^Bash\(node tools\/[\w-]+\.cjs:\*\)$/, `${r} is broader than one named script`);
  }
});
