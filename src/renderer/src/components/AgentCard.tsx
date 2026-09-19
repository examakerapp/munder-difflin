import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge, StatusKind } from './PixelBadge';
import { useHasTerminalDraft } from './terminalPool';
import { SpritePortrait } from './SpritePortrait';
import { RealtimeMichaelToggle } from './RealtimeMichaelToggle';
import { CostHud } from '@/realtime/CostHud';
import { AccentColorName } from '@/design/tokens';
import { OfficeCharacterName } from '@/scene/office/cast';
import { AgentNameEditor } from './AgentNameEditor';

export interface AgentCardProps {
  name: string;
  character: OfficeCharacterName;
  accent: AccentColorName;
  status: StatusKind;
  /** This agent's pty, if it has one. Only used to notice that the USER has
   *  unsent text on its prompt — which holds the agent's queue, and otherwise
   *  looks identical to an idle agent with nothing to do. */
  ptyId?: string;
  project: string;
  action?: string;
  /** Context gauge: 0..8 segments filled (session context ÷ context limit). */
  progress?: number;
  /** Live context size (tokens) — shown in the gauge tooltip. */
  contextTokens?: number;
  /** Context-window limit (tokens) assumed for the agent's model. */
  contextLimit?: number;
  selected?: boolean;
  /** Your clone — gets a persistent accent frame + BOSS tag so it stands out.
   *  (`isGod` / the `god` agent id stay as-is internally; this is display only.) */
  isGod?: boolean;
  onClick?: () => void;
  /** Persists an inline display-name edit; identity and hive paths stay unchanged. */
  onRename?: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Number of ledger tasks this agent is actively DOING — rendered as a blue
   *  sticky note stuck to the card. Clicking it opens the first task's detail. */
  doingCount?: number;
  onTaskNoteClick?: () => void;
  draggable?: boolean; // must sit on the <button> itself — Chromium won't start a drag on an ancestor from inside a form control
  /** Private note — rendered as the card's own row (v0.3.4) so it can never
   *  cover the context gauge. First line only; full text in the tooltip. */
  note?: string;
  /** Opens the note editor (the strip owns the editing overlay). When set, the
   *  card shows a small ✎ affordance on its note row. */
  onEditNote?: () => void;
}

const fmtK = (n: number): string => `${Math.round(n / 1000)}k`;

/**
 * v0.3.4 compact redesign: one identity row (name + status), one context line
 * (action while working, repo while idle — both in the tooltip), one note row,
 * and a slim gauge pinned to the bottom edge. Nothing overlaps anything.
 */
export function AgentCard({
  name, character, accent, status, ptyId, project, action, progress = 0,
  contextTokens, contextLimit, selected, isGod, onClick, onRename,
  doingCount = 0, onTaskNoteClick, draggable, note, onEditNote
}: AgentCardProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const typing = useHasTerminalDraft(ptyId);
  // IDENTITY and SELECTION are two different things, and conflating them is why
  // selecting Michael appeared to do nothing.
  //
  // The card used to pass `isGod || selected` into PixelPanel's 'active' variant,
  // whose frame is `inset 1px + 3px accent + 5px ink` — five pixels of border in
  // the agent's OWN accent. Three problems in one: the selection cue changed
  // colour per agent (the "blue halo" on a sky agent), it was invisible on god
  // because god was framed unconditionally, and stacking the selection ring
  // outside it made the boss card visibly fatter than its neighbours.
  //
  // Now: god is marked by its SURFACE (see godSurface), everyone shares the same
  // 1px panel border, and selection is one accent-independent ring — identical on
  // every card, god included.

  // v0.5.0: replaced the outline-ring selection cue with a tinted SURFACE —
  // a filled primary-tinted background + a primary-colored border, the way
  // PostHog signals "selected" on a list item (no separate outline element
  // at all). Uses --cth-primary rather than an accent so the cue reads the
  // same on every agent regardless of its own color, same reasoning the old
  // ink-ring had. Wins over the god tint when both are true — selection is a
  // live, temporary state and should read as the dominant signal over the
  // permanent "this is the boss" marker.
  // v0.6.0: restored the inset ring alongside the offset shadow — a single
  // offset shadow with no ring (the previous v0.6.0 pass, chasing
  // design-system.html literally) left the card with NO visible outline at
  // rest, since this app draws its "border" as an inset box-shadow rather
  // than a real CSS border. Design-system.html's own card actually uses a
  // real `border: 2px solid var(--orange-dark)` in addition to its offset
  // shadow — this is that same two-part look, expressed the way every other
  // panel/button in this codebase already draws a border.
  const selectedSurface: React.CSSProperties = selected
    ? {
        background: 'var(--cth-primary-soft)',
        boxShadow: 'inset 0 0 0 2px var(--cth-primary), 3px 3px 0 0 var(--cth-primary)'
      }
    : {};

  // Context gauge as ONE clean fill (0..8 → 0..100%). Colour escalates as the
  // window fills: accent while comfortable, amber from 6/8, coral from 7/8.
  const pct = Math.min(8, Math.max(0, progress)) / 8 * 100;
  // v0.6.0: brand orange while comfortable (matches design-system.html's
  // `.progress-fill { background: var(--orange); }`, always-orange regardless
  // of the agent), escalating to coral/lemon as a semantic fill-level warning.
  const gaugeColor = progress >= 7 ? 'var(--cth-coral)'
    : progress >= 6 ? 'var(--cth-lemon)'
      : 'var(--cth-primary)';
  const gaugeTitle = contextTokens !== undefined && contextLimit
    ? t('agentCard.contextTitle', { used: fmtK(contextTokens), limit: fmtK(contextLimit), pct: Math.round((contextTokens / contextLimit) * 100) })
    : t('agentCard.contextGaugeTitle');

  // ONE card size for every agent. God used to be 216x86 against everyone
  // else's 196x76, so the dock never lined up — and once the selection ring was
  // added outside its 5px accent frame, the boss card grew a visibly thicker
  // edge than any other. Distinction now comes from the card's SURFACE, not from
  // making its box bigger or its border heavier.
  // 196 was too tight once god's row carried NAME + BOSS + status: the name
  // truncated to "MIC…" — the one word on the card that must never be the thing
  // that gets cut. Widened for every card so the dock stays uniform, with enough
  // slack that Talk's info mark (which only appears when the OpenAI key is
  // missing) has somewhere to sit rather than pushing the row apart.
  // Width bumped from the original 220 per direct request — everything else
  // in this file is restored exactly to the original open-source version.
  const width = 240;
  const height = 78;
  const lift = (isGod ? -2 : 0) - (hover ? 1 : 0) - (selected ? 1 : 0);
  /** God's distinction: a tinted surface plus a thin accent border all the way
   *  around — NOT the 3px rule that used to sit on the top edge alone. That rule
   *  read as a stray yellow bar rather than as part of the card, and an edge
   *  treatment that only exists on one side always looks like a mistake or a
   *  progress bar. Same 1px geometry as every other card, so the box is
   *  unchanged and the selection ring still means exactly one thing everywhere. */
  const godSurface: React.CSSProperties = isGod
    ? {
        background: `var(--cth-${accent}-light)`,
        boxShadow: `inset 0 0 0 1px var(--cth-${accent}), 2px 2px 0 0 var(--cth-${accent})`
      }
    : {};

  // v0.6.0: worker (non-god) cards tint green while actively working and
  // unselected — the god treatment above is untouched on direct request, so
  // this is scoped to `!isGod` only. Loses to `selectedSurface` below (same
  // "selection is the dominant live signal" rule godSurface already follows).
  // Idle stays whatever the card's plain default already is — no separate
  // "idle theme" needed there.
  const workingSurface: React.CSSProperties = (!isGod && !selected && status === 'working')
    ? {
        background: 'color-mix(in srgb, var(--cth-status-working) 10%, var(--cth-paper-100))',
        boxShadow: 'inset 0 0 0 1px var(--cth-status-working), 2px 2px 0 0 var(--cth-status-working)'
      }
    : {};
  // v0.5.x: this used to be a soft blurred rgba shadow on the outer wrapper.
  // PixelPanel now draws its own flat, un-blurred, border-colored offset
  // shadow on every card automatically (see PixelPanel.tsx) — keeping a
  // second, blurred shadow on top of that would mix the two shadow
  // languages design-system.html explicitly treats as incompatible
  // ("never a soft/blurred shadow"). The wrapper contributes no shadow of
  // its own now; elevation comes from PixelPanel alone.
  const outerShadow = 'none';

  // One context line: what it's DOING while working, WHERE it lives while idle.
  const infoLine = (status !== 'idle' && action) ? action : project;
  const noteFirstLine = (note ?? '').split('\n').find((l) => l.trim()) ?? '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      // The ring is the visual answer to "which terminal is open"; this is the
      // same answer for a screen reader. Matches SidebarRow in fullscreen.
      aria-current={selected ? 'true' : undefined}
      className="cth-titlebar-nodrag"
      style={{
        width, minWidth: width, height,
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        position: 'relative',
        transform: lift ? `translateY(${lift}px)` : 'none',
        boxShadow: outerShadow,
        transition: 'transform 90ms steps(2, end), box-shadow 90ms steps(2, end)'
      }}
    >
      {/* v0.6.0: design-system.html's `.selected-check` — a corner ribbon with a
          checkmark, the one selection cue the tinted-surface treatment above
          didn't carry over. Moved to the top-left per direct request; cut
          corner mirrored to bottom-right so it still hugs the card's actual
          corner (top-left of the ribbon stays sharp against the card edge). */}
      {selected && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -2, left: -2, zIndex: 2,
            width: 20, height: 20,
            background: 'var(--cth-primary)',
            boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--cth-primary) 65%, black)',
            borderRadius: '0 0 6px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.5}>
            <path d="M3 8l3.5 3.5L13 4.5" />
          </svg>
        </span>
      )}
      {/* The taken note, stuck to the card like on the desk: this worker is
          actively DOING a ledger task. Click → the task's detail overlay. */}
      {doingCount > 0 && (
        <span
          title={doingCount === 1
            ? t('agentCard.doingTasks', { count: doingCount })
            : t('agentCard.doingTasksPlural', { count: doingCount })}
          onClick={(e) => { e.stopPropagation(); onTaskNoteClick?.(); }}
          style={{
            position: 'absolute', right: -4, bottom: -5, zIndex: 2,
            width: 20, height: 18,
            background: 'var(--cth-sky)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300), 1px 2px 0 rgba(26,19,32,0.18)',
            transform: 'rotate(4deg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--cth-font-display)', fontSize: 11, color: 'var(--cth-ink-900)',
            cursor: 'pointer'
          }}
        >
          {doingCount > 1 ? doingCount : '✎'}
        </span>
      )}
      <PixelPanel
        variant="default"
        // v0.6.0: extra bottom padding makes room for the gauge, which now
        // sits OUTSIDE the content flow as an absolutely-positioned strip
        // flush with the card's bottom edge (design-system.html's
        // `.progress-track`), instead of taking its own row inside the
        // padded column — frees vertical space for the rest of the card.
        style={{ height: '100%', padding: '6px 8px 10px', position: 'relative', ...godSurface, ...workingSurface, ...selectedSurface }}
        noPadding
      >
        <div style={{ display: 'flex', gap: 8, height: '100%' }}>
          {/* Portrait tile — vertically centred so the card reads calm and even. */}
          <div style={{
            width: 36, height: isGod ? 50 : 46, alignSelf: 'center',
            // God's CARD is now accent-light, so the tile cannot be — it would
            // vanish into its own background. Paper reads as an inset frame
            // against the tint, which is what the tile is meant to look like.
            background: isGod ? 'var(--cth-paper-100)' : `var(--cth-${accent}-light)`,
            boxShadow: `inset 0 0 0 1px var(--cth-ink-${isGod ? '300' : '100'}), 2px 2px 0 0 var(--cth-ink-${isGod ? '300' : '100'})`,
            // Anchor the sprite's TOP: the 56px-tall portrait overflows this
            // tile, and bottom-anchoring cropped the head — crop feet, not face.
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden',
            flexShrink: 0
          }}>
            <SpritePortrait character={character} scale={2} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Identity row: name (+ BOSS tag) + status. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                {onRename ? (
                  <AgentNameEditor name={name} onCommit={onRename} uppercase />
                ) : (
                  // v0.6.0: agent names keep the pixel face on direct request —
                  // --cth-font-display now resolves to the UI font everywhere
                  // else, so this reaches the literal pixel stack
                  // (--cth-font-pixel) instead, at the size that face was
                  // originally tuned for (8px reads fine on Press Start 2P;
                  // 11px was the bump for a real sans-serif).
                  <span style={{
                    fontFamily: 'var(--cth-font-pixel)',
                    fontSize: 8,
                    lineHeight: '12px',
                    color: 'var(--cth-ink-900)',
                    flex: 1, minWidth: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{name.toUpperCase()}</span>
                )}
                {isGod && (
                  // Pixel face restored alongside the name (v0.6.0) — the two
                  // sit right next to each other, so they stay on the same font.
                  <span style={{
                    fontFamily: 'var(--cth-font-pixel)', fontSize: 7, lineHeight: '18px', fontWeight: 700,
                    // v0.6.0: brand orange role pill (design-system.html's
                    // `.pill.role`), white text for contrast against the
                    // saturated orange fill (not the agent's own accent).
                    background: 'var(--cth-primary)', color: 'var(--cth-on-primary)',
                    // Symmetric, same as PixelBadge — see the note there. Still
                    // 1+18+1 = 20px, which is the box height this pill is
                    // matched to the status chip on.
                    padding: '1px 8px', flexShrink: 0
                  }}>{t('agentCard.boss')}</span>
                )}
              </span>
              {/* flexShrink:0 — the badge is a fixed 2-to-5 character chip; when
                  it was allowed to shrink, the browser resolved the overflow by
                  eating the NAME instead. Truncation should land on the longest,
                  most redundant thing, not on the identity. */}
              <PixelBadge status={typing ? 'typing' : status} style={{ flexShrink: 0 }} />
            </div>

            {/* Context line: action while working, repo while idle. */}
            <div
              title={`${project}${action && status !== 'idle' ? ` — ${action}` : ''}`}
              style={{
                fontSize: 11, lineHeight: '14px',
                color: 'var(--cth-ink-500)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}
            >{infoLine}</div>

            {/* God: voice on its own compact row. Workers: the private note row.
                Both sit ABOVE the gauge, so it is never covered. */}
            {isGod ? (
              // Talk grows an info mark when the OpenAI key is missing, so this
              // row can hold three things instead of two. `overflow: hidden` is
              // the guard: the toggle's label shrinks first (it has minWidth:0),
              // and if it still does not fit, the row clips INSIDE the card
              // instead of spilling over its border.
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  minWidth: 0, overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <RealtimeMichaelToggle />
                <CostHud compact />
              </div>
            ) : (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, minHeight: 14 }}
              >
                {noteFirstLine ? (
                  <span
                    title={note}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: '14px',
                      color: 'var(--cth-ink-500)', fontStyle: 'italic',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}
                  >{noteFirstLine}</span>
                ) : <span style={{ flex: 1 }} />}
                {onEditNote && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onEditNote(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onEditNote(); }
                    }}
                    title={note ? t('agentCard.editNote') : t('agentCard.addNote')}
                    aria-label={t('agentCard.editNoteAria', { name })}
                    style={{
                      flexShrink: 0, width: 15, height: 14,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, lineHeight: 1, cursor: 'pointer',
                      // Quiet until the card is hovered — discoverable, not noisy.
                      color: hover ? 'var(--cth-ink-500)' : 'var(--cth-ink-300)'
                    }}
                  >✎</span>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Context gauge — flush with the card's bottom edge, outside the
            padded content column entirely (design-system.html's
            `.progress-track`). PixelPanel's own overflow:hidden clips it to
            the card's rounded corners. */}
        <div
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'var(--cth-cream-200)' }}
          title={gaugeTitle}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: gaugeColor }} />
        </div>
      </PixelPanel>
    </div>
  );
}
