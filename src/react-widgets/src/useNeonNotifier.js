import { useEffect, useRef } from 'react';

const READ_TIMEOUT_MS = 90_000;
const RECONNECT_DELAY_MS = 2_000;
const REFRESH_INTERVAL_MS = 600_000;

function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

export function useNeonNotifier({ familyRefs, events, onEvent, enabled = true }) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const familyRefsKey = JSON.stringify(familyRefs ?? []);
  const eventsKey = JSON.stringify(events ?? []);

  useEffect(() => {
    if (!enabled || !familyRefs?.length) return;

    const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';
    const apiKey = window.CONFIG?.apiKey ?? '';
    const subscriptions = [{
      principals: ['.*'],
      events: events ?? ['.*'],
      familyRefs: familyRefs
    }];

    let active = false;
    let controller = null;
    let buffer = '';
    let lastEventId;
    let readTimeoutId = null;
    let refreshIntervalId = null;
    let cancelled = false;

    const clearReadTimeout = () => {
      if (readTimeoutId !== null) { clearTimeout(readTimeoutId); readTimeoutId = null; }
    };

    const resetReadTimeout = () => {
      clearReadTimeout();
      readTimeoutId = setTimeout(() => {
        if (!cancelled) controller?.abort('timeout');
      }, READ_TIMEOUT_MS);
    };

    const parseChunk = (chunk) => {
      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const raw of parts) {
        if (!raw.trim()) continue;
        let eventId, dataLine = '', hasData = false;
        for (const line of raw.split('\n')) {
          if (line.startsWith('id:')) eventId = line.slice(3).trim();
          else if (line.startsWith('data:')) {
            if (hasData) dataLine += '\n';
            dataLine += line.slice(5).trim();
            hasData = true;
          }
        }
        if (eventId) lastEventId = eventId;
        if (dataLine) {
          try {
            const payload = JSON.parse(dataLine);
            const payloads = Array.isArray(payload) ? payload : [payload];
            for (const p of payloads) {
              // Neon content-change events always carry a `details` object;
              // filter drops keep-alive and other protocol-level payloads.
              if (p?.details) onEventRef.current?.(p);
            }
          } catch {}
        }
      }
    };

    const start = async () => {
      if (active || cancelled) return;
      active = true;
      buffer = '';
      try {
        controller = new AbortController();
        const response = await fetch(`${BASE_URL}/api/neon/events/subscribe`, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
            apikey: apiKey
          },
          body: JSON.stringify({ startingPoint: lastEventId, subscriptions }),
          signal: controller.signal
        });
        if (!response.ok) {
          active = false;
          if (!cancelled) setTimeout(start, RECONNECT_DELAY_MS);
          return;
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        resetReadTimeout();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetReadTimeout();
          parseChunk(value);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          active = false;
          if (!cancelled) setTimeout(start, RECONNECT_DELAY_MS);
          return;
        }
      } finally {
        clearReadTimeout();
        active = false;
      }
    };

    const restart = () => { controller?.abort('restart'); buffer = ''; setTimeout(start, 0); };

    start();
    refreshIntervalId = setInterval(restart, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearReadTimeout();
      clearInterval(refreshIntervalId);
      controller?.abort('unmount');
    };
  // familyRefsKey and eventsKey are the stable serializations that drive re-subscription
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyRefsKey, eventsKey, enabled]);
}
