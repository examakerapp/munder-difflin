import { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { AccentColorName } from '@/design/tokens';

type Variant = 'default' | 'inset' | 'active' | 'terminal' | 'dialog' | 'alert';

export interface PixelPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> {
  variant?: Variant;
  title?: string;
  accent?: AccentColorName;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  noPadding?: boolean;
}

const borderByVariant: Record<Variant, string> = {
  default:  'var(--cth-panel-border)',
  inset:    'var(--cth-panel-border-inset)',
  active:   'var(--cth-panel-border)',  // accent overlay added separately
  terminal: 'var(--cth-panel-border-terminal)',
  dialog:   'var(--cth-panel-border-dialog)',
  // v0.6.0: promoted from a one-off in BlockedBanner.tsx (the "needs you"
  // banner) — a thicker coral inset on top of the usual ink ring, so an
  // alert reads as more urgent than a regular panel.
  alert:    'inset 0 0 0 1.5px var(--cth-ink-500), inset 0 0 0 4px var(--cth-coral)'
};

const fillByVariant: Record<Variant, string> = {
  default:  'var(--cth-paper-100)',
  inset:    'var(--cth-cream-200)',
  active:   'var(--cth-paper-100)',
  terminal: 'var(--cth-paper-100)',
  dialog:   'var(--cth-paper-100)',
  alert:    'var(--cth-coral-light)'
};

// v0.5.x: the shadow-heavy 3D look from design-system.html, brought in on
// explicit request — a flat OFFSET shadow (no blur), always the SAME color
// as the panel's own border ring, so the outline and the "lip" beneath it
// read as one continuous extruded shape rather than two mismatched layers.
// Reuses each variant's existing border token's color, just restated as a
// solid fill instead of an inset ring.
const shadowColorByVariant: Record<Variant, string> = {
  default:  'var(--cth-ink-300)',
  inset:    'var(--cth-ink-100)',
  active:   'var(--cth-ink-300)',
  terminal: 'var(--cth-ink-300)',
  dialog:   'var(--cth-ink-500)',
  alert:    'var(--cth-coral)'
};

// v0.4.7: one shared radius scale (docs/superpowers/specs/2026-09-18-ui-theme-refresh-design.md)
const radiusByVariant: Record<Variant, string> = {
  default:  'var(--cth-radius-md)',
  inset:    'var(--cth-radius-sm)',
  active:   'var(--cth-radius-md)',
  terminal: 'var(--cth-radius-md)',
  dialog:   'var(--cth-radius-lg)',
  alert:    'var(--cth-radius-md)'
};

// v0.5.0 had gone fully flat here ("PostHog's flat design... let's not use
// shadows for consistency") — v0.5.x brings a flat offset shadow back on
// explicit request, matching design-system.html's card elevation. Kept
// SOLID and un-blurred (never a soft/blurred shadow) and always the same
// color as the border ring (see shadowColorByVariant above), which is what
// keeps this from reading as the "AI-generated drop shadow" look — a real
// extruded edge, not a glow.
export function PixelPanel({
  variant = 'default',
  title,
  accent,
  children,
  style,
  className,
  noPadding = false,
  ...rest
}: PixelPanelProps) {
  // Deliberately NOT display:flex here — this container is used across many
  // call sites that rely on normal block stacking for their children (and
  // many that already pass their own display override via `style`, which
  // still wins). Changing the container's layout mode by default is exactly
  // the kind of change that can't be verified without reviewing every call
  // site, so the title-to-content gap lives on the title element instead.
  const baseStyle: CSSProperties = {
    background: fillByVariant[variant],
    boxShadow: `${borderByVariant[variant]}, 3px 3px 0 0 ${shadowColorByVariant[variant]}`,
    borderRadius: radiusByVariant[variant],
    // Re-added: without this, a flush-edge child (e.g. AgentCard's bottom
    // context gauge) keeps its own square corners and visibly overhangs the
    // panel's now-rounded ones — confirmed as a real regression from when
    // overflow:hidden was dropped here (it used to exist only for the old
    // full-bleed header strip, which is gone, but plenty of other content
    // still needs clipping to the rounded box).
    overflow: 'hidden',
    padding: noPadding ? 0 : 'var(--cth-space-4)',
    position: 'relative',
    ...style
  };

  // Active/selected: a thin all-around accent ring plus a faint tint on the
  // fill — never a colored left-border stripe (a recognizable AI-generated-
  // design tell). The offset shadow now matches the accent too, same
  // border=shadow rule as every other variant, so "selected" reads as a
  // deeper extrusion, not a different visual language.
  if (variant === 'active' && accent) {
    baseStyle.background = `color-mix(in srgb, var(--cth-${accent}) 4%, var(--cth-paper-100))`;
    baseStyle.boxShadow = `inset 0 0 0 1px var(--cth-${accent}), 3px 3px 0 0 var(--cth-${accent})`;
  }

  return (
    <div className={className} style={baseStyle} {...rest}>
      {title && (
        // v0.6.0: pixel face restored on direct request ("use the pixel font
        // for all modal title headings") — with a thin rule under just the
        // text, never a full-bleed painted strip. No decorative dot: the
        // rule alone signals "this is a header," the same way it does for
        // every variant instead of needing a different treatment per case.
        <div
          style={{
            color: accent ? `var(--cth-${accent})` : 'var(--cth-ink-900)',
            fontFamily: 'var(--cth-font-pixel)',
            fontSize: 11,
            lineHeight: '16px',
            // v0.6.0: the title used to get NO horizontal/top inset of its own
            // when the panel is `noPadding` (the common case for a modal that
            // wants custom body spacing) — it sat flush against the panel's
            // own edges, so the rounded top corners clipped straight through
            // the text ("glitching into the corner radius"). Giving the
            // title its own padding when the panel has none fixes every
            // PixelPanel `title` usage at once, not just the modals it was
            // reported on.
            padding: noPadding
              ? 'var(--cth-space-3) var(--cth-space-4) var(--cth-space-2)'
              : '0 0 var(--cth-space-2)',
            marginBottom: noPadding ? 0 : 'var(--cth-space-3)',
            borderBottom: `1px solid ${accent ? `color-mix(in srgb, var(--cth-${accent}) 30%, transparent)` : 'var(--cth-ink-100)'}`
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
