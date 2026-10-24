import { useCallback, useState } from "react";

// Shared busy-flag + log state, used by every XML-tab action (upload, promote, photo
// attach…) so each one doesn't repeat its own try/catch/finally.
export function useBusyLog() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const addLog = useCallback((line: string) => setLog((prev) => [...prev, line]), []);
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        addLog(`❌ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [addLog]
  );
  return { busy, log, addLog, run };
}
