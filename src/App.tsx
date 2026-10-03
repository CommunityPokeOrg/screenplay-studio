import { useState } from 'react';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import {
  BeatsPanel,
  CharactersPanel,
  FilesPanel,
  IdeasPanel,
} from './components/Panels';
import { useStore } from './state/StoreContext';
import type { Panel } from './state/store';

const NAV: { id: Panel; label: string }[] = [
  { id: 'script', label: 'Script' },
  { id: 'beats', label: 'Beats' },
  { id: 'characters', label: 'Characters' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'files', label: 'Files' },
];

export default function App() {
  const { state, dispatch } = useStore();
  // On mobile: 'nav' shows the outline/sidebar, 'main' the editor/panel.
  const [mobileTab, setMobileTab] = useState<'nav' | 'main'>('nav');

  if (!state.hydrated) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <TopBar />
      <ConflictBanner />
      <div className="flex min-h-0 flex-1">
        <div
          className={`w-full shrink-0 overflow-y-auto border-r border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900 md:block md:w-72 ${
            mobileTab === 'nav' ? 'block' : 'hidden'
          }`}
        >
          <Sidebar onNavigate={() => setMobileTab('main')} />
        </div>
        <main
          className={`min-w-0 flex-1 overflow-y-auto ${
            mobileTab === 'main' ? 'block' : 'hidden'
          } md:block`}
        >
          {state.panel === 'script' && <Editor onBack={() => setMobileTab('nav')} />}
          {state.panel === 'beats' && <BeatsPanel />}
          {state.panel === 'characters' && <CharactersPanel />}
          {state.panel === 'ideas' && <IdeasPanel />}
          {state.panel === 'files' && <FilesPanel />}
        </main>
      </div>
      {/* Mobile bottom nav */}
      <nav className="flex border-t border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900 md:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`flex-1 py-2 text-xs font-medium ${
              state.panel === n.id ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500'
            }`}
            onClick={() => {
              dispatch({ type: 'setPanel', panel: n.id });
              setMobileTab('main');
            }}
          >
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ConflictBanner() {
  const { state, dispatch } = useStore();
  if (!state.conflicts.length) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm dark:border-amber-900 dark:bg-amber-950">
      <div className="font-medium text-amber-900 dark:text-amber-200">
        {state.conflicts.length} edit conflict{state.conflicts.length > 1 ? 's' : ''} — another
        device changed the same item.
      </div>
      <ul className="mt-1 space-y-1">
        {state.conflicts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2">
            <span className="text-amber-800 dark:text-amber-300">
              {c.kind} <code className="text-xs">{c.id.slice(0, 8)}</code>
            </span>
            <button
              className="rounded border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => dispatch({ type: 'resolveConflict', id: c.id, choice: 'mine' })}
            >
              Keep my version
            </button>
            <button
              className="rounded border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => dispatch({ type: 'resolveConflict', id: c.id, choice: 'theirs' })}
            >
              Take server version
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
