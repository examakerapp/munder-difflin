/**
 * Resuming god-spawned workers after the app closed under them.
 *
 * Quitting kills every PTY. A worker that was mid-task used to come back on the
 * next launch as a restored floor card with its old chat attached — but as a
 * REGULAR agent: no longer released on `done`, never idle-reaped, and the whole
 * old transcript re-read on the first turn. Instead, main remembers which
 * workers were live (live-workers.json in the hive) and, at the next start,
 * re-queues each unfinished task as a FRESH worker told to continue from the
 * task's checkpoint file. The restored card is not brought back at all.
 *
 * Pure: no fs, no electron — main does the reading and writing.
 */

/** One live worker, as main persists it. */
export interface LiveWorkerEntry {
  workerId: string;   // `worker-<reqId>`
  reqId: string;      // the spawn-request id
  reqFile: string;    // the request's file name in spawn-requests/.done/
  spawnedAt: number;  // epoch ms — the stale-done guard for "did it already finish?"
}

/** Prepended to the original objective of a resumed task. */
export const RESUME_NOTE =
  'RESUME — this task was interrupted: the app closed while it was running. ' +
  'Before anything else, read the CHECKPOINT named below and continue from its next step. ' +
  'Do not redo finished steps; check that the outputs it lists exist. ' +
  'If there is no CHECKPOINT line, look in tasks/ for this task\'s checkpoint before starting over.';

const RESUMED = /-r\d+$/;

/** The id for the resumed task, or null when this run was ALREADY a resume.
 *  A task is resumed once automatically: a second interruption means something
 *  is wrong (a usage limit, a crash loop), and repeating it only burns tokens. */
export function resumeIdFor(reqId: string): string | null {
  return RESUMED.test(reqId) ? null : `${reqId}-r2`;
}

/** The new spawn-request: the original, unchanged except its id and a resume
 *  note in front of the objective. The original's CHECKPOINT line rides along,
 *  so the fresh worker reads the same checkpoint the interrupted one wrote. */
export function buildResumeRequest(original: Record<string, unknown>, newId: string): Record<string, unknown> {
  const objective = typeof original.objective === 'string' ? original.objective : '';
  return { ...original, id: newId, objective: `${RESUME_NOTE}\n\n${objective}` };
}

/** Parse live-workers.json defensively — a torn or hand-edited file yields only
 *  the well-formed entries, never a throw. */
export function parseLiveWorkers(text: string): LiveWorkerEntry[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(data)) return [];
  return data.filter((e): e is LiveWorkerEntry =>
    !!e && typeof e === 'object' &&
    typeof (e as LiveWorkerEntry).workerId === 'string' &&
    typeof (e as LiveWorkerEntry).reqId === 'string' &&
    typeof (e as LiveWorkerEntry).reqFile === 'string' &&
    typeof (e as LiveWorkerEntry).spawnedAt === 'number');
}
