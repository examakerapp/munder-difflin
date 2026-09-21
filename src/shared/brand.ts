/**
 * The product name, in one place.
 *
 * This fork ships as "Founder Cortex". Upstream (chaitanyagiri/munder-difflin)
 * ships as "Munder Difflin", and `dev` is rebased onto upstream regularly — so
 * the rename is built to survive that rebase rather than to win a
 * find-and-replace. Two rules follow from it:
 *
 *  1. DISPLAY strings are renamed. Anything the user reads.
 *  2. IDENTITY keys are NOT. `appId`, the `munderdifflin://` URL scheme,
 *     HIRE_SPEC_V1 (`munder-difflin/hire@1`), the `munder-` prefixes written
 *     into agents' MCP/hook config, the named pipes, and package.json's `name`
 *     all keep the old spelling on purpose. They identify STORED STATE and
 *     EXTERNAL CONTRACTS: renaming them would orphan an installed build's
 *     settings and database, break hire links already shared, and strand
 *     `munder-hive` entries in agents' global config with no owner. A rename
 *     is not worth losing somebody's configuration over.
 *
 * The UI never contains the old name at rest, because `rebrand()` is applied to
 * every translated string as it loads (see i18n/index.ts). That is deliberately
 * a transform rather than 24 edits across three locale files: those files are
 * upstream's, they change often, and rewriting their lines would put a conflict
 * in front of every future sync. As a bonus, a NEW upstream string mentioning
 * the old name is renamed automatically instead of being missed.
 */

/** What this fork is called. */
export const APP_NAME = 'Founder Cortex';

/** What upstream calls it — the string `rebrand` looks for. */
export const UPSTREAM_APP_NAME = 'Munder Difflin';

/**
 * Swap the upstream product name for this fork's, anywhere it appears in text.
 *
 * Matches the spaced display form only, so it cannot touch an identifier or a
 * URL: `munderdiffl.in`, `munder-difflin`, `munderdifflin://` and the
 * `munder-` config prefixes all have no space and are left exactly as they are.
 * Whitespace between the two words is allowed to vary so a line-wrapped or
 * non-breaking-space occurrence is still caught.
 */
export function rebrand<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/Munder\s+Difflin/g, APP_NAME) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(rebrand) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rebrand(v);
    return out as unknown as T;
  }
  return value;
}
