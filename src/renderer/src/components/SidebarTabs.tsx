import { useTranslation } from 'react-i18next';
import { type SidebarTab } from '@/store/store';
import { type AccentColorName } from '@/design/tokens';
import { Icon, type IconName } from './Icon';

// v0.3.4: the files tab is gone — the per-agent IDE button (header) opens the
// full Monaco editor + file tree, which superseded the read-only browser.
const TABS: { key: SidebarTab; labelKey: string; icon: IconName }[] = [
  { key: 'terminal', labelKey: 'sidebar.terminal', icon: 'terminal' },
  { key: 'git',      labelKey: 'sidebar.git',      icon: 'code' },
  { key: 'messages', labelKey: 'sidebar.messages', icon: 'bell' },
  { key: 'traces',   labelKey: 'sidebar.traces',   icon: 'web' }
];

export interface SidebarTabsProps {
  current: SidebarTab;
  accent: AccentColorName;
  onChange: (tab: SidebarTab) => void;
}

export function SidebarTabs({ current, accent, onChange }: SidebarTabsProps) {
  const { t } = useTranslation();
  return (
    // v0.6.0: rounded pills instead of hard-edged, full-bleed segments with a
    // bottom underline — matches the Composer tab-bar treatment used in
    // CommandCenterPanel. Plain UI font replaces the retro pixel display face
    // (same reasoning PixelPanel titles already follow: a clean, legible
    // reading here, the pixel face stays a deliberate personality choice
    // elsewhere).
    <div style={{
      display: 'flex',
      gap: 4,
      padding: 6,
      background: 'var(--cth-cream-200)',
      flexShrink: 0
    }}>
      {TABS.map(tab => {
        const active = current === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flex: 1,
              height: 30,
              padding: '0 10px',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--cth-radius-pill)',
              // v0.6.0: brand orange for the active tab, not the agent's own
              // accent — matches the mockup's single-accent nav treatment.
              background: active ? 'var(--cth-primary)' : 'var(--cth-cream-100)',
              boxShadow: active
                ? 'inset 0 0 0 1px var(--cth-ink-300)'
                : 'inset 0 0 0 1px var(--cth-ink-100)',
              fontFamily: 'var(--cth-font-ui)',
              fontSize: 12,
              fontWeight: 600,
              color: active ? 'var(--cth-on-primary)' : 'var(--cth-ink-700)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <Icon name={tab.icon} /> {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
