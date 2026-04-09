'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { NeonClient } = require('./neon-bo-api-v2.js');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Anthropic client (singleton, lazy-initialised)
// ---------------------------------------------------------------------------
let _anthropic = null;
function getAnthropicClient() {
  if (!_anthropic && process.env.ANTHROPIC_API_KEY) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes
const MAX_MESSAGES = 20; // sliding window

const sessions = new Map();

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(id);
      console.log(`[Claude Chat] Session ${id} expired and removed`);
    }
  }
}, 10 * 60 * 1000); // every 10 minutes

function getOrCreateSession(sessionId) {
  const now = Date.now();
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.expiresAt = now + SESSION_TTL_MS; // refresh TTL
    return session;
  }
  const session = {
    messages: [],
    systemPrompt: null,
    neonContext: null,
    expiresAt: now + SESSION_TTL_MS
  };
  sessions.set(sessionId, session);
  console.log(`[Claude Chat] New session created: ${sessionId}`);
  return session;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------
function buildSystemPrompt(neonContext) {
  const node = neonContext?.originalNode || {};
  const channel = neonContext?.channel || {};
  const workspace = neonContext?.workfolder || neonContext?.workspace || '';

  // Truncate body to avoid blowing the context window
  const bodyPreview = typeof node.body === 'string'
    ? node.body.replace(/<[^>]+>/g, '').substring(0, 2000)
    : '';

  return `You are a CMS assistant integrated into Neon CMS. You help journalists and editors work more efficiently.
You have access to Neon CMS tools that let you read and, where authorised, modify content.

Current context:
- Story title: ${node.title || node.headline || '(unknown)'}
- Family ref: ${node.familyRef || '(unknown)'}
- Channel / site: ${channel.name || channel.label || '(unknown)'}
- Workspace: ${workspace}
- Workflow status: ${node.workflowStatus || node.status || '(unknown)'}
${bodyPreview ? `\nStory body preview (first 2000 chars):\n${bodyPreview}` : ''}

Guidelines:
- Use tools when the user asks you to fetch, search, or modify content in Neon.
- When performing write operations, always confirm your intent before proceeding unless the user has been explicit.
- Respond concisely — the panel has limited screen space.
- Format responses with markdown where it improves readability.`;
}

// ---------------------------------------------------------------------------
// Neon tool definitions
// ---------------------------------------------------------------------------
function buildNeonTools(neonContext, neonClient, role) {
  const familyRef = neonContext?.originalNode?.familyRef;

  const tools = [
    {
      name: 'get_story',
      description: 'Fetch the full data of a Neon CMS story node by its familyRef.',
      input_schema: {
        type: 'object',
        properties: {
          family_ref: {
            type: 'string',
            description: 'The familyRef of the node to fetch. If omitted, uses the currently open story.'
          }
        },
        required: []
      },
      async run(input) {
        const ref = input.family_ref || familyRef;
        if (!ref) return JSON.stringify({ error: 'No familyRef available' });
        try {
          const node = await neonClient.getNode(ref);
          // Trim body to avoid massive responses
          if (node?.body) node.body = String(node.body).substring(0, 3000);
          return JSON.stringify(node, null, 2);
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      }
    },
    {
      name: 'search_content',
      description: 'Full-text search across Neon CMS content.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query text.'
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default 10, max 20).'
          }
        },
        required: ['query']
      },
      async run(input) {
        const limit = Math.min(input.max_results || 10, 20);
        const payload = { query: input.query };
        try {
          const results = await neonClient.searchContents(payload, 0, limit);
          return JSON.stringify(results, null, 2);
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      }
    },
    {
      name: 'get_sites',
      description: 'List all configured Neon CMS sites and channels.',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      },
      async run() {
        try {
          const sites = await neonClient.getSites();
          return JSON.stringify(sites, null, 2);
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      }
    }
  ];

  // Write tools — admin only; familyRef is injected from session context (not user input)
  if (role === 'admin' && familyRef) {
    tools.push(
      {
        name: 'lock_story',
        description: `Lock the current story (familyRef: ${familyRef}) for editing. Call this before making content changes.`,
        input_schema: { type: 'object', properties: {}, required: [] },
        async run() {
          try {
            const result = await neonClient.lockNode(familyRef);
            return JSON.stringify({ success: true, result });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      },
      {
        name: 'unlock_story',
        description: `Unlock the current story (familyRef: ${familyRef}) after editing.`,
        input_schema: {
          type: 'object',
          properties: {
            unlock_mode: {
              type: 'string',
              description: 'Unlock mode: MAJOR (default) or MINOR.',
              enum: ['MAJOR', 'MINOR']
            }
          },
          required: []
        },
        async run(input) {
          try {
            await neonClient.unlockNode(familyRef, input.unlock_mode || 'MAJOR');
            return JSON.stringify({ success: true });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      },
      {
        name: 'update_story_metadata',
        description: `Update the metadata (title, tags, SEO fields, etc.) of the current story (familyRef: ${familyRef}). Provide the metadata as XML string.`,
        input_schema: {
          type: 'object',
          properties: {
            metadata_xml: {
              type: 'string',
              description: 'The metadata XML string to write.'
            }
          },
          required: ['metadata_xml']
        },
        async run(input) {
          try {
            const result = await neonClient.updateNodeMetadata(familyRef, input.metadata_xml);
            return JSON.stringify({ success: result });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      },
      {
        name: 'update_story_content',
        description: `Update the body content of the current story (familyRef: ${familyRef}). Provide the story body as XML string.`,
        input_schema: {
          type: 'object',
          properties: {
            body_xml: {
              type: 'string',
              description: 'The full story body XML string to write.'
            }
          },
          required: ['body_xml']
        },
        async run(input) {
          try {
            const result = await neonClient.updateNodeContent(familyRef, input.body_xml);
            return JSON.stringify({ success: result });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      }
    );
  }

  return tools;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
function sseWrite(rawReply, data) {
  rawReply.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseDone(rawReply) {
  rawReply.write('data: [DONE]\n\n');
}

function sseError(rawReply, message) {
  rawReply.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
}

// ---------------------------------------------------------------------------
// Main chat turn handler
// ---------------------------------------------------------------------------
async function handleChatTurn({ sessionId, userMessage, neonContext, role, rawReply }) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    rawReply.writeHead(500, { 'Content-Type': 'application/json' });
    rawReply.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }));
    return;
  }

  const session = getOrCreateSession(sessionId);

  // Initialise system prompt on first turn when we have context
  if (!session.systemPrompt && neonContext) {
    session.neonContext = neonContext;
    session.systemPrompt = buildSystemPrompt(neonContext);
  }

  // Append user message
  session.messages.push({ role: 'user', content: userMessage });

  // Sliding window: keep last MAX_MESSAGES
  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  // Write SSE headers
  rawReply.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // disable nginx buffering
  });

  // Keepalive timer — fires every 15s to prevent proxy timeouts
  const keepalive = setInterval(() => {
    rawReply.write(': keepalive\n\n');
  }, 15000);

  let neonClient = null;

  try {
    // Create and login NeonClient (one per turn)
    neonClient = new NeonClient();
    await neonClient.login();

    const tools = buildNeonTools(session.neonContext || neonContext, neonClient, role);

    // Convert tools to Anthropic SDK format (input_schema + run function)
    const sdkTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
      run: t.run.bind(t)
    }));

    const requestParams = {
      model: process.env.CLAUDE_CHAT_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: session.systemPrompt || 'You are a helpful CMS assistant integrated into Neon CMS.',
      messages: session.messages,
      tools: sdkTools.map(({ name, description, input_schema }) => ({ name, description, input_schema }))
    };

    // Use streaming messages API
    const stream = anthropic.messages.stream(requestParams);

    const assistantContent = [];
    let currentTextBlock = null;
    let pendingToolUses = new Map(); // id -> { name, input_json }

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          currentTextBlock = { type: 'text', text: '' };
          assistantContent.push(currentTextBlock);
        } else if (event.content_block.type === 'tool_use') {
          const toolBlock = {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            input: {}
          };
          assistantContent.push(toolBlock);
          pendingToolUses.set(event.content_block.id, { toolBlock, inputJson: '' });
          sseWrite(rawReply, { type: 'tool_start', name: event.content_block.name });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          if (currentTextBlock) {
            currentTextBlock.text += event.delta.text;
          }
          sseWrite(rawReply, { type: 'text', delta: event.delta.text });
        } else if (event.delta.type === 'input_json_delta') {
          const pending = pendingToolUses.get(event.index !== undefined
            ? assistantContent.find(b => b.type === 'tool_use' && pendingToolUses.has(b.id))?.id
            : [...pendingToolUses.keys()].at(-1));
          if (pending) pending.inputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        // Finalise tool input JSON
        for (const [id, pending] of pendingToolUses.entries()) {
          if (pending.toolBlock === assistantContent.find(b => b.id === id)) {
            try {
              pending.toolBlock.input = JSON.parse(pending.inputJson || '{}');
            } catch {
              pending.toolBlock.input = {};
            }
          }
        }
      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason === 'tool_use') {
          // Append assistant message with tool_use blocks
          session.messages.push({ role: 'assistant', content: assistantContent.slice() });

          // Execute all tool calls
          const toolResults = [];
          for (const block of assistantContent) {
            if (block.type !== 'tool_use') continue;
            const toolDef = sdkTools.find(t => t.name === block.name);
            let result;
            if (toolDef) {
              try {
                result = await toolDef.run(block.input || {});
              } catch (e) {
                result = JSON.stringify({ error: e.message });
              }
            } else {
              result = JSON.stringify({ error: `Unknown tool: ${block.name}` });
            }
            sseWrite(rawReply, { type: 'tool_end', name: block.name, result: result.substring(0, 500) });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result
            });
          }

          // Add tool results and continue conversation
          session.messages.push({ role: 'user', content: toolResults });

          // Recursive turn for Claude to process tool results
          // Clear current tracking
          assistantContent.length = 0;
          currentTextBlock = null;
          pendingToolUses.clear();

          // Make a follow-up non-streaming call to get Claude's response to tool results
          const followUp = await anthropic.messages.create({
            model: requestParams.model,
            max_tokens: requestParams.max_tokens,
            system: requestParams.system,
            messages: session.messages,
            tools: requestParams.tools,
            stream: true
          });

          for await (const followEvent of followUp) {
            if (followEvent.type === 'content_block_start' && followEvent.content_block.type === 'text') {
              currentTextBlock = { type: 'text', text: '' };
              assistantContent.push(currentTextBlock);
            } else if (followEvent.type === 'content_block_delta' && followEvent.delta.type === 'text_delta') {
              if (currentTextBlock) currentTextBlock.text += followEvent.delta.text;
              sseWrite(rawReply, { type: 'text', delta: followEvent.delta.text });
            }
          }
        }
      }
    }

    // Append final assistant message (text only blocks)
    const finalTextBlocks = assistantContent.filter(b => b.type === 'text' && b.text);
    if (finalTextBlocks.length > 0) {
      session.messages.push({ role: 'assistant', content: finalTextBlocks });
    }

    sseDone(rawReply);

  } catch (err) {
    console.error('[Claude Chat] Error during chat turn:', err);
    sseError(rawReply, err.message || 'An error occurred');
    sseDone(rawReply);
  } finally {
    clearInterval(keepalive);
    if (neonClient) {
      try { await neonClient.logout(); } catch (_) { /* ignore */ }
    }
    rawReply.end();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  handleChatTurn,
  getOrCreateSession,
  buildSystemPrompt
};
