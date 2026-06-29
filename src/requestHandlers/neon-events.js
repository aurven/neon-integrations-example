'use strict';

const axios = require('axios');
const { authenticate } = require('../helpers/auth.js');

async function neonEventsSubscribeHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const neonAppUrl = process.env.NEON_APP_URL;
  const neonBoApiKey = process.env.NEON_BO_APIKEY;
  if (!neonAppUrl || !neonBoApiKey) {
    return reply.status(503).send({ error: 'Neon not configured: NEON_APP_URL or NEON_BO_APIKEY missing' });
  }

  const { subscriptions = [], startingPoint } = request.body || {};
  const requestBody = { subscriptions };
  if (startingPoint !== undefined && startingPoint !== null) requestBody.startingPoint = startingPoint;

  reply.hijack();
  const rawReply = reply.raw;

  let neonStream;
  try {
    const response = await axios.post(
      `${neonAppUrl}/client-notifier/subscribe`,
      requestBody,
      {
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'neon-bo-access-key': neonBoApiKey
        },
        responseType: 'stream',
        timeout: 0
      }
    );

    rawReply.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    neonStream = response.data;
    neonStream.pipe(rawReply);
    neonStream.on('error', (err) => {
      console.error('[neon-events] Neon stream error:', err.message);
      rawReply.end();
    });
    rawReply.on('close', () => neonStream.destroy());
  } catch (err) {
    console.error('[neon-events] Failed to connect to Neon client-notifier:', err.message);
    if (!rawReply.headersSent) {
      rawReply.writeHead(502, { 'Content-Type': 'application/json' });
    }
    try { rawReply.end(JSON.stringify({ error: 'Failed to connect to Neon events stream' })); } catch {}
  }
}

module.exports = { neonEventsSubscribeHandler };
