// Design tokens — single source of truth. Mirrors tokens.css for non-styled consumers (Pixi).
// Any change here must also update tokens.css.

export const colors = {
  // v0.6.0 Composer redesign: warm cream/paper neutrals, replacing the
  // v0.5.0 cool blue-gray family (mirrors tokens.css — keep both in sync).
  cream: {
    50: 0xf7f6f1,
    100: 0xeeefe9,
    200: 0xe7e6e0,
    300: 0xd8d5c9
  },
  paper: {
    100: 0xffffff,
    200: 0xfbfaf7
  },
  ink: {
    900: 0x151515,
    700: 0x43423d,
    500: 0x6b6a67,
    300: 0xa8a79f,
    100: 0xe7e6e0
  },
  // v0.5.0: fully replaced with picks from PostHog's published categorical
  // data-viz palette (mirrors tokens.css).
  accent: {
    coral: 0xf14f58,
    coralLight: 0xfde1e2,
    mint: 0x529a0a,
    mintLight: 0xe3f0d4,
    sky: 0x1d4aff,
    skyLight: 0xdde5ff,
    lemon: 0xe4a604,
    lemonLight: 0xfbebc7,
    lilac: 0xa56eff,
    lilacLight: 0xede3ff,
    peach: 0xfe729e,
    peachLight: 0xffe0ea
  },
  status: {
    idle: 0x9ca0aa,
    thinking: 0x1d4aff,
    working: 0xe4a604,
    blocked: 0xf14f58,
    success: 0x529a0a,
    ghost: 0xd5d8dd
  },
  world: {
    grassLight: 0xd4eab0,
    grassDark: 0xb5d589,
    woodLight: 0xe5c896,
    woodDark: 0xc9a66b,
    path: 0xe8d8b0,
    wall: 0x8b6f47
  }
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64
} as const;

export const type = {
  display: '"Press Start 2P", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace',
  ui: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace'
} as const;

export const tileSize = 32; // px — the world is built from 32×32 tiles

export type AccentColorName =
  | 'coral' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'peach';

export const accentByName: Record<AccentColorName, number> = {
  coral: colors.accent.coral,
  mint:  colors.accent.mint,
  sky:   colors.accent.sky,
  lemon: colors.accent.lemon,
  lilac: colors.accent.lilac,
  peach: colors.accent.peach
};

export const accentLightByName: Record<AccentColorName, number> = {
  coral: colors.accent.coralLight,
  mint:  colors.accent.mintLight,
  sky:   colors.accent.skyLight,
  lemon: colors.accent.lemonLight,
  lilac: colors.accent.lilacLight,
  peach: colors.accent.peachLight
};

// Convert 0xRRGGBB to "#RRGGBB"
export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}
