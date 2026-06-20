import { useCallback, useEffect, useRef } from 'react';

// Polls `fetchFn` on an interval and reports id-based add/remove deltas
// against the previously-seen result, without ever touching/replacing
// objects for ids it already knows about. Callers own unwrapping their
// response shape (e.g. `{ articles: [...] }`) into a plain array before
// returning it from `fetchFn`.
export function usePollingSearchDelta({ fetchFn, idKey = 'id', intervalMs, enabled = true, onDelta }) {
  const knownIdsRef = useRef(new Set());
  const intervalHandleRef = useRef(null);
  const inFlightRef = useRef(false);
  const reloadPendingRef = useRef(false);
  const mountedRef = useRef(true);

  // fetchFn/onDelta are read through refs inside async callbacks so that a
  // new function identity each render never has to retrigger the effect
  // below (which would tear down and recreate the interval timer). The
  // effect's own re-arming is driven only by the dependency list further
  // down, matching the hook's documented contract.
  const fetchFnRef = useRef(fetchFn);
  const onDeltaRef = useRef(onDelta);
  fetchFnRef.current = fetchFn;
  onDeltaRef.current = onDelta;

  // Hard-reset: clear known ids, fetch once, re-baseline as an 'init'
  // delta. Shared by the mount-time initial fetch and the public reload().
  const runInit = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const items = await fetchFnRef.current();
      if (!mountedRef.current) return;
      const known = knownIdsRef.current;
      known.clear();
      for (const item of items) {
        known.add(item[idKey]);
      }
      onDeltaRef.current?.({ type: 'init', items });
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && reloadPendingRef.current) {
        reloadPendingRef.current = false;
        runInit();
      }
    }
  }, [idKey]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    runInit().then(() => {
      if (cancelled || !mountedRef.current) return;

      intervalHandleRef.current = setInterval(() => {
        if (inFlightRef.current) {
          // Previous tick's fetch hasn't resolved yet — skip this tick
          // rather than firing a second concurrent fetchFn() call.
          return;
        }
        inFlightRef.current = true;
        fetchFnRef
          .current()
          .then((items) => {
            if (!mountedRef.current) return;
            const known = knownIdsRef.current;
            const seenIds = new Set();
            const added = [];
            for (const item of items) {
              const id = item[idKey];
              seenIds.add(id);
              if (!known.has(id)) {
                added.push(item);
              }
            }
            const removedIds = [];
            for (const id of known) {
              if (!seenIds.has(id)) {
                removedIds.push(id);
              }
            }
            for (const item of added) {
              known.add(item[idKey]);
            }
            for (const id of removedIds) {
              known.delete(id);
            }
            onDeltaRef.current?.({ type: 'delta', added, removedIds });
          })
          .finally(() => {
            inFlightRef.current = false;
            if (mountedRef.current && reloadPendingRef.current) {
              reloadPendingRef.current = false;
              runInit();
            }
          });
      }, intervalMs);
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (intervalHandleRef.current != null) {
        clearInterval(intervalHandleRef.current);
        intervalHandleRef.current = null;
      }
    };
  }, [fetchFn, idKey, intervalMs, enabled, runInit]);

  const reload = useCallback(() => {
    if (inFlightRef.current) {
      reloadPendingRef.current = true;
      return;
    }
    knownIdsRef.current.clear();
    runInit();
  }, [runInit]);

  return { reload };
}
