import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { useRtl } from '@/i18n/useDirection';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';

/**
 * The floor's conversation, as a chat room.
 *
 * Two shapes, one component:
 *   <HiveChat />              on the god's command center — every exchange the
 *                             god is party to, across all agents
 *   <HiveChat peerId={id} />  on one agent's panel — just that agent's thread
 *                             with the god, so you don't have to switch back
 *                             to the god to read it
 *
 * The data is real and structured: agents exchange JSON messages through the
 * main-process hive bus, so this is not scraped out of terminal output.
 * `hiveMessages` is the right read path (deduped across mailboxes, archived
 * copies included, bodies redacted main-side) — ThreadsPanel's `hiveInbox`
 * shows only what an agent RECEIVED, which reads as half a conversation.
 */

// Derive the row shape from the preload API rather than importing across the
// project boundary — window.cth is globally typed.
type VoiceMessage = Awaited<ReturnType<Window['cth']['hiveMessages']>>[number];

/** The god's routing address is the literal string 'god' (see useHive GOD_ID). */
const GOD_ID = 'god';
/** Senders that are not agents and so have no roster entry to look up. */
const PSEUDO = new Set([GOD_ID, 'human', 'system', 'broadcast']);

const ACT_COLOR: Record<string, string> = {
  request: 'var(--cth-peach)', inform: 'var(--cth-sky)', propose: 'var(--cth-lilac)',
  query: 'var(--cth-lemon)', agree: 'var(--cth-mint)', refuse: 'var(--cth-coral)', done: 'var(--cth-mint)'
};

/** How many messages to pull. The main-side ceiling is 500. */
const SCROLLBACK = 400;
/** Safety-net poll only. `hive:message` fires on every routed message, so that
 *  push is what keeps this current; polling exists for the cases it can't
 *  cover (a message written while this view was unmounted, a missed event).
 *  It is deliberately slow: the floor-wide read walks EVERY agent's inbox,
 *  outbox and both archive folders, so a 3s poll — what the older per-agent
 *  panels use against the much cheaper single-mailbox read — would put a full
 *  mailbox scan on a 3-second loop for the whole floor. */
const POLL_MS = 15_000;
/** Collapse a burst of routed messages into one reload. */
const PUSH_DEBOUNCE_MS = 250;

function relTime(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (!isFinite(ts)) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export interface HiveChatProps {
  /** Omit for the god's floor-wide view; set to scope to one agent's thread. */
  peerId?: string;
}

export function HiveChat({ peerId }: HiveChatProps) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const agents = useStore((s) => s.agents);
  const [raw, setRaw] = useState<VoiceMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [who, setWho] = useState<string | null>(null);      // filter chip (god view)
  const [conversation, setConversation] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const godId = useMemo(() => agents.find((a) => a.isGod)?.id ?? GOD_ID, [agents]);

  // Name/accent for any party, including the pseudo-senders that have no
  // roster row ('human', 'system', 'broadcast').
  const identity = useCallback((id: string): { name: string; accent: string } => {
    const a = agents.find((x) => x.id === id);
    if (a) return { name: a.name, accent: `var(--cth-${a.accent})` };
    if (id === GOD_ID) {
      const g = agents.find((x) => x.isGod);
      return { name: g?.name ?? t('hiveChat.orchestrator'), accent: g ? `var(--cth-${g.accent})` : 'var(--cth-primary)' };
    }
    if (id === 'human') return { name: t('hiveChat.you'), accent: 'var(--cth-primary)' };
    if (id === 'broadcast') return { name: t('hiveChat.everyone'), accent: 'var(--cth-ink-500)' };
    return { name: id || t('hiveChat.unknown'), accent: 'var(--cth-ink-500)' };
  }, [agents, t]);

  // Guards every setState in the async load against a resolve-after-unmount.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await window.cth.hiveMessages(
        peerId ? { agentId: peerId, limit: SCROLLBACK } : { limit: SCROLLBACK }
      );
      if (aliveRef.current) setRaw(rows);
    } catch {
      // The bus may not be up yet on a cold start; the poll retries.
    } finally {
      if (aliveRef.current) setLoaded(true);
    }
  }, [peerId]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    // Live nudge. The routed-message event carries no body, so it triggers a
    // reload rather than appending a row. Debounced: a fan-out to several
    // agents fires this once per recipient, and each reload is a full walk.
    let burst: ReturnType<typeof setTimeout> | undefined;
    const off = window.cth.onHiveMessage?.(() => {
      clearTimeout(burst);
      burst = setTimeout(() => { void load(); }, PUSH_DEBOUNCE_MS);
    });
    return () => { clearInterval(poll); clearTimeout(burst); off?.(); };
  }, [load]);

  // Re-render relative timestamps without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /** Chronological, oldest first — hiveMessages returns newest first. */
  const conversationRows = useMemo(() => {
    const isParty = (m: VoiceMessage, id: string) => m.from === id || m.to === id;
    const godParty = (m: VoiceMessage) => isParty(m, GOD_ID) || isParty(m, godId);
    const rows = raw.filter((m) => {
      if (!peerId) return godParty(m) || m.to === 'broadcast';
      // One agent's thread with the god: both ends must be that pair, plus any
      // broadcast the god sent, which this agent also received.
      const peerParty = isParty(m, peerId);
      return (peerParty && godParty(m)) || (godParty(m) && m.to === 'broadcast');
    });
    return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }, [raw, peerId, godId]);

  /** Agents that actually appear, for the filter chips. */
  const parties = useMemo(() => {
    const seen = new Set<string>();
    for (const m of conversationRows) {
      for (const id of [m.from, m.to]) {
        if (id && id !== GOD_ID && id !== godId && !PSEUDO.has(id)) seen.add(id);
      }
    }
    return [...seen];
  }, [conversationRows, godId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversationRows.filter((m) => {
      if (who && m.from !== who && m.to !== who) return false;
      if (conversation && m.conversation !== conversation) return false;
      if (q && !`${m.subject} ${m.body} ${m.from} ${m.to}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conversationRows, who, conversation, query]);

  // Stick to the bottom like a chat window, but only when the reader is
  // already there — yanking the viewport while they scroll back is the single
  // most annoying thing a live feed can do.
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      // On an agent's panel the message goes to that agent; on the god's
      // floor-wide view it goes to the god, who routes it onward.
      const res = await window.cth.hiveSend(
        {
          to: peerId && peerId !== godId ? peerId : GOD_ID,
          act: 'inform',
          subject: body.slice(0, 60),
          body,
          // Replying inside a filtered thread keeps it in that thread; main
          // mints a fresh conversation id when this is omitted.
          ...(conversation ? { conversation } : {})
        },
        'human'
      );
      // hiveSend resolves with { ok, error } rather than throwing on a routing
      // failure — swallowing that would silently drop the message.
      if (!res?.ok) {
        setError(res?.error || t('hiveChat.sendFailed'));
        return;                       // keep the draft so nothing typed is lost
      }
      setDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('hiveChat.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const filtered = !!who || !!conversation || !!query.trim();

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-200)' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '8px 10px', borderBottom: '1px solid var(--cth-ink-100)', flexShrink: 0
      }}>
        {!peerId && (
          <>
            <Chip active={!who} onClick={() => setWho(null)}>{t('hiveChat.all')}</Chip>
            {parties.map((id) => {
              const { name, accent } = identity(id);
              return (
                <Chip key={id} active={who === id} accent={accent} onClick={() => setWho(who === id ? null : id)}>
                  {name}
                </Chip>
              );
            })}
          </>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('hiveChat.search')}
          dir={rtl ? 'auto' : undefined}
          style={{
            marginInlineStart: 'auto', minWidth: 120, flex: '0 1 200px',
            padding: '4px 8px', background: 'var(--cth-paper-100)', border: 'none',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-pill)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-900)', outline: 'none'
          }}
        />
        {filtered && (
          <PixelButton size="sm" variant="ghost" onClick={() => { setWho(null); setConversation(null); setQuery(''); }}>
            {t('hiveChat.clear')}
          </PixelButton>
        )}
      </div>

      {conversation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
          background: 'var(--cth-primary-soft)', borderBottom: '1px solid var(--cth-ink-100)',
          fontSize: 11, color: 'var(--cth-ink-700)', flexShrink: 0
        }}>
          <Icon name="web" />
          {t('hiveChat.oneThread')}
        </div>
      )}

      {/* Feed */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {!loaded && <Note>{t('hiveChat.loading')}</Note>}
        {loaded && visible.length === 0 && (
          <Note>{filtered ? t('hiveChat.noMatches') : t('hiveChat.empty')}</Note>
        )}
        {visible.map((m, i) => {
          const mine = m.from === GOD_ID || m.from === godId || m.from === 'human';
          const prev = visible[i - 1];
          const grouped = !!prev && prev.from === m.from && prev.conversation === m.conversation;
          return (
            <Bubble
              key={`${m.id}-${m.owner}-${m.direction}`}
              msg={m}
              mine={mine}
              grouped={grouped}
              now={now}
              rtl={rtl}
              identity={identity}
              onPickConversation={() => setConversation(m.conversation)}
              t={t}
            />
          );
        })}
      </div>

      {/* Composer */}
      {error && (
        <div role="alert" style={{
          padding: '6px 10px', flexShrink: 0, borderTop: '1px solid var(--cth-ink-100)',
          background: 'var(--cth-primary-soft)', fontSize: 11, color: 'var(--cth-danger-text)'
        }}>{error}</div>
      )}
      <div style={{
        display: 'flex', gap: 6, padding: 8, flexShrink: 0,
        borderTop: '1px solid var(--cth-ink-100)', background: 'var(--cth-cream-50)'
      }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={t('hiveChat.composerPlaceholder', { name: identity(peerId && peerId !== godId ? peerId : GOD_ID).name })}
          dir={rtl ? 'auto' : undefined}
          style={{
            flex: 1, padding: '7px 10px', background: 'var(--cth-paper-100)', border: 'none',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-sm)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)', outline: 'none'
          }}
        />
        <PixelButton size="sm" variant="primary" disabled={!draft.trim() || sending} onClick={() => void send()}>
          {sending ? t('hiveChat.sending') : t('hiveChat.send')}
        </PixelButton>
      </div>
    </div>
  );
}

function Bubble({
  msg, mine, grouped, now, rtl, identity, onPickConversation, t
}: {
  msg: VoiceMessage;
  mine: boolean;
  grouped: boolean;
  now: number;
  rtl: boolean;
  identity: (id: string) => { name: string; accent: string };
  onPickConversation: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const [open, setOpen] = useState(false);
  const from = identity(msg.from);
  const to = identity(msg.to);
  const body = msg.body ?? '';
  const long = body.length > 320;
  const shown = open || !long ? body : `${body.slice(0, 320)}…`;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: mine ? 'flex-end' : 'flex-start',
      marginTop: grouped ? -4 : 0
    }}>
      {!grouped && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
          flexDirection: mine ? 'row-reverse' : 'row'
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: from.accent, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-900)' }}>{from.name}</span>
          <span style={{ fontSize: 11, color: 'var(--cth-ink-300)' }}>
            {t('hiveChat.to', { name: to.name })}
          </span>
          <span style={{ fontSize: 11, color: 'var(--cth-ink-300)' }}>{relTime(msg.created_at, now)}</span>
        </div>
      )}
      <div style={{
        maxWidth: '82%', padding: '7px 10px', borderRadius: 'var(--cth-radius-md)',
        background: mine ? 'var(--cth-primary-soft)' : 'var(--cth-paper-100)',
        boxShadow: `inset 0 0 0 1px ${msg.requires_reply ? 'var(--cth-primary)' : 'var(--cth-ink-100)'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: body ? 4 : 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 'var(--cth-radius-pill)',
            background: ACT_COLOR[msg.act] ?? 'var(--cth-ink-300)', color: 'var(--cth-on-primary)'
          }}>{msg.act}</span>
          {msg.subject && (
            <span dir={rtl ? 'auto' : undefined} style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
              {msg.subject}
            </span>
          )}
          {msg.requires_reply && (
            <span style={{ fontSize: 10, color: 'var(--cth-primary)', fontWeight: 500 }}>
              {t('hiveChat.needsReply')}
            </span>
          )}
        </div>
        {body && (
          <div dir={rtl ? 'auto' : undefined} style={{
            fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word'
          }}>{shown}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {long && (
            <button onClick={() => setOpen(!open)} style={linkStyle}>
              {open ? t('hiveChat.less') : t('hiveChat.more')}
            </button>
          )}
          <button onClick={onPickConversation} style={linkStyle} title={msg.conversation}>
            {t('hiveChat.viewThread')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Underlined so they read as links rather than as loose label text — they sit
// directly under a message body, where an unadorned grey word is easy to miss.
const linkStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-500)',
  textDecoration: 'underline', textUnderlineOffset: 2
};

function Chip({ active, accent, onClick, children }: {
  active: boolean; accent?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 10px', border: 'none', cursor: 'pointer',
        borderRadius: 'var(--cth-radius-pill)',
        background: active ? 'var(--cth-primary)' : 'var(--cth-cream-200)',
        boxShadow: `inset 0 0 0 1px ${active ? 'var(--cth-ink-300)' : 'var(--cth-ink-100)'}`,
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500,
        color: active ? 'var(--cth-on-primary)' : 'var(--cth-ink-700)'
      }}
    >
      {accent && <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 'auto', textAlign: 'center', fontSize: 12, color: 'var(--cth-ink-300)', padding: 16 }}>
      {children}
    </div>
  );
}
