import { useEffect, useState } from 'react';
import { type HiveTask, waitsOnHuman } from '@/components/TasksKanban';

/**
 * How many task cards are currently waiting on the human.
 *
 * Backs the count on the ASK ME tab. Before this there was no indication
 * anywhere that a question existed — the board, the badge and the floor sign
 * all sat behind a tab you had to already be looking at, so an ask could sit
 * unanswered indefinitely simply because nothing said it was there.
 *
 * It re-reads the ledger itself rather than sharing AskMeTab's copy, because
 * that component is only mounted while its own tab is open — which is exactly
 * when the count is least useful. Same 5s cadence and the same `waitsOnHuman`
 * predicate the board sorts by, so the number can never disagree with the list
 * it is counting.
 */
const POLL_MS = 5000;

function parse(raw: unknown): HiveTask[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks)
    ? (raw as { tasks: HiveTask[] }).tasks
    : [];
  return list.filter((t) => !!t && typeof t === 'object');
}

export function useAskCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const n = parse(await window.cth.hiveTasks()).filter(waitsOnHuman).length;
        if (alive) setCount(n);
      } catch { /* keep the last good count rather than flashing 0 */ }
    };
    void read();
    const poll = setInterval(() => { void read(); }, POLL_MS);
    // Coming back to the window is the moment the number is most likely stale
    // and most likely to be looked at, so don't make the user wait out the tick.
    const onFocus = () => { void read(); };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(poll); window.removeEventListener('focus', onFocus); };
  }, []);

  return count;
}
