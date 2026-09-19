'use strict';
/**
 * withPermissionStance — the string transform behind the Add Agent modal's
 * "Ask me before risky actions" checkbox.
 *
 * Worth a test because the whole per-agent exemption hinges on the resulting
 * command still containing a `--permission-mode` token: that token is what
 * hasAutoModeStance() looks for, and it is what stops auto mode appending
 * `--permission-mode bypassPermissions` on top. Get the string wrong and the
 * checkbox silently does nothing.
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const { withPermissionStance, hasAutoModeStance } = loadTs('src/shared/agentProvider.ts');

const argv = (s) => s.trim().split(/\s+/);

test('ticking adds a posture auto mode will respect', () => {
  const out = withPermissionStance('claude --model claude-sonnet-5', true);
  assert.equal(out, 'claude --model claude-sonnet-5 --permission-mode default');
  assert.equal(hasAutoModeStance(argv(out), 'claude'), true);
});

test('unticking leaves no posture, so auto mode applies again', () => {
  const out = withPermissionStance('claude --permission-mode default', false);
  assert.equal(out, 'claude');
  assert.equal(hasAutoModeStance(argv(out), 'claude'), false);
});

test('ticking replaces an existing bypass rather than appending a second flag', () => {
  const out = withPermissionStance('claude --permission-mode bypassPermissions', true);
  assert.equal(out, 'claude --permission-mode default');
  assert.equal(out.match(/--permission-mode/g).length, 1);
});

test('unticking strips a non-default posture too, leaving nothing stale', () => {
  assert.equal(withPermissionStance('claude --permission-mode acceptEdits', false), 'claude');
});

test('the = spelling is handled, not duplicated', () => {
  const out = withPermissionStance('claude --permission-mode=plan --model x', true);
  assert.equal(out.match(/--permission-mode/g).length, 1);
  assert.match(out, /--permission-mode default$/);
  assert.match(out, /--model x/);
});

test('round-trips back to the original command', () => {
  const original = 'claude --model claude-sonnet-5';
  assert.equal(withPermissionStance(withPermissionStance(original, true), false), original);
});

test('is idempotent when ticked twice', () => {
  const once = withPermissionStance('claude', true);
  assert.equal(withPermissionStance(once, true), once);
});

test('other flags and their values survive intact', () => {
  const out = withPermissionStance('claude --model x --add-dir /tmp/foo', true);
  assert.match(out, /--model x/);
  assert.match(out, /--add-dir \/tmp\/foo/);
});
