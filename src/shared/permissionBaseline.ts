/**
 * The permission baseline every hive agent is spawned with — the rules that make
 * a floor quiet for routine work and loud only for the consequential.
 *
 * Why this exists. Turning auto mode off used to mean Claude Code's bare
 * `default` mode: a prompt for every `ls`. That trains the operator to click
 * Allow without reading, and the one prompt that mattered gets approved on
 * reflex too — so in practice "off" drifted back to "bypass everything". This
 * baseline is the middle posture auto mode never had.
 *
 * How it lands. hive.ts merges this into the PER-SESSION settings file it
 * writes on every spawn (never ~/.claude, never the agent's repo). An operator's
 * own "always allow" answers are written by Claude Code to the working
 * directory's `.claude/settings.local.json`, which the harness never touches,
 * so tuning survives a respawn and layers on top of this.
 *
 * Every rule below was checked against a real Claude Code (2.1.280) run, not
 * inferred from docs. Two findings shaped it:
 *
 *  1. PATH FORM. `Read(**\/.env)` matches only inside the agent's working
 *     directory. A repo is OUTSIDE a non-coding agent's cwd, so that form let a
 *     `.env` beside the code be read silently. `Read(//**\/.env)` — rooted —
 *     matched on every drive tested, including the cross-drive case of a cwd on
 *     D:, a settings file on C: and a secret on D:.
 *  2. DENY, NOT ASK. An `ask` rule stopped a direct Read but NOT a Grep across a
 *     folder: the search returned the secret's contents. A `deny` rule stopped
 *     both — and still held under `--permission-mode bypassPermissions`, i.e.
 *     with auto mode on. Gitignored files were already skipped by Grep, but
 *     committed `.env` backups are not ignored, and those exist in practice.
 */

/** The mode an agent starts in when no `--permission-mode` flag is given.
 *
 *  `acceptEdits`, not `default`: writes inside the working directory and the
 *  hive's own folders (the harness passes those as `additionalDirectories`) go
 *  through without a prompt, while a write anywhere else still asks. That is
 *  exactly the boundary the hive needs — outbox messages, memory.md and reports
 *  are routine; a file appearing in some unrelated repo is not. Auto mode's
 *  `bypassPermissions` flag still wins over this when auto mode is on. */
export const BASELINE_MODE = 'acceptEdits' as const;

/** Runs without a prompt. Deliberately short, and read-only in effect.
 *
 *  What is NOT here matters as much as what is. No `cat`, `head`, `tail`, `sort`,
 *  `awk`, `find` or content-printing git commands: each can print a file's
 *  contents through the shell, where file-path rules do not reach. Agents read
 *  through the Read / Grep / Glob tools instead, which the secret rules DO
 *  cover. Anything unlisted is not blocked — it simply asks. */
export const ROUTINE_ALLOW: readonly string[] = [
  'Read',
  'Glob',
  'Grep',
  'TodoWrite',
  'WebSearch',
  'Bash(ls:*)',
  'Bash(pwd)',
  'Bash(date:*)',
  'Bash(wc:*)',
  // Hive housekeeping: a handled message is moved into inbox/.done/.
  'Bash(mkdir:*)',
  'Bash(mv:*)',
  'Bash(git status:*)',
  'Bash(git branch:*)',
  // The Question Inbox tools in agent-workspaces/extractor/tools — both READ-ONLY
  // (the validator and the reference builder force a read-only database session
  // and refuse anything but the dev project). Exact script names, not "node:*",
  // so no other script runs unasked. Without these, every Extractor session
  // would stop at its first validation waiting for a click.
  'Bash(node tools/validate-batch.cjs:*)',
  'Bash(node tools/build-reference.cjs:*)',
  // Semantic memory, when MemPalace is installed.
  'Bash(mempalace search:*)',
  'Bash(mempalace wake-up:*)'
];

/** Credential files. Rooted (`//**`) so they match outside the working
 *  directory — see finding 1 above. `.env.*` covers `.env.local`,
 *  `.env.production` and dated backups such as `.env.bak.2026-08-14`. */
export const SECRET_FILE_RULES: readonly string[] = [
  'Read(//**/.env)',
  'Read(//**/.env.*)',
  'Read(//**/*.pem)',
  'Read(//**/*.key)',
  'Read(//**/id_rsa*)'
];

export interface PermissionBaseline {
  defaultMode: typeof BASELINE_MODE;
  allow: string[];
  deny?: string[];
}

/**
 * The `permissions` block for one agent's per-session settings.
 *
 * `protectSecrets` is the operator's Settings toggle (default on). When on, the
 * secret rules go in `deny`, which is the only form that also stops a folder-wide
 * Grep and holds in auto mode. When off they are omitted entirely, and those
 * files read like any other — a real choice the operator can make, not one this
 * module second-guesses.
 */
export function permissionBaseline(protectSecrets: boolean): PermissionBaseline {
  return {
    defaultMode: BASELINE_MODE,
    allow: [...ROUTINE_ALLOW],
    ...(protectSecrets ? { deny: [...SECRET_FILE_RULES] } : {})
  };
}
