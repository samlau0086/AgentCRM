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

export function useServerCollectionSync(
  sources: SyncSource[],
  options: SyncOptions = {},
) {
  const intervalMs = options.intervalMs ?? 5000;
  const sourcesRef = useRef(sources);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => {
    let cancelled = false;

    const refreshSource = (source: SyncSource<T>) => {
      source.loadFromServer()
        .then((data) => {
          if (!cancelled) source.setData(data);
        })
        .catch(() => {
          if (!cancelled) source.setData(source.readFromCache());
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
          source.setData(source.readFromCache());
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
