# CLAUDE.md — working notes for this fork

This is a personal fork of [munder-difflin](https://github.com/chaitanyagiri/munder-difflin), an
Electron desktop app (Pixi.js 2D office floor + xterm.js terminals) that turns CLI coding agents
(Claude Code, Codex, etc.) into a coordinated "office" of clones. MIT licensed. This file exists so
returning sessions don't need the same context re-explained. Also see the auto-memory files this
session already has (`project_fork_sync_workflow.md`, `project_pro_feature_scope.md`,
`project_design_reference_patterns.md`) — this doc overlaps them on purpose for anything
code-adjacent; the memory files are the source of truth for anything about *how the user works*.

## Branch workflow — read before touching git

- `main` mirrors `upstream/main` (chaitanyagiri/munder-difflin) exactly. Never commit to it directly.
- `dev` is where all customization work happens and gets pushed. **Only push to `dev`, never `main`**
  — the user opens and merges the `dev → main` PR themselves.
- To sync upstream updates: fast-forward `main` to `upstream/main`, then `git rebase main` on `dev`,
  resolving conflicts by picking whichever side is correct, then `git push --force-with-lease origin dev`.

## Scope boundaries — do not cross these without being asked again

- **The 2D floor's tileset and character sprites are off-limits.** They're licensed LimeZu "Modern
  Interiors" assets (`src/renderer/src/assets/tilesets/`, `LIMEZUASSETS-LICENSE.txt`), not color
  tokens — there is no way to reskin them without new art, which isn't something this session can
  generate. UI *chrome* around the floor (the frame, overlays) is fair game; the art itself is not.
- **Pro-tier features to rebuild are scoped to exactly two things**: screenshot capture (standalone,
  not the full "Stapler" floating widget) and the Pro workspace's single-window view (or a toggle for
  it). Record message/meeting, dictation, leave-invisible, and computer-use are explicitly declined —
  don't propose them unless asked again. (There is no actual Pro code in the open-source repo to
  reference — it was never built, confirmed by a full source search.)
- The six agent-identity accent colors and status colors are functional (they distinguish agents/
  states), not decorative — treat any change to them as a real design decision, not a styling tweak.

## Current design system state (v0.5.0, "PostHog-inspired redesign")

The UI went through several iterations this project; what's actually in `main` `dev` right now:

- **Base palette is cool neutral** (blue-gray), not the original warm cream/yellow. Grounded in
  PostHog's real published tokens (`frontend/src/styles/lemon-skin.scss`,
  `@posthog/quill` primitives) where available; approximated where their exact hex isn't public
  (flagged inline in `tokens.css` comments as `SOURCED` vs `APPROXIMATED` in the spec doc).
- **Fully flat — no shadows anywhere, on any surface**, including dialogs/modals. Structure comes
  from a 1px hairline border (`--cth-panel-border*`) alone. Exception: `PixelButton`'s `primary`
  variant has a small **solid, hard-edged offset "pressed sticker" block** (not a blurred shadow) —
  a deliberate, different category, scoped to that one button variant only.
- **Primary/CTA color is "Amber Glow"** (`--cth-primary: #EB9D2A` light / `#F0B24E` dark) — PostHog's
  actual marketing-site CTA color, picked over an earlier indigo-blue attempt per direct request.
  Distinct from the six agent-identity accents on purpose (checked for hue separation, especially
  against `--cth-lilac`, which it was initially too close to).
- **Six agent accents replaced** with real picks from PostHog's published categorical data-viz
  palette: coral `#F14F58`, mint `#529A0A`, sky `#1D4AFF`, lemon `#E4A604`, lilac `#A56EFF`, peach
  `#FE729E` (light theme; see `tokens.css` for dark-theme variants — same hues, lightened).
- **Radius scale**: `--cth-radius-sm/md/lg` = 6/8/12px, `--cth-radius-pill` = 999px. Deliberately
  subtle after two rounds of feedback ("not too curved," then "a little more, not too much").
- **Typography**: display/pixel font (`Press Start 2P`) stays as an intentional personality choice
  on brand moments (kept exactly where it already was) but was removed from `PixelPanel` headers in
  favor of the app's own UI font (Inter) — **never load fonts from Google Fonts or any CDN in the
  real app**; this is a local-first Electron app by design, only bundled fonts are legitimate. (A
  style-guide HTML preview using a CDN font is fine — the shipped app is not.)
- **Spacing**: use the existing `--cth-space-0..8` scale (0/4/8/12/16/24/32/48/64px) — it's already
  an 8pt-grid-compatible system. Don't invent new one-off pixel values; if something needs to sit
  between two named steps, that's usually a sign to pick the nearest step instead.
- Full rationale and before/after history: `docs/superpowers/specs/2026-09-18-*.md` and `.html`
  (the theme-refresh spec, and the PostHog-redesign style guide + its self-critique section).

## Shared components that changed — check these before adding new inline styles

- `PixelPanel.tsx` — the single source of truth for panel/card chrome (radius, border, flat
  background, header treatment). Always has `overflow: hidden` (needed so flush-edge children like
  a progress gauge don't overhang the rounded corners — this regressed once already, don't drop it
  again without checking every consumer).
- `PixelButton.tsx` — `primary` variant carries the tactile offset described above; other variants
  (`secondary`/`ghost`/`destructive`) keep the older, already-tuned 1px-hairline + 1px-lift mechanic.
- `AgentCard.tsx` — went through a full redesign and back; **current state is the original
  open-source implementation, restored via `git show HEAD:<path>` (from before this session's
  changes), with only `width` bumped from 220→240px and the BOSS badge's padding/line-height
  aligned to `PixelBadge`'s box height (colors/font otherwise untouched — reverted per feedback) and
  the selection ring replaced with a tinted-surface treatment (`selectedSurface`: primary-tinted
  background + primary border, no outline ring). If asked to touch this file again, read it fully
  first — it's been rewritten multiple times this session and the history above is the trustworthy
  record of what's real vs. reverted.
- `OfficeFloor.tsx` — has a day/night tint overlay (`nightOverlayRef`, a flat semi-transparent
  rectangle as a stage-level child, alpha synced to `useAppTheme()`), added without touching any
  tileset/sprite art. Watch the async-creation race documented inline (`appThemeRef`) if you touch
  this again — the overlay is created inside an `async init()`, so naively reading React state at
  creation time is wrong.
- `terminalPool.ts` has `DIAGNOSTIC_DISABLE_WEBGL = true` — a **live, unresolved diagnostic flag**.
  It disables `@xterm/addon-webgl` (falls back to the slower DOM renderer) to test whether it's the
  cause of a reported inverted-color-block rendering artifact in embedded terminals. **Ask the user
  whether this was confirmed fixed before touching it** — if yes, it can become permanent (with a
  real comment explaining why); if no, flip it back to `false` and look elsewhere (the actual xterm
  theme color mismatch that was also found and fixed is a separate, confirmed-real bug, already
  resolved in `PtyTerminalView.tsx`'s `lightTheme`/`darkTheme` objects).

## Known, confirmed, not-yet-decided items

- **2D floor seat capacity is hard-capped around 20–25** — `themeRegistry.ts` hand-names each real
  desk/seat with tile coordinates; the floor doesn't dynamically add seats. Beyond capacity, extra
  agents render at the entrance tile, all overlapping — not a crash, just silent visual stacking.
- **A second, fully-registered office theme already exists and is unused by default**: `brooklyn99`
  (`assets/maps/brooklyn99.tmj`, marked `built: true` in `OfficeThemePicker.tsx`) — reachable via
  Settings → Office Theme → enable "TV Show Offices (experimental)" → select it. Switching themes is
  **destructive to current non-god workers** (kills + archives them; recoverable via the
  restore-last-session flow, not a permanent loss) — warn before suggesting a switch if workers are
  active.
- The bundled `interiors.png` tileset atlas (256×1424px, ~350 tile slots) is large relative to what's
  actually placed on the current map — likely unused furniture/decoration variety already available
  without new art.

## Working conventions that have mattered in practice

- **Always run `npm run typecheck` (node + web) after any source edit**, before calling it done.
  This project has caught real regressions this way more than once.
- **Grep for hardcoded hex colors before trusting a "done" claim** on anything token-related — this
  codebase has real precedent for values silently drifting out of sync with `tokens.css`/`tokens.ts`
  (found and fixed three separate instances: `ThoughtBubble.ts`, `ToolBubble.ts`,
  `PtyTerminalView.tsx`'s terminal theme). `tokens.ts` mirrors `tokens.css` for Pixi consumers that
  can't read CSS custom properties — check both when changing a color.
- **This is a Windows dev machine.** `npm install`'s `electron-rebuild` step may fail without Visual
  Studio Build Tools ("Desktop development with C++") — usually harmless for `node-pty` specifically
  since its Windows binary is N-API (ABI-stable, ships a working prebuild regardless), but confirm
  before assuming a failed rebuild is fine.
- **`ELECTRON_RUN_AS_NODE=1` is set in the sandboxed shell tool** used by Claude Code sessions — this
  blocks launching a real Electron GUI window from that shell (deliberate harness guardrail, not a
  bug). Don't try to force it repeatedly; ask the user to run `npm run dev` themselves and report
  back, or use their own screenshots.
- **No visual/canvas verification is possible from an agent session** — no way to see the rendered
  UI, Pixi scene, or terminal output directly. Get explicit user confirmation on anything visual
  before considering it done, and say so plainly rather than guessing.
- Stray build artifacts (`electron.vite.config.<timestamp>.mjs` in the repo root) get left behind
  when a dev-server process is killed uncleanly — safe to delete, they're regenerated on next launch.
