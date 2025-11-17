const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

async function getNeonWebhookHandler(request, reply) {
  return {"status":"success"};
}

async function postNeonWebhookHandler(request, reply) {
  console.log("postNeonWebhookHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Neon webhook received:");
  console.log(JSON.stringify(safeRequest.body));

  if (!request.body) {
    console.error("postNeonWebhookHandler << ERROR: Missing request body");
    return reply.status(400).send({ error: "Missing request body" });
  }

  try {
    let result;
    
    // Check if this is a Neon model or other webhook format
    if (request.body.model || request.body.nodes || request.body.contentData) {
      // This is a Neon model - process as webhook
      result = await processNeonWebhook(request.body);
    } else {
      console.error("postNeonWebhookHandler << ERROR: Invalid request format - expected Neon model with 'model', 'nodes', or 'contentData'");
      return reply.status(400).send({ 
        error: "Invalid request format - expected Neon model with 'model', 'nodes', or 'contentData'" 
      });
    }
    
    const response = {
      message: "Neon webhook processed",
      data: result,
    };
    
    console.log("postNeonWebhookHandler << OUT:");
    console.log("Response Data:", response);
    
    return reply.status(200).send(response);
  } catch (error) {
    console.error("postNeonWebhookHandler << ERROR: Error processing webhook:", error);
    const errorResponse = {
      error: "Failed to process Neon webhook",
      details: error.message,
    };
    console.log("postNeonWebhookHandler << ERROR:");
    console.log("Error Response:", errorResponse);
    return reply.status(500).send(errorResponse);
  }
}

async function processNeonWebhook(neonModel) {
  try {
    console.log("Processing Neon webhook with model:", JSON.stringify(neonModel, null, 2));
    
    // Extract basic information from the Neon model
    const modelData = neonModel.data || neonModel;
    const title = modelData.title || "Untitled";
    const id = modelData.id || "unknown";
    
    // Extract webhook trigger conditions
    // TODO: Change this item when you gather model infos - these should come from the actual webhook payload
    const site = neonModel.site || "TheGlobe"; // Mock value
    const type = neonModel.type || "article"; // Mock value  
    const webhookTrigger = neonModel.webhookTrigger || "Created"; // Mock value
    
    console.log(`Processing Neon webhook: Site="${site}", Type="${type}", Trigger="${webhookTrigger}", Content="${title}" (ID: ${id})`);
    
    // Route to appropriate handler based on conditions
    const result = await routeWebhookByConditions(site, type, webhookTrigger, neonModel);
    
    return {
      processed: true,
      contentId: id,
      contentTitle: title,
      contentType: type,
      site: site,
      webhookTrigger: webhookTrigger,
      processedAt: new Date().toISOString(),
      message: `Successfully processed Neon webhook for ${site}`,
      handlerResult: result
    };
    
  } catch (error) {
    console.error("Error processing Neon webhook:", error);
    throw new Error(`Failed to process Neon webhook: ${error.message}`);
  }
}

async function routeWebhookByConditions(site, type, webhookTrigger, neonModel) {
  console.log(`Routing webhook: ${site} -> ${type} -> ${webhookTrigger}`);
  
  try {
    // Route based on site first
    switch (site) {
      case "TheGlobe":
        return await handleTheGlobeWebhook(type, webhookTrigger, neonModel);
      
      case "NextFrontier":
        return await handleNextFrontierWebhook(type, webhookTrigger, neonModel);
      
      case "SportsArena":
        return await handleSportsArenaWebhook(type, webhookTrigger, neonModel);
      
      default:
        console.warn(`Unknown site: ${site}, using default handler`);
        return await handleDefaultWebhook(type, webhookTrigger, neonModel);
    }
  } catch (error) {
    console.error(`Error routing webhook for ${site}:`, error);
    throw new Error(`Failed to route webhook for site ${site}: ${error.message}`);
  }
}

async function handleTheGlobeWebhook(type, webhookTrigger, neonModel) {
  console.log(`Handling TheGlobe webhook: ${type} -> ${webhookTrigger}`);
  
  switch (type) {
    case "article":
      return await handleTheGlobeArticle(webhookTrigger, neonModel);
    case "gallery":
      return await handleTheGlobeGallery(webhookTrigger, neonModel);
    case "liveblog":
      return await handleTheGlobeLiveblog(webhookTrigger, neonModel);
    case "webpage":
      return await handleTheGlobeWebpage(webhookTrigger, neonModel);
    default:
      console.warn(`Unknown content type for TheGlobe: ${type}`);
      return { status: "warning", message: `Unknown content type: ${type}` };
  }
}

async function handleNextFrontierWebhook(type, webhookTrigger, neonModel) {
  console.log(`Handling NextFrontier webhook: ${type} -> ${webhookTrigger}`);
  
  switch (type) {
    case "article":
      return await handleNextFrontierArticle(webhookTrigger, neonModel);
    case "gallery":
      return await handleNextFrontierGallery(webhookTrigger, neonModel);
    case "liveblog":
      return await handleNextFrontierLiveblog(webhookTrigger, neonModel);
    case "webpage":
      return await handleNextFrontierWebpage(webhookTrigger, neonModel);
    default:
      console.warn(`Unknown content type for NextFrontier: ${type}`);
      return { status: "warning", message: `Unknown content type: ${type}` };
  }
}

async function handleSportsArenaWebhook(type, webhookTrigger, neonModel) {
  console.log(`Handling SportsArena webhook: ${type} -> ${webhookTrigger}`);
  
  switch (type) {
    case "article":
      return await handleSportsArenaArticle(webhookTrigger, neonModel);
    case "gallery":
      return await handleSportsArenaGallery(webhookTrigger, neonModel);
    case "liveblog":
      return await handleSportsArenaLiveblog(webhookTrigger, neonModel);
    case "webpage":
      return await handleSportsArenaWebpage(webhookTrigger, neonModel);
    default:
      console.warn(`Unknown content type for SportsArena: ${type}`);
      return { status: "warning", message: `Unknown content type: ${type}` };
  }
}

async function handleDefaultWebhook(type, webhookTrigger, neonModel) {
  console.log(`Handling default webhook: ${type} -> ${webhookTrigger}`);
  return { 
    status: "processed", 
    message: `Default handler processed: ${type} ${webhookTrigger}`,
    data: neonModel 
  };
}

// TheGlobe content type handlers
async function handleTheGlobeArticle(webhookTrigger, neonModel) {
  console.log(`TheGlobe Article: ${webhookTrigger}`);
  
  switch (webhookTrigger) {
    case "Created":
      return await handleTheGlobeArticleCreated(neonModel);
    case "Updated":
      return await handleTheGlobeArticleUpdated(neonModel);
    case "Deleted":
      // TODO: Add logic for article deletion
      return { status: "success", action: "TheGlobe article deleted", data: neonModel };
    case "MakeVisible":
      return await handleTheGlobeArticleMadeVisible(neonModel);
    case "MakeInvisible":
      // TODO: Add logic for making article invisible
      return { status: "success", action: "TheGlobe article made invisible", data: neonModel };
    default:
      console.warn(`Unknown trigger for TheGlobe article: ${webhookTrigger}`);
      return { status: "warning", message: `Unknown trigger: ${webhookTrigger}` };
  }
}

async function handleTheGlobeArticleCreated(neonModel) {
  const telegramService = require("../telegram/telegram.js");
  
  try {
    console.log("Processing TheGlobe article creation - posting to Telegram");
    
    // Post the new article to Telegram
    const telegramResult = await telegramService.postTheGlobeArticleToTelegram(neonModel);
    
    return {
      status: "success",
      action: "TheGlobe article created and posted to Telegram",
      data: neonModel,
      telegramResult: telegramResult
    };
    
  } catch (error) {
    console.error("Error handling TheGlobe article creation:", error);
    
    // Return partial success - article was created but Telegram posting failed
    return {
      status: "partial_success",
      action: "TheGlobe article created but Telegram posting failed",
      data: neonModel,
      error: error.message
    };
  }
}

async function handleTheGlobeArticleUpdated(neonModel) {
  const telegramService = require("../telegram/telegram.js");
  
  try {
    console.log("Processing TheGlobe article update - posting to Telegram");
    
    // Post the article update to Telegram
    const telegramResult = await telegramService.postTheGlobeArticleUpdate(neonModel);
    
    return {
      status: "success",
      action: "TheGlobe article updated and posted to Telegram",
      data: neonModel,
      telegramResult: telegramResult
    };
    
  } catch (error) {
    console.error("Error handling TheGlobe article update:", error);
    
    return {
      status: "partial_success", 
      action: "TheGlobe article updated but Telegram posting failed",
      data: neonModel,
      error: error.message
    };
  }
}

async function handleTheGlobeArticleMadeVisible(neonModel) {
  const telegramService = require("../telegram/telegram.js");
  
  try {
    console.log("Processing TheGlobe article made visible - posting to Telegram");
    
    // When an article is made visible, treat it like a new publication
    const telegramResult = await telegramService.postTheGlobeArticleToTelegram(neonModel);
    
    return {
      status: "success",
      action: "TheGlobe article made visible and posted to Telegram",
      data: neonModel,
      telegramResult: telegramResult
    };
    
  } catch (error) {
    console.error("Error handling TheGlobe article made visible:", error);
    
    return {
      status: "partial_success",
      action: "TheGlobe article made visible but Telegram posting failed", 
      data: neonModel,
      error: error.message
    };
  }
}

async function handleTheGlobeGallery(webhookTrigger, neonModel) {
  console.log(`TheGlobe Gallery: ${webhookTrigger}`);
  // TODO: Implement gallery-specific logic for each trigger
  return { status: "success", action: `TheGlobe gallery ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleTheGlobeLiveblog(webhookTrigger, neonModel) {
  console.log(`TheGlobe Liveblog: ${webhookTrigger}`);
  // TODO: Implement liveblog-specific logic for each trigger
  return { status: "success", action: `TheGlobe liveblog ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleTheGlobeWebpage(webhookTrigger, neonModel) {
  console.log(`TheGlobe Webpage: ${webhookTrigger}`);
  // TODO: Implement webpage-specific logic for each trigger
  return { status: "success", action: `TheGlobe webpage ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

// NextFrontier content type handlers
async function handleNextFrontierArticle(webhookTrigger, neonModel) {
  console.log(`NextFrontier Article: ${webhookTrigger}`);
  // TODO: Implement NextFrontier article-specific logic for each trigger
  return { status: "success", action: `NextFrontier article ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleNextFrontierGallery(webhookTrigger, neonModel) {
  console.log(`NextFrontier Gallery: ${webhookTrigger}`);
  // TODO: Implement NextFrontier gallery-specific logic for each trigger
  return { status: "success", action: `NextFrontier gallery ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleNextFrontierLiveblog(webhookTrigger, neonModel) {
  console.log(`NextFrontier Liveblog: ${webhookTrigger}`);
  // TODO: Implement NextFrontier liveblog-specific logic for each trigger
  return { status: "success", action: `NextFrontier liveblog ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleNextFrontierWebpage(webhookTrigger, neonModel) {
  console.log(`NextFrontier Webpage: ${webhookTrigger}`);
  // TODO: Implement NextFrontier webpage-specific logic for each trigger
  return { status: "success", action: `NextFrontier webpage ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

// SportsArena content type handlers
async function handleSportsArenaArticle(webhookTrigger, neonModel) {
  console.log(`SportsArena Article: ${webhookTrigger}`);
  // TODO: Implement SportsArena article-specific logic for each trigger
  return { status: "success", action: `SportsArena article ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleSportsArenaGallery(webhookTrigger, neonModel) {
  console.log(`SportsArena Gallery: ${webhookTrigger}`);
  // TODO: Implement SportsArena gallery-specific logic for each trigger
  return { status: "success", action: `SportsArena gallery ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleSportsArenaLiveblog(webhookTrigger, neonModel) {
  console.log(`SportsArena Liveblog: ${webhookTrigger}`);
  // TODO: Implement SportsArena liveblog-specific logic for each trigger
  return { status: "success", action: `SportsArena liveblog ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function handleSportsArenaWebpage(webhookTrigger, neonModel) {
  console.log(`SportsArena Webpage: ${webhookTrigger}`);
  // TODO: Implement SportsArena webpage-specific logic for each trigger
  return { status: "success", action: `SportsArena webpage ${webhookTrigger.toLowerCase()}`, data: neonModel };
}

async function postNeonWebhookTest(request, reply) {
  console.log("postNeonWebhookTest << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  // TODO - Restore when we can add ApiKeys to Webhooks headers
  // const auth = authenticate(request, reply);
  // if (!auth.authenticated) {
  //   console.log("Received call, but no API key was passed.");
  //   return reply.status(401).send({ error: "Unauthorized" });
  // }
  
  console.log("Neon webhook test received:");
  console.log(JSON.stringify(safeRequest.body));

  if (!request.body) {
    console.error("postNeonWebhookTest << ERROR: Missing request body");
    return reply.status(400).send({ error: "Missing request body" });
  }

  try {
    let result;
    
    // Check if this is a Neon model or other webhook format
    if (request.body.model || request.body.nodes || request.body.contentData) {
      // This is a Neon model - process as webhook
      result = await processNeonWebhook(request.body);
    } else {
      console.error("postNeonWebhookTest << ERROR: Invalid request format - expected Neon model with 'model', 'nodes', or 'contentData'");
      return reply.status(400).send({ 
        error: "Invalid request format - expected Neon model with 'model', 'nodes', or 'contentData'" 
      });
    }
    
    const response = {
      message: "Neon webhook test processed",
      data: result,
    };
    
    console.log("postNeonWebhookTest << OUT:");
    console.log("Response Data:", response);
    
    return reply.status(200).send(response);
  } catch (error) {
    console.error("postNeonWebhookTest << ERROR: Error processing webhook:", error);
    const errorResponse = {
      error: "Failed to process Neon webhook test",
      details: error.message,
    };
    console.log("postNeonWebhookTest << ERROR:");
    console.log("Error Response:", errorResponse);
    return reply.status(500).send(errorResponse);
  }
}

/**
 * Handle Social Media publishing from Neon webhook
 * Called when article is published and has socialMediaDraft metadata
 * @param {Object} neonModel - Neon webhook model
 * @returns {Promise<Object>} Writeback data with social post IDs
 */
async function handleSocialMediaPublish(neonModel) {
  console.log('[Social Media Webhook] Processing social media publish request');

  const blueskyConnector = require('../connectors/bluesky-connector');

  try {
    // Extract article metadata
    const modelData = neonModel.data || neonModel;
    const metadata = modelData.metadata || {};
    const socialMediaDraft = metadata.socialMediaDraft;

    if (!socialMediaDraft) {
      console.log('[Social Media Webhook] No socialMediaDraft found in metadata');
      return { status: 'skipped', message: 'No social media draft data' };
    }

    console.log('[Social Media Webhook] Found social media draft:', socialMediaDraft);

    // Extract user info (who triggered the publish)
    const publishedBy = neonModel.user || neonModel.publisher || 'system@neon.com';

    // Writeback object (only platforms that were successfully published)
    const socialMediaHook = {};

    // Process each enabled platform
    for (const [platform, draft] of Object.entries(socialMediaDraft)) {
      if (!draft.enabled) {
        console.log(`[Social Media Webhook] ${platform} not enabled, skipping`);
        continue;
      }

      console.log(`[Social Media Webhook] Publishing to ${platform}...`);

      try {
        if (platform === 'bluesky') {
          // Publish to Bluesky
          const postText = draft.text || '';
          const hashtags = draft.hashtags || [];

          // Combine text with hashtags
          const hashtagString = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
          const fullText = hashtagString ? `${postText}\n\n${hashtagString}` : postText;

          // Parse rich text for facets
          const richText = blueskyConnector.parseRichText(fullText);

          const result = await blueskyConnector.publishPost(richText.text, {
            facets: richText.facets
          });

          if (result.success) {
            socialMediaHook.bluesky = {
              postId: result.postUri,
              url: result.postUrl,
              publishedAt: result.publishedAt,
              publishedBy: publishedBy
            };

            console.log(`[Social Media Webhook] ✓ Published to Bluesky: ${result.postUrl}`);
          }
        } else {
          // Other platforms not implemented yet
          console.log(`[Social Media Webhook] ${platform} publishing not implemented yet`);
        }
      } catch (error) {
        console.error(`[Social Media Webhook] Failed to publish to ${platform}:`, error.message);
        // Continue with other platforms even if one fails
      }
    }

    // Return writeback data
    if (Object.keys(socialMediaHook).length > 0) {
      console.log('[Social Media Webhook] Social media publish successful:', socialMediaHook);

      return {
        status: 'success',
        action: 'Social media posts published',
        writeback: {
          socialMediaHook: socialMediaHook
        }
      };
    } else {
      console.log('[Social Media Webhook] No platforms were successfully published');
      return {
        status: 'warning',
        message: 'No platforms were successfully published'
      };
    }

  } catch (error) {
    console.error('[Social Media Webhook] Error processing social media publish:', error);
    return {
      status: 'error',
      message: 'Failed to publish to social media',
      error: error.message
    };
  }
}

module.exports = {
  getNeonWebhookHandler,
  postNeonWebhookHandler,
  postNeonWebhookTest,
  handleSocialMediaPublish
};