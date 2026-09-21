/**
 * Monaco bootstrap for the Electron renderer (electron-vite / Vite).
 *
 * Two things have to be true for Monaco to work in a bundled Electron app:
 *
 *  1. Workers must be SELF-HOSTED, not fetched from a CDN. We import each
 *     language worker through Vite's `?worker` suffix, which emits a real
 *     bundled worker chunk and a constructor. `MonacoEnvironment.getWorker`
 *     hands Monaco the right one per language. This is the electron-vite-safe
 *     equivalent of the classic `getWorkerUrl` CDN dance — it works offline and
 *     inside the packaged `app.asar` because the worker URL is resolved by Vite
 *     at build time (relative `base: './'`).
 *
 *  2. `@monaco-editor/react` must use THIS bundled `monaco` instance rather than
 *     its default behaviour of lazy-loading monaco from a CDN via AMD. We pin it
 *     with `loader.config({ monaco })`.
 *
 * Import this module once (for its side effects) before any editor mounts.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  }
};

let themesDefined = false;

/** Register the CTH light/dark Monaco themes (idempotent).
 *
 * v0.6.0: `cth-light` was still on a violet-toned palette that predates even
 * the v0.5.0 redesign (background #FCFAF0, foreground #1A1320 — neither is a
 * tokens.css value from any recent pass), and no dark theme was ever
 * registered at all — the IDE editor stayed light-only regardless of the
 * app's theme toggle. Monaco (like xterm and CodeMirror elsewhere in this
 * codebase) takes literal colours, not CSS custom properties, so both themes
 * below restate the current --cth-* palette as hex and must be updated by
 * hand if tokens.css changes again. */
function defineThemes(m: typeof monaco): void {
  if (themesDefined) return;
  themesDefined = true;
  m.editor.defineTheme('cth-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '151515', background: 'FFFFFF' },
      { token: 'comment', foreground: '6B6A67', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'A56EFF' },
      { token: 'string', foreground: '529A0A' },
      { token: 'number', foreground: 'F14F58' },
      { token: 'type', foreground: '1D4AFF' },
      { token: 'function', foreground: 'F54E01' },
      { token: 'variable', foreground: '151515' },
      { token: 'delimiter', foreground: '6B6A67' }
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#151515',
      'editorLineNumber.foreground': '#A8A79F',
      'editorLineNumber.activeForeground': '#43423D',
      'editor.selectionBackground': '#FBEBC7',
      'editor.lineHighlightBackground': '#F7F6F1',
      'editorCursor.foreground': '#F14F58',
      'editorGutter.background': '#EEEFE9',
      'editorWidget.background': '#FBFAF7',
      'editorIndentGuide.background1': '#E7E6E0',
      'diffEditor.insertedTextBackground': '#529A0A33',
      'diffEditor.removedTextBackground': '#F14F5833',
      'diffEditor.insertedLineBackground': '#529A0A22',
      'diffEditor.removedLineBackground': '#F14F5822'
    }
  });
  m.editor.defineTheme('cth-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'F3F1EC', background: '24262D' },
      { token: 'comment', foreground: '9997A0', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'BD9BFF' },
      { token: 'string', foreground: '74C13A' },
      { token: 'number', foreground: 'F0747C' },
      { token: 'type', foreground: '6E8CFF' },
      { token: 'function', foreground: 'F7A11B' },
      { token: 'variable', foreground: 'F3F1EC' },
      { token: 'delimiter', foreground: '9997A0' }
    ],
    colors: {
      'editor.background': '#24262D',
      'editor.foreground': '#F3F1EC',
      'editorLineNumber.foreground': '#5C5F6B',
      'editorLineNumber.activeForeground': '#CFCDC6',
      'editor.selectionBackground': '#F0C25533',
      'editor.lineHighlightBackground': '#33353D',
      'editorCursor.foreground': '#F0747C',
      'editorGutter.background': '#1C1E24',
      'editorWidget.background': '#2B2E36',
      'editorIndentGuide.background1': '#33353D',
      'diffEditor.insertedTextBackground': '#74C13A33',
      'diffEditor.removedTextBackground': '#F0747C33',
      'diffEditor.insertedLineBackground': '#74C13A22',
      'diffEditor.removedLineBackground': '#F0747C22'
    }
  });
}

let configured = false;

/** Pin @monaco-editor/react to the bundled monaco + register themes. Idempotent. */
export function setupMonaco(): typeof monaco {
  if (!configured) {
    configured = true;
    loader.config({ monaco });
  }
  defineThemes(monaco);
  return monaco;
}

/** Monaco theme name for the app's current light/dark state — follows the
 *  same app-wide toggle (design/theme.ts) as the rest of the chrome. */
export function monacoThemeFor(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? 'cth-dark' : 'cth-light';
}

/** Map a filename to a Monaco language id (used to set the model language). */
export function languageForPath(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs': return 'javascript';
    case 'json': return 'json';
    case 'md':
    case 'markdown': return 'markdown';
    case 'py': return 'python';
    case 'rb': return 'ruby';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'java': return 'java';
    case 'c':
    case 'h': return 'c';
    case 'cpp':
    case 'cc':
    case 'hpp': return 'cpp';
    case 'cs': return 'csharp';
    case 'php': return 'php';
    case 'sh':
    case 'bash':
    case 'zsh': return 'shell';
    case 'html':
    case 'htm': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'yml':
    case 'yaml': return 'yaml';
    case 'toml': return 'ini';
    case 'xml': return 'xml';
    case 'sql': return 'sql';
    case 'dockerfile': return 'dockerfile';
    default:
      if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
      return 'plaintext';
  }
}
