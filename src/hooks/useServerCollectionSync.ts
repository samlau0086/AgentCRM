import { useEffect, useRef } from "react";

type SyncSource = {
  keys: string[];
  loadFromServer: () => Promise<unknown>;
  readFromCache: () => unknown;
  setData: (data: any) => void;
};

type SyncOptions = {
  intervalMs?: number;
};

function fingerprint(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function useServerCollectionSync(
  sources: SyncSource[],
  options: SyncOptions = {},
) {
  const intervalMs = options.intervalMs ?? 5000;
  const sourcesRef = useRef(sources);
  const fingerprintsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    let cancelled = false;

    const sourceId = (source: SyncSource) => source.keys.join("|");

    const applyData = (source: SyncSource, data: unknown) => {
      if (cancelled) return;
      const id = sourceId(source);
      const nextFingerprint = fingerprint(data);
      if (fingerprintsRef.current[id] === nextFingerprint) return;
      fingerprintsRef.current[id] = nextFingerprint;
      source.setData(data);
    };

    const refreshSource = (source: SyncSource) => {
      source.loadFromServer()
        .then((data) => {
          applyData(source, data);
        })
        .catch(() => {
          applyData(source, source.readFromCache());
        });
    };

    const refreshAll = () => {
      sourcesRef.current.forEach(refreshSource);
    };

    const handleDataChanged = (event: Event) => {
      const changedKey = (event as CustomEvent<{ key?: string }>).detail?.key;
      sourcesRef.current
        .filter((source) => !changedKey || source.keys.includes(changedKey))
        .forEach((source) => {
          applyData(source, source.readFromCache());
        });
    };

    refreshAll();
    window.addEventListener("crm:data-changed", handleDataChanged);
    const refreshTimer = window.setInterval(refreshAll, intervalMs);

    return () => {
      cancelled = true;
      window.removeEventListener("crm:data-changed", handleDataChanged);
      window.clearInterval(refreshTimer);
    };
  }, [intervalMs]);
}
