import { useCallback, useEffect, useRef } from 'react';

// Polls `fetchFn` on an interval and reports id-based deltas.
//
// If `pollFetchFn` is provided it is used for interval ticks instead of
// `fetchFn`. Poll ticks emit { type: 'poll', added, updated } — no removedIds,
// because a small-window fetch cannot distinguish "gone" from "outside the
// top-N window". The full `fetchFn` is still used for the initial load and
// for explicit reload() calls.
export function usePollingSearchDelta({ fetchFn, pollFetchFn, idKey = 'id', intervalMs, enabled = true, onDelta }) {
  const knownIdsRef = useRef(new Set());
  const intervalHandleRef = useRef(null);
  const inFlightRef = useRef(false);
  const reloadPendingRef = useRef(false);
  const mountedRef = useRef(true);

  // Read through refs so that new function identities on each render never
  // retrigger the effect below (which tears down and recreates the timer).
  const fetchFnRef = useRef(fetchFn);
  const pollFetchFnRef = useRef(pollFetchFn);
  const onDeltaRef = useRef(onDelta);
  fetchFnRef.current = fetchFn;
  pollFetchFnRef.current = pollFetchFn;
  onDeltaRef.current = onDelta;

  const runInit = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const items = await fetchFnRef.current();
      if (!mountedRef.current) return;
      const known = knownIdsRef.current;
      known.clear();
      for (const item of items) known.add(item[idKey]);
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
    let cancelled = false;

    runInit().then(() => {
      if (cancelled || !mountedRef.current) return;
      if (!enabled) return;

      intervalHandleRef.current = setInterval(() => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        const usePollFn = !!pollFetchFnRef.current;
        const activeFetch = usePollFn ? pollFetchFnRef.current() : fetchFnRef.current();
        activeFetch
          .then((items) => {
            if (!mountedRef.current) return;
            const known = knownIdsRef.current;
            if (usePollFn) {
              // Small window: classify by known status, never report removes
              const added = [];
              const updated = [];
              for (const item of items) {
                const id = item[idKey];
                if (known.has(id)) {
                  updated.push(item);
                } else {
                  added.push(item);
                  known.add(id);
                }
              }
              onDeltaRef.current?.({ type: 'poll', added, updated });
            } else {
              // Full fetch: detect true adds and removes
              const seenIds = new Set();
              const added = [];
              for (const item of items) {
                const id = item[idKey];
                seenIds.add(id);
                if (!known.has(id)) {
                  added.push(item);
                  known.add(id);
                }
              }
              const removedIds = [];
              for (const id of known) {
                if (!seenIds.has(id)) removedIds.push(id);
              }
              for (const id of removedIds) known.delete(id);
              onDeltaRef.current?.({ type: 'delta', added, removedIds });
            }
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
