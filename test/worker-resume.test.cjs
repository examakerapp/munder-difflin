'use strict';
/**
 * workerResume — how a task cut off by an app quit is re-queued.
 *
 * Each test guards one way the resume could go wrong: looping forever on a task
 * that keeps getting interrupted, losing the checkpoint pointer, or choking on a
 * torn live-workers.json written mid-crash.
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const { resumeIdFor, buildResumeRequest, parseLiveWorkers, RESUME_NOTE } = loadTs('src/shared/workerResume.ts');

test('a task is resumed once, as <id>-r2', () => {
  assert.equal(resumeIdFor('analyst-2026-10-01-funnel'), 'analyst-2026-10-01-funnel-r2');
});

test('an already-resumed task is never resumed again — no loop across restarts', () => {
  assert.equal(resumeIdFor('analyst-2026-10-01-funnel-r2'), null);
  assert.equal(resumeIdFor('extractor-job7-r3'), null);
});

test('an id that merely contains -r is still resumable', () => {
  assert.equal(resumeIdFor('scribe-r-and-d-post'), 'scribe-r-and-d-post-r2');
});

test('the resume keeps every original field and the CHECKPOINT line', () => {
  const original = {
    id: 'money-2026-10-01-mandates', name: 'Money', role: 'Revenue and billing analyst',
    cwd: 'D:\\x\\money', command: 'claude --model claude-sonnet-5 --disallowedTools Edit,NotebookEdit',
    isolate: false, character: 'angela',
    objective: 'TASK: money-2026-10-01-mandates\nCHECKPOINT: tasks/money-2026-10-01-mandates.md\nOBJECTIVE: halted mandates'
  };
  const r = buildResumeRequest(original, 'money-2026-10-01-mandates-r2');
  assert.equal(r.id, 'money-2026-10-01-mandates-r2');
  for (const k of ['name', 'role', 'cwd', 'command', 'isolate', 'character']) assert.deepEqual(r[k], original[k], k);
  assert.ok(r.objective.startsWith(RESUME_NOTE), 'resume note comes first');
  // Same checkpoint as the interrupted run — that is what makes it a continuation.
  assert.ok(r.objective.includes('CHECKPOINT: tasks/money-2026-10-01-mandates.md'));
  assert.equal(original.id, 'money-2026-10-01-mandates', 'original request not mutated');
});

test('a torn or hand-edited live-workers.json yields only well-formed entries', () => {
  assert.deepEqual(parseLiveWorkers('{"workerId": "worker-a"'), []);
  assert.deepEqual(parseLiveWorkers('{"not":"an array"}'), []);
  const good = { workerId: 'worker-a', reqId: 'a', reqFile: 'a.json', spawnedAt: 1 };
  assert.deepEqual(parseLiveWorkers(JSON.stringify([good, { workerId: 'worker-b' }, null, 5])), [good]);
});
