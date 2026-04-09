'use strict';

const seo = require('../seo.json');
const crypto = require('crypto');
const { authenticate, shouldShowMaintenance } = require('../helpers/auth.js');
const { handleChatTurn } = require('../helpers/claude-chat-helper.js');

/**
 * GET /panels/claude-chat
 * Renders the Claude Chat panel UI.
 */
async function claudeChatPanelHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (shouldShowMaintenance(request, auth, 'claude-chat')) {
    return reply.view('/src/panels/maintenance-panel.hbs', {
      seo,
      panelName: 'Claude Chat',
      isDemoMode: request.query.demo === 'maintenance'
    });
  }

  const params = {
    seo,
    apiKey: auth.apikey,
    neonAppUrl: process.env.NEON_APP_URL || '',
    sessionId: crypto.randomUUID(),
    isDemoMode: request.query.demo === 'true',
    role: auth.role
  };

  return reply.view('/src/panels/claude-chat-panel.hbs', params);
}

/**
 * POST /panels/claude-chat/api/chat
 * Streams a Claude chat response as Server-Sent Events.
 *
 * Expected body: { sessionId, message, neonContext? }
 */
async function claudeChatApiHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { sessionId, message, neonContext } = request.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return reply.status(400).send({ error: 'sessionId is required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return reply.status(400).send({ error: 'message is required' });
  }

  // Hijack the reply so we can write directly to reply.raw for SSE
  reply.hijack();

  await handleChatTurn({
    sessionId,
    userMessage: message.trim(),
    neonContext: neonContext || null,
    role: auth.role,
    rawReply: reply.raw
  });

  return reply;
}

module.exports = {
  claudeChatPanelHandler,
  claudeChatApiHandler
};
