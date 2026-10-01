'use strict';
/**
 * withFileEditStance — the string transform behind the Add Agent modal's
 * "Never edit existing files" checkbox.
 *
 * Worth a test for the same reason its permission-mode sibling is: the whole
 * control hinges on the resulting command carrying a `--disallowedTools` token
 * that names Edit. Get the string wrong and the checkbox silently does nothing,
 * which is the worst possible failure for a control whose entire job is to be a
 * guarantee rather than a request.
 *
 * The round-trip cases matter most: an operator ticks and unticks while editing
 * the command by hand, and every pass has to leave exactly one flag behind.
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const {
  withFileEditStance,
  hasFileEditStance,
  NO_FILE_EDIT_TOOLS
} = loadTs('src/shared/agentProvider.ts');

test('ticking adds a disallow list that names Edit', () => {
  const out = withFileEditStance('claude --model claude-sonnet-5', true);
  assert.equal(out, 'claude --model claude-sonnet-5 --disallowedTools Edit,NotebookEdit');
  assert.equal(hasFileEditStance(out), true);
});

test('unticking removes it entirely', () => {
  const out = withFileEditStance('claude --disallowedTools Edit,NotebookEdit', false);
  assert.equal(out, 'claude');
  assert.equal(hasFileEditStance(out), false);
});

test('ticking twice does not stack a second flag', () => {
  const once = withFileEditStance('claude', true);
  const twice = withFileEditStance(once, true);
  assert.equal(twice, once);
  assert.equal(twice.match(/--disallowedTools/g).length, 1);
});

test('the = spelling is replaced, not duplicated', () => {
  const out = withFileEditStance('claude --disallowedTools=WebFetch --model x', true);
  assert.equal(out.match(/--disallowedTools/g).length, 1);
  assert.match(out, /--model x/);
  assert.equal(hasFileEditStance(out), true);
});

test('it composes with the permission stance instead of clobbering it', () => {
  const out = withFileEditStance('claude --permission-mode default --model x', true);
  assert.match(out, /--permission-mode default/);
  assert.match(out, /--model x/);
  assert.equal(hasFileEditStance(out), true);
});

test('round-trips back to the original command', () => {
  const original = 'claude --model claude-sonnet-5 --permission-mode default';
  assert.equal(withFileEditStance(withFileEditStance(original, true), false), original);
});

test('an unrelated disallow list does not read as "edits are blocked"', () => {
  // The detector is token-aware on purpose: a command that only blocks WebFetch
  // must leave the checkbox UNticked, or unticking it would strip a flag the
  // operator set for an entirely different reason.
  assert.equal(hasFileEditStance('claude --disallowedTools WebFetch'), false);
  assert.equal(hasFileEditStance('claude --disallowedTools NotebookEdit'), false);
  assert.equal(hasFileEditStance('claude --disallowedTools WebFetch,Edit'), true);
});

test('Write is NOT blocked — the hive needs it', () => {
  // Outbox messages and memory.md are files the agent must create for the hive
  // to work at all. If this list ever grows to include Write, coordination
  // breaks and the agent goes silent rather than becoming safer.
  assert.equal(NO_FILE_EDIT_TOOLS.split(',').includes('Write'), false);
  assert.deepEqual(NO_FILE_EDIT_TOOLS.split(','), ['Edit', 'NotebookEdit']);
});
