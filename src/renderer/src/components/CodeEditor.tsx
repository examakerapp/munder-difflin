import { useEffect, useMemo, useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { yaml } from '@codemirror/lang-yaml';
import { Icon } from './Icon';
import { PixelButton } from './PixelButton';

// ─── Theme matching CTH palette ─────────────────────────────────────────────
// v0.6.0: re-stated to match the current Composer warm-cream/orange tokens
// (tokens.css --cth-paper-100/--cth-ink-900/etc.) — this was still on the old
// v0.5.0 cool blue-gray palette, the same drift PtyTerminalView.tsx keeps
// hitting. CodeMirror's theme object is built once from literal values (it
// can't read CSS custom properties at definition time), so these are
// restated hex, not a token reference. Still light-only ({ dark: false }
// below) — a pre-existing choice, not something this pass changes; making it
// follow the app's dark toggle would need a reconfigurable Compartment, a
// bigger change than a color fix.
const cthEditorTheme = EditorView.theme({
  '&': {
    background: '#FFFFFF',       // --cth-paper-100
    color: '#151515',            // --cth-ink-900
    height: '100%',
    fontFamily: 'var(--cth-font-mono)',
    fontSize: '14px'
  },
  '.cm-content': { caretColor: '#F14F58', padding: '8px 0' },          // --cth-coral
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#F14F58', borderLeftWidth: '2px' },
  '.cm-scroller': { fontFamily: 'inherit', overflow: 'auto' },
  '.cm-gutters': {
    background: '#EEEFE9',       // --cth-cream-100
    color: '#6B6A67',            // --cth-ink-500
    borderRight: '1px solid #E7E6E0' // --cth-ink-100
  },
  '.cm-activeLineGutter': { background: '#FBEBC7' },  // --cth-lemon-light
  '.cm-activeLine': { background: 'rgba(228, 166, 4, 0.10)' }, // --cth-lemon, low alpha
  '.cm-selectionBackground, ::selection': { background: '#FBEBC7 !important' },
  '.cm-searchMatch': { background: '#DDE5FF', outline: '1px solid #151515' }, // --cth-sky-light / --cth-ink-900
  '.cm-searchMatch.cm-searchMatch-selected': { background: '#E4A604' } // --cth-lemon
}, { dark: false });

const cthSyntax = HighlightStyle.define([
  { tag: tags.keyword,        color: '#A56EFF' }, // --cth-lilac
  { tag: tags.operator,       color: '#6B6A67' }, // --cth-ink-500
  { tag: [tags.string, tags.regexp], color: '#529A0A' }, // --cth-mint
  { tag: [tags.number, tags.bool, tags.null], color: '#F14F58' }, // --cth-coral
  { tag: tags.comment,        color: '#6B6A67', fontStyle: 'italic' }, // --cth-ink-500
  { tag: tags.variableName,   color: '#151515' }, // --cth-ink-900
  { tag: tags.function(tags.variableName), color: '#F54E01' }, // --cth-primary
  { tag: [tags.typeName, tags.className], color: '#1D4AFF' }, // --cth-sky
  { tag: tags.propertyName,   color: '#43423D' }, // --cth-ink-700
  { tag: tags.heading,        color: '#151515', fontWeight: 'bold' as any }, // --cth-ink-900
  { tag: tags.link,           color: '#1D4AFF', textDecoration: 'underline' as any }, // --cth-sky
  { tag: tags.meta,           color: '#6B6A67' } // --cth-ink-500
]);

function extensionsFor(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx'].includes(ext)) return [javascript({ jsx: true, typescript: true })];
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return [javascript({ jsx: ext.endsWith('x') })];
  if (ext === 'json') return [json()];
  if (['md', 'markdown'].includes(ext)) return [markdown()];
  if (ext === 'py') return [python()];
  if (['html', 'htm'].includes(ext)) return [html()];
  if (ext === 'css') return [css()];
  if (['yml', 'yaml'].includes(ext)) return [yaml()];
  return [];
}

export interface CodeEditorProps {
  root: string;
  /** Relative file path within `root` */
  filePath: string | null;
  /** Escalate this file into the IDE. The sidebar editor is deliberately
   *  small; the IDE is where tabs, the tree, git, and markdown preview live. */
  onOpenInIde?: () => void;
  onCopyPath?: () => void;
}

export function CodeEditor({
  root, filePath, onOpenInIde, onCopyPath
}: CodeEditorProps) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [absPath, setAbsPath] = useState<string | undefined>();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load file on path change
  useEffect(() => {
    let cancelled = false;
    if (!filePath) {
      setContent(''); setOriginalContent(''); setError(undefined);
      setAbsPath(undefined);
      return;
    }
    setLoading(true);
    setError(undefined);
    window.cth.readFile(root, filePath).then(res => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setContent(res.content);
        setOriginalContent(res.content);
        setAbsPath(res.path);
      } else {
        setContent('');
        setOriginalContent('');
        setAbsPath(undefined);
        setError(res.error);
      }
    });
    return () => { cancelled = true; };
  }, [root, filePath]);

  const dirty = content !== originalContent;

  const save = useCallback(async () => {
    if (!filePath || !dirty) return;
    setSaveState('saving');
    const res = await window.cth.writeFile(root, filePath, content);
    if (res.ok) {
      setOriginalContent(content);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    } else {
      setSaveState('error');
      setError(res.error);
      setTimeout(() => setSaveState('idle'), 4000);
    }
  }, [filePath, dirty, content, root]);

  // Cmd-S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const extensions = useMemo(
    () => [cthEditorTheme, syntaxHighlighting(cthSyntax), ...(filePath ? extensionsFor(filePath) : [])],
    [filePath]
  );

  if (!filePath) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        background: 'var(--cth-paper-200)',
        textAlign: 'center'
      }}>
        <div style={{ opacity: 0.5 }}>
          <Icon name="code" size={2} />
        </div>
        <div style={{
          fontFamily: 'var(--cth-font-display)', fontSize: 11, lineHeight: '14px',
          textTransform: 'uppercase', letterSpacing: 1,
          color: 'var(--cth-ink-700)'
        }}>
          No file open
        </div>
        <div style={{
          fontFamily: 'var(--cth-font-ui)', fontSize: 13,
          color: 'var(--cth-ink-500)'
        }}>
          Pick a file from the tree to view it here.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--cth-paper-100)'
    }}>
      {/* Mini header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        background: 'var(--cth-cream-200)',
        borderBottom: '1px solid var(--cth-ink-700)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12,
        color: 'var(--cth-ink-700)'
      }}>
        <Icon name="code" />
        <span style={{
          flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }} title={absPath}>{filePath}{dirty && ' •'}</span>
        {onCopyPath && (
          <button
            onClick={onCopyPath}
            title="Copy absolute path"
            style={editorBtn}
          >copy path</button>
        )}
        <button
          onClick={save}
          disabled={!dirty || saveState === 'saving'}
          title="Save (Cmd-S)"
          style={{ ...editorBtn, opacity: dirty ? 1 : 0.5 }}
        >
          {saveState === 'saving' ? '...' : saveState === 'saved' ? 'saved' : saveState === 'error' ? 'err' : 'save'}
        </button>
        {onOpenInIde && (
          <button
            onClick={onOpenInIde}
            title="Open in the IDE"
            aria-label="Open in the IDE"
            style={editorBtn}
          >
            <Icon name="code" />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 12, color: 'var(--cth-ink-500)' }}>loading…</div>
        ) : error ? (
          <div style={{ padding: 12, color: 'var(--cth-coral)' }}>{error}</div>
        ) : (
          <CodeMirror
            value={content}
            onChange={(v) => setContent(v)}
            extensions={extensions}
            height="100%"
            theme="light"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              foldGutter: true,
              autocompletion: false
            }}
          />
        )}
      </div>
    </div>
  );
}

const editorBtn: React.CSSProperties = {
  padding: '0 6px', height: 22,
  fontFamily: 'var(--cth-font-ui)', fontSize: 12,
  color: 'var(--cth-ink-900)',
  background: 'var(--cth-cream-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100), 2px 2px 0 0 var(--cth-ink-100)',
  cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4
};
