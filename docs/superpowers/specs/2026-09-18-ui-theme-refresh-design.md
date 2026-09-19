# UI theme refresh — design spec

Status: **proposed, awaiting approval**. Nothing in this document has been applied to the app yet.

## Why

The app's visual language (cream/yellow base surfaces, hard offset "neo-brutalist" shadows,
zero border-radius, a lemon-yellow hover fill) reads as dated next to modern SaaS products. The
goal is a modern, premium, minimal look on **both** the existing light and dark themes, achieved
with the smallest possible blast radius: **token value changes and one shared component**, not a
rebuild.

## Explicitly out of scope (do not touch)

- **The 2D office floor** — Pixi.js scene, LimeZu tileset, character sprites. Already liked as-is.
- **The six semantic accent hues** (`--cth-coral`, `--cth-mint`, `--cth-sky`, `--cth-lemon`,
  `--cth-lilac`, `--cth-peach`) and the **status colors** (`--cth-status-*`). These are functional —
  they distinguish agents and states — and are already contrast-verified against WCAG in both
  themes. Recoloring them is high-risk for a complaint that is actually about base surfaces, not
  the accent rainbow.
- **RTL logic, focus-ring logic, contrast-verification math** in `tokens.css` / `global.css`.
- **Component architecture.** No new abstractions, no new panel components — the existing
  `PixelPanel` component and the existing token file are the only things that change.

## What changes

### 1. Base surface palette (light theme) — the actual "yellow/dated" fix

`--cth-cream-*` and `--cth-paper-*` are the only base-surface tokens, and they're the ones that
read as yellow. Swap them for a neutral warm-graphite scale. Everything else in `:root` (the ink
ramp, accents, status colors, spacing scale, type scale) is untouched.

| Token | Old | New | Used for |
|---|---|---|---|
| `--cth-cream-50` | `#FFFDF5` | `#FAFAF9` | Lightest surface |
| `--cth-cream-100` | `#FFF8E7` | `#F4F3EF` | App background |
| `--cth-cream-200` | `#F4E9C7` | `#E9E7E0` | Inset fills, hover tint |
| `--cth-cream-300` | `#E8D9A0` | `#D8D5CB` | Legacy border/divider use |
| `--cth-paper-100` | `#FCFAF0` | `#FFFFFF` | Cards, terminal background |
| `--cth-paper-200` | `#F0EAD2` | `#F5F4F0` | Secondary card fill |

Contrast impact: ink-900 (`#1A1320`) against the new lightest surfaces measures *higher* contrast
than before (near-white vs. cream), so nothing gets harder to read — it only gets cleaner.

### 2. Dark theme — left almost entirely alone

The dark theme was already re-tuned for WCAG contrast (see the large comment block in
`tokens.css` above `:root[data-cth-theme='dark']`) and doesn't have a yellow-surface problem. Only
the drop-shadow token changes (see §4) carry over into dark mode; no color value changes.

### 3. Border radius — new token scale (does not exist today)

There is currently no shared radius token; the whole app is built hard-cornered on purpose per
`docs/DESIGN.md` ("hard edges, integer pixels, no border-radius"). Only ~14 components hard-code a
radius value today (mostly `2px` or `50%` circles) — the rest are square by omission. Introduce a
small scale and apply it centrally through `PixelPanel` (the shared surface component every
card/panel in the app renders through) so the change propagates without touching each screen:

| Token | Value | Used for |
|---|---|---|
| `--cth-radius-sm` | `6px` | Inset panels, chips, small controls |
| `--cth-radius-md` | `10px` | Default panels/cards |
| `--cth-radius-lg` | `16px` | Dialogs, elevated surfaces |
| `--cth-radius-pill` | `999px` | Pill buttons |

The 2D floor scene and its pixel-art sprites are unaffected — this only applies to UI chrome
rendered through `PixelPanel` and the handful of components in the table in §6.

### 4. Shadow — soften the "hard offset" language

`--cth-shadow-hard` currently draws a flat, blur-less offset box (`3px 3px 0`) — the signature
neo-brutalist look. Replace with a soft, layered elevation shadow, the modern-SaaS default:

| Theme | Old | New |
|---|---|---|
| Light | `3px 3px 0 rgba(26, 19, 32, 0.14)` | `0 1px 2px rgba(26,19,32,.06), 0 4px 10px rgba(26,19,32,.06)` |
| Dark | `4px 4px 0 rgba(0, 0, 0, 0.45)` | `0 1px 2px rgba(0,0,0,.35), 0 6px 16px rgba(0,0,0,.35)` |

`PixelPanel`'s `default` and `dialog` variants gain this as an *additional* outer shadow layered
under the existing hairline inset border (the border itself is not removed — it's a legitimate,
already-accessible pattern, not part of the "dated" complaint).

### 5. Hover treatment — remove the lemon-fill neo-brutalist hover

`.cth-settings-btn:hover` in `global.css` currently fills the button with the lemon accent and
adds a thick offset shadow + a 1px translate "lift." Replace with a calm modern hover: a subtle
neutral tint plus a slightly stronger hairline border, no color swap, no offset shadow, no
transform.

### 6. Spacing — reuse the existing scale, adjust one default

A spacing scale already exists (`--cth-space-0` through `--cth-space-8`, a 4px-based scale from
`0` to `64px`) and needs no new values. The only change is `PixelPanel`'s default internal padding,
bumped from `--cth-space-3` (12px) to `--cth-space-4` (16px), which gives every panel in the app
more breathing room in one edit and directly addresses the "better hierarchy / more visually
intuitive" spacing ask.

### 7. Background texture

The body's diagonal noise texture (`global.css`) is currently yellow-tinted
(`rgba(232, 217, 160, 0.20)`). Desaturate and lower its opacity substantially
(`rgba(120, 118, 110, 0.035)`) so the subtle texture stays but no longer reads as a yellow tint.

## Files touched

| File | Change |
|---|---|
| `src/renderer/src/design/tokens.css` | Base palette swap (§1), new radius tokens (§3), shadow values (§4) |
| `src/renderer/src/design/tokens.ts` | Mirror the same value changes (per the file's own "update both together" comment) |
| `src/renderer/src/components/PixelPanel.tsx` | Apply radius token, add outer shadow to `default`/`dialog` variants, bump default padding |
| `src/renderer/src/design/global.css` | Soften hover treatment (§5), neutralize noise texture (§7) |

No other files are edited. No component is restructured. No new dependencies.

## Verification plan

1. `npm run dev`, visually check both light and dark mode (Settings → theme toggle).
2. Spot-check contrast of ink-900 text against the new lightest surfaces and ink-700 secondary
   text — both should meet or exceed the ratios already documented for the existing tokens (they
   will, since the new surfaces are lighter than the old cream, not darker).
3. Confirm the 2D floor is visually unchanged (no diff in `scene/office/`).
4. Confirm the six accent hues and status colors are visually unchanged.
5. Click through Settings, a terminal panel, a dialog, and a chip/badge to confirm the new radius
   and shadow read consistently and nothing clips or overlaps (the title-bar bleed trick in
   `PixelPanel` needs matching top-corner radius so a rounded panel's title strip doesn't overhang
   square corners past the rounded edge).

## Revisions from review (superseding §3–§6 above where they conflict)

Worked out interactively against a live style guide (`2026-09-18-ui-theme-refresh-styleguide.html`,
now at v3) — this section is the final state; the numbered sections above are kept for the
reasoning trail.

- **Shadow**: kept the *hard* offset (no blur) at the original 3px distance — only the corners
  round. Not softened to a blurred elevation shadow as §4 originally proposed.
- **New token — dedicated primary accent**: `--cth-primary` (`#4F68E8` light / `#7B93F5` dark),
  `--cth-primary-soft` (`#E5E9FC` light / `#232A4A` dark). Used for hover fills and primary
  buttons, replacing lemon in `.cth-settings-btn:hover`. Deliberately pulled toward blue and away
  from violet during review, because it initially sat too close to the existing `--cth-lilac`
  agent-identity hue — checked against the full accent set, not in isolation.
- **`PixelPanel` header**: the panel gets `overflow: hidden` as the single source of the rounded
  shape; the title strip is a plain rectangle clipped to it (not independently rounded — two
  separately-computed corner curves don't reliably align, which caused a visible seam in an
  earlier pass). Title fill is `cream-200` (same contrast the current version already has), now
  with a small status dot instead of the old full-bleed painted color block.
- **`active` variant**: replaced the old triple-layer painted border with a single 1.5px accent
  ring plus a ~5% accent tint on the fill itself — thin on purpose, so it doesn't compete with the
  hard offset shadow, which stays the dominant, bold move in this system.
- **Brand wordmark**: the one place that keeps the app's existing display face
  (`--cth-font-display`, "Press Start 2P") on purpose — everywhere else stays on the current
  Inter/JetBrains Mono pairing, untouched.
- **Chips**: a soft-tint pill pattern (borrowed from the Lumis-style reference), used for agent
  status in list/roster contexts.
- **Focus-visible**: explicitly unchanged — the app's existing keyboard-focus ring
  (`outline: 1px solid var(--cth-ink-300); outline-offset: 2px`) carries forward as-is.

## Post-implementation fix (found live in the running app)

The onboarding wizard (`OnboardingWizard.tsx`, `PixelPanel variant="dialog"`) surfaced a real bug the
style guide didn't catch: the title header used a hardcoded `--cth-cream-200` fill against the
dialog variant's `--cth-cream-50` body — near-white next to light-gray, close enough to look
unintentional, different enough to look broken. Fixed by making the header always match its own
panel's body fill exactly (`fillByVariant[variant]`, or the accent-light tint when `accent` is set)
instead of a fixed color — the divider line and status dot alone now signal "this is a header."
Applies to every variant, not just dialog, and removes an entire class of "two near-identical grays
touching" bugs rather than re-tuning one shade.

## Phase 2 (explicitly deferred, not part of this pass)

- **2D floor frame + grounding shadow.** Not the tileset or character sprites — those stay
  untouched, per direct instruction. The floor's *container* (currently a flat, square panel with
  the yellow-tinted background bleeding to its edge) would get the same rounded/hard-shadow
  treatment as the rest of the UI, plus a soft drop-shadow ellipse under each character sprite so
  they read as grounded rather than pasted on a flat plane. Touches the Pixi.js scene layer, not
  just CSS tokens, so it's scoped separately by the user's own choice.

## What this does *not* do

- Does not touch the six accent hues (coral/mint/sky/lemon/lilac/peach) or status colors.
- Does not add a design-tokens-driven radius to every one-off inline style outside `PixelPanel`
  (e.g., the handful of already-hardcoded `borderRadius: 2` / `50%` spots) — those are either
  circular avatars (correctly `50%`, left alone) or small close/icon buttons where `2px` already
  reads fine next to the new shadows; revisit only if it looks inconsistent after verification.
- Does not change the app's typeface pairing (Inter/JetBrains Mono) outside the one wordmark use.
- Does not change the 2D floor/character art or tileset — see Phase 2 above for the one adjacent
  piece (the frame/grounding shadow) that is deferred, not in-scope, for this pass.
- Does not change the pixel scrollbar.
