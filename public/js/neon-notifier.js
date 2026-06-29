(function (global) {
  'use strict';

  var READ_TIMEOUT_MS = 90000;
  var RECONNECT_DELAY_MS = 2000;
  var REFRESH_INTERVAL_MS = 600000;

  function NeonNotifier(opts) {
    opts = opts || {};
    this._subscriptions = opts.subscriptions || [];
    this._onEvent = opts.onEvent || null;
    this._baseUrl = opts.baseUrl || '';
    this._apiKey = opts.apiKey || '';
    this._active = false;
    this._controller = null;
    this._buffer = '';
    this._lastEventId = undefined;
    this._readTimeoutId = null;
    this._refreshIntervalId = null;
    this._cancelled = false;
  }

  NeonNotifier.prototype.connect = function () {
    if (this._active) return this;
    this._cancelled = false;
    this._start();
    var self = this;
    this._refreshIntervalId = setInterval(function () { self._restart(); }, REFRESH_INTERVAL_MS);
    return this;
  };

  NeonNotifier.prototype.disconnect = function () {
    this._cancelled = true;
    this._active = false;
    clearInterval(this._refreshIntervalId);
    this._refreshIntervalId = null;
    this._clearReadTimeout();
    if (this._controller) { this._controller.abort('disconnect'); this._controller = null; }
  };

  NeonNotifier.prototype._start = async function () {
    if (this._active || this._cancelled) return;
    this._active = true;
    this._buffer = '';
    var self = this;
    try {
      self._controller = new AbortController();
      var response = await fetch(self._baseUrl + '/api/neon/events/subscribe', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          apikey: self._apiKey
        },
        body: JSON.stringify({ startingPoint: self._lastEventId, subscriptions: self._subscriptions }),
        signal: self._controller.signal
      });

      if (!response.ok) {
        console.error('[NeonNotifier] Subscribe failed: ' + response.status);
        self._active = false;
        if (!self._cancelled) setTimeout(function () { self._start(); }, RECONNECT_DELAY_MS);
        return;
      }

      var reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      self._resetReadTimeout();

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        self._resetReadTimeout();
        self._parseChunk(chunk.value);
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        console.error('[NeonNotifier] Stream error:', err);
        self._active = false;
        if (!self._cancelled) setTimeout(function () { self._start(); }, RECONNECT_DELAY_MS);
        return;
      }
    } finally {
      self._clearReadTimeout();
      self._active = false;
    }
  };

  NeonNotifier.prototype._restart = function () {
    if (this._controller) this._controller.abort('restart');
    this._buffer = '';
    var self = this;
    setTimeout(function () { self._start(); }, 0);
  };

  NeonNotifier.prototype._parseChunk = function (chunk) {
    this._buffer += chunk;
    var events = this._buffer.split('\n\n');
    this._buffer = events.pop() || '';
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event.trim()) continue;
      var lines = event.split('\n');
      var eventId, dataLine = '';
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (line.indexOf('id:') === 0) eventId = line.slice(3).trim();
        else if (line.indexOf('data:') === 0) dataLine += line.slice(5).trim();
      }
      if (eventId) this._lastEventId = eventId;
      if (dataLine) {
        try {
          var payload = JSON.parse(dataLine);
          var payloads = Array.isArray(payload) ? payload : [payload];
          for (var k = 0; k < payloads.length; k++) {
            if (payloads[k] && this._onEvent) this._onEvent(payloads[k]);
          }
        } catch (e) {
          console.error('[NeonNotifier] Failed to parse event:', e);
        }
      }
    }
  };

  NeonNotifier.prototype._resetReadTimeout = function () {
    var self = this;
    this._clearReadTimeout();
    this._readTimeoutId = setTimeout(function () {
      console.warn('[NeonNotifier] No data for 90s, restarting');
      if (self._controller) self._controller.abort('timeout');
    }, READ_TIMEOUT_MS);
  };

  NeonNotifier.prototype._clearReadTimeout = function () {
    if (this._readTimeoutId !== null) { clearTimeout(this._readTimeoutId); this._readTimeoutId = null; }
  };

  global.NeonNotifier = NeonNotifier;
})(typeof window !== 'undefined' ? window : globalThis);
