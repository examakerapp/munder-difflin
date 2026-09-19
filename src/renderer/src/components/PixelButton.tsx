import { CSSProperties, ReactNode, useState } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export interface PixelButtonProps {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
  title?: string;
  className?: string;
  /** Square, zero-padding mode for a single icon glyph — no label. Maps to
   *  design-system.html's `.btn-icon3d`, a distinct fixed-size component in
   *  the reference (not `.btn3d` at zero padding) — see its own sizing/border
   *  below. */
  iconOnly?: boolean;
  'aria-label'?: string;
  'aria-pressed'?: boolean;
  /** Powers the app's `.cth-tip` hover-tooltip CSS convention. */
  'data-tip'?: string;
}

// v0.6.0: rewritten as a literal port of design-system.html's `.btn3d` /
// `.btn-icon3d` — not a further tuning of the old approximation. Concretely:
//   - a REAL `border` (2px solid), not this app's usual inset-box-shadow
//     border technique
//   - a REAL vertical-only offset shadow (`0 LIPpx 0 <color>`) that collapses
//     to `0 0 0 <color>` on press while the button translates down by that
//     same LIP — the reference's exact "pressed sticker" mechanic. The
//     reference uses 4px; we run 3px (see LIP) because at 4 it read as a
//     second border rather than a raised edge.
//   - disabled = opacity 0.45 (0.4 for icon buttons) + border/shadow color
//     swapped to a neutral track tone, fill and text otherwise UNCHANGED —
//     the reference never tints disabled toward a pastel variant color, it
//     just fades the whole thing
// The reference has one button size; this component keeps three (sm/md/lg)
// because the app's dense chrome (tabs, roster mini-actions) genuinely needs
// smaller ones. `lg` is sized to match the reference's own padding/height
// exactly; sm/md scale down proportionally.
const heightBySize: Record<Size, number> = { sm: 24, md: 32, lg: 40 };
const padBySize: Record<Size, string> = { sm: '0 10px', md: '0 14px', lg: '0 20px' };
const iconSizeBySize: Record<Size, number> = { sm: 28, md: 34, lg: 40 };
const fontSizeBySize: Record<Size, number> = { sm: 12, md: 13, lg: 13.5 };

/** Neutral "track" tone a disabled button's border/shadow swap to — the
 *  reference's `--track` (a light divider fill), not this app's own accent
 *  border faded via opacity (which would still read as tinted). */
const DISABLED_LINE = 'var(--cth-ink-100)';
/** Depth of the solid offset "lip" under a button, in px, and therefore also
 *  the distance it travels on press so it lands flush. Text and icon buttons
 *  share it so the two can't drift apart. */
const LIP = 3;

export function PixelButton({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false,
  fullWidth = false,
  style,
  title,
  className,
  iconOnly = false,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  'data-tip': dataTip
}: PixelButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState(false);

  // Each variant's resting fill/text/border/lipColor, straight off
  // design-system.html's four `.btn3d.*` rules. `lipColor` is the shadow's
  // (and, pressed, the outline's) color — always the border's own color in
  // the reference, i.e. one accent drives both the ring and the "sticker".
  const palette = (() => {
    switch (variant) {
      case 'primary':
        // .btn3d.primary { background: var(--orange); color: var(--on-primary);
        //   border-color: var(--orange-dark); box-shadow: 0 4px 0 var(--orange-dark); }
        // .btn3d.primary:hover { filter: brightness(1.05); }
        return {
          fill: hover && !disabled ? 'color-mix(in srgb, var(--cth-primary) 95%, white)' : 'var(--cth-primary)',
          text: 'var(--cth-on-primary)',
          border: 'var(--cth-primary)',
          lip: 'color-mix(in srgb, var(--cth-primary) 65%, black)'
        };
      case 'secondary':
        // .btn3d.secondary { background: var(--panel); color: var(--ink);
        //   border-color: var(--orange-dark); box-shadow: 0 4px 0 var(--orange-dark); }
        // .btn3d.secondary:hover { background: var(--orange-100); }
        // Icon-only utility buttons (theme toggle, settings, focus mode) are a
        // separate component in the reference (`.btn-icon3d`, neutral
        // `--icon-line` border) — handled in the iconOnly branch below, not here.
        // v0.6.0: shadow ("lip") matches the border/ring color exactly, per
        // direct request — no darkened color-mix, unlike primary/destructive
        // below where the reference's own fill has no border-strength color
        // of its own to reuse.
        return {
          fill: hover && !disabled ? 'var(--cth-primary-soft)' : 'var(--cth-paper-100)',
          text: 'var(--cth-ink-900)',
          border: 'var(--cth-primary)',
          lip: 'var(--cth-primary)'
        };
      case 'ghost':
        // .btn3d.ghost { background: transparent; border-color: transparent;
        //   box-shadow: none; color: var(--muted); }
        // .btn3d.ghost:hover { background: var(--track); color: var(--ink); }
        return {
          fill: hover && !disabled ? 'var(--cth-cream-200)' : 'transparent',
          text: hover && !disabled ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
          border: 'transparent',
          lip: 'transparent'
        };
      case 'destructive':
        // .btn3d.destructive { background: var(--red); color: #fff;
        //   border-color: var(--red-dark); box-shadow: 0 4px 0 var(--red-dark); }
        return {
          fill: hover && !disabled ? 'color-mix(in srgb, var(--cth-coral) 95%, white)' : 'var(--cth-coral)',
          text: 'var(--cth-on-primary)',
          border: 'var(--cth-coral)',
          lip: 'color-mix(in srgb, var(--cth-coral) 65%, black)'
        };
    }
  })();

  // design-system.html's `.btn-icon3d`: a distinct component, not `.btn3d`
  // with no label — fixed square, neutral `--icon-line` border/shadow
  // regardless of `variant`, and its own smaller radius scale (chips/
  // mini-buttons, not buttons/cards).
  if (iconOnly) {
    const iconBorder = disabled ? DISABLED_LINE : 'var(--cth-ink-900)';
    const iconShadow = disabled ? DISABLED_LINE : 'var(--cth-ink-900)';
    const iconFill = disabled
      ? 'var(--cth-paper-100)'
      : pressed || hover
      ? 'var(--cth-cream-200)'
      : 'var(--cth-paper-100)';
    return (
      <button
        title={title}
        className={className ? `cth-btn3d ${className}` : 'cth-btn3d'}
        data-tip={dataTip}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        onClick={disabled ? undefined : onClick}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => { setPressed(false); setHover(false); }}
        onMouseEnter={() => setHover(true)}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          width: iconSizeBySize[size], height: iconSizeBySize[size],
          padding: 0,
          borderRadius: 'var(--cth-radius-sm)',
          background: iconFill,
          color: disabled ? 'var(--cth-ink-300)' : 'var(--cth-ink-900)',
          border: `2px solid ${iconBorder}`,
          boxShadow: pressed && !disabled ? `0 0 0 ${iconShadow}` : `0 ${LIP}px 0 ${iconShadow}`,
          transform: pressed && !disabled ? `translateY(${LIP}px)` : 'none',
          fontSize: 15,
          lineHeight: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          userSelect: 'none',
          transition: 'transform 80ms ease, box-shadow 80ms ease, background 120ms ease',
          ...style
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      title={title}
      className={className ? `cth-btn3d ${className}` : 'cth-btn3d'}
      data-tip={dataTip}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => { setPressed(false); setHover(false); }}
      onMouseEnter={() => setHover(true)}
      disabled={disabled}
      style={{
        // Centre content HERE rather than trusting each call site — see the
        // long-standing note this replaced: a bare-text button and an
        // icon+label button (both `inline-flex` children) baseline-align
        // differently, so fixing it once here beats fixing it per call site.
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        lineHeight: 1,
        flexShrink: 0,
        height: heightBySize[size],
        padding: padBySize[size],
        // v0.6.0: dialed back from radius-md, per direct request ("a little
        // bit less").
        borderRadius: 'var(--cth-radius-sm)',
        background: palette.fill,
        color: palette.text,
        border: `2px solid ${disabled ? DISABLED_LINE : palette.border}`,
        // The reference's exact mechanic: a solid VERTICAL offset ("sticker")
        // that collapses to flush + a matching translateY on press, rather
        // than this app's usual inset-ring technique.
        // v0.6.0: lip trimmed 4px -> 3px, per direct request ("a little bit
        // less weight on the bottom") — at 4px it read as a second border
        // rather than a raised edge. LIP is shared by the shadow and the press
        // transform on purpose: if they ever disagree the button stops landing
        // flush when pressed.
        boxShadow: disabled
          ? `0 ${LIP}px 0 ${DISABLED_LINE}`
          : pressed
          ? `0 0 0 ${palette.lip}`
          : `0 ${LIP}px 0 ${palette.lip}`,
        transform: pressed && !disabled ? `translateY(${LIP}px)` : 'none',
        fontFamily: 'var(--cth-font-ui)',
        fontSize: fontSizeBySize[size],
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.45 : 1,
        userSelect: 'none',
        // Height is fixed, so a label that wraps does not make the button
        // taller — every label here is a short phrase, so wrapping is always
        // a layout bug rather than wanted behaviour. Callers that genuinely
        // want a multi-line button can still override via `style`.
        whiteSpace: 'nowrap',
        transition: 'transform 80ms ease, box-shadow 80ms ease, background 120ms ease',
        ...style
      }}
    >
      {children}
    </button>
  );
}
