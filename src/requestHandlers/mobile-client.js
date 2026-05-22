const neonBoApi = require("../helpers/neon-bo-api-v3.js");

/**
 * Fetch and prepare articles from Neon CMS
 * This is the single source of truth for article data
 * @param {number} limit - Number of articles to fetch (default: 10)
 */
async function fetchArticles(limit = 10) {
  // Build search query to fetch articles
  const queryPayload = {
    queryStatement: {
      bool: {
        and: [
          { type: "match", path: "typeName", match: "article*" }
        ]
      },
      sort: {
        type: "fields",
        sorts: [
          { path: "versionInfo.createFamilyTime", order: "DESC" }
        ]
      }
    },
    variables: {
      domain: ["editorial"]
    },
    options: {
      showLoadPublishInfo: true,
      showSystemAttributes: true
    }
  };

  // Fetch articles from Neon using search API
  // Parameters: searchContents(queryPayload, numberOfNodes, numberOfIds)
  // numberOfNodes: number of full node objects to return
  // numberOfIds: number of IDs to return
  // Note: Neon API seems to require both parameters to be set to return nodes
  const searchResults = await neonBoApi.searchContents(queryPayload, limit, limit);

  // Return the complete node data with all properties
  return {
    articles: searchResults.nodes || [],
    count: searchResults.count || 0
  };
}

async function getMobileClientHandler(_request, reply) {
  try {
    // Fetch articles using the centralized function
    const { articles } = await fetchArticles(10);

    const params = {
      seo: { title: "Mobile Client - Article Manager" },
      articles: articles
    };

    return reply.view("/src/pages/mobile-client/index.hbs", params);
  } catch (error) {
    console.error("Error loading mobile client:", error);
    return reply.status(500).send({ error: "Failed to load mobile client" });
  }
}

async function getMobileClientEditorHandler(request, reply) {
  try {
    const articleId = request.query.id;
    let article = null;

    if (articleId) {
      // TODO: Replace with actual Neon API call to get specific article
      console.log(`Loading article for editing: ${articleId}`);
      
      // Mock article data for editing
      article = {
        uuid: articleId,
        title: "Sample Article Title",
        summary: "This is a sample article summary that will be loaded into the editor.",
        content: "<p>This is the main content of the article. It can contain <strong>rich text formatting</strong> and other elements.</p><p>Multiple paragraphs are supported.</p>",
        byline: "John Doe, Staff Writer"
      };
    }

    const params = {
      seo: { title: "Mobile Client - Article Editor" },
      article: article,
      isEditing: !!articleId
    };

    return reply.view("/src/pages/mobile-client/editor.hbs", params);
  } catch (error) {
    console.error("Error loading mobile client editor:", error);
    return reply.status(500).send({ error: "Failed to load editor" });
  }
}

async function postMobileClientSaveHandler(request, reply) {
  try {
    const { headline, summary, content, byline, articleId } = request.body;

    console.log("Saving article:", { headline, summary, byline, articleId });

    // Generate XML structure
    const xmlContent = generateArticleXML(headline, summary, content, byline);
    
    console.log("Generated XML:", xmlContent);

    // TODO: Send to Neon API
    const result = await saveArticleToNeon(xmlContent, articleId);

    return reply.status(200).send({
      success: true,
      message: articleId ? "Article updated successfully" : "Article created successfully",
      articleId: result.articleId,
      xmlContent: xmlContent
    });

  } catch (error) {
    console.error("Error saving article:", error);
    return reply.status(500).send({
      success: false,
      error: "Failed to save article",
      details: error.message
    });
  }
}

async function getMobileClientApiArticlesHandler(_request, reply) {
  try {
    // Fetch articles using the centralized function
    const { articles, count } = await fetchArticles(10);

    return reply.status(200).send({
      success: true,
      articles: articles,
      count: count
    });

  } catch (error) {
    console.error("Error fetching articles:", error);
    return reply.status(500).send({
      success: false,
      error: "Failed to fetch articles",
      details: error.message
    });
  }
}

async function getMobileClientApiArticleHandler(request, reply) {
  try {
    const articleId = request.params.id;
    
    // TODO: Replace with actual Neon API call
    const mockArticle = {
      uuid: articleId,
      title: "Sample Article Title",
      summary: "This is a sample article summary that will be loaded into the editor.",
      content: "<p>This is the main content of the article. It can contain <strong>rich text formatting</strong> and other elements.</p><p>Multiple paragraphs are supported.</p>",
      byline: "John Doe, Staff Writer",
      lastModified: "2024-01-15T10:30:00Z",
      status: "draft"
    };

    return reply.status(200).send({
      success: true,
      article: mockArticle
    });

  } catch (error) {
    console.error("Error fetching article:", error);
    return reply.status(500).send({
      success: false,
      error: "Failed to fetch article"
    });
  }
}

function generateArticleXML(headline, summary, content, byline) {
  // Convert HTML content to XML structure
  const xmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<doc>
  <story>
    <grouphead>
      <headline>
        <p>${escapeXml(headline || '')}</p>
      </headline>
    </grouphead>
    <summary>
      <p>${escapeXml(summary || '')}</p>
    </summary>
    <content>
      ${content || '<p></p>'}
    </content>
    <byline>
      <p>${escapeXml(byline || '')}</p>
    </byline>
  </story>
</doc>`.trim();

  return xmlDoc;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function saveArticleToNeon(xmlContent, articleId = null) {
  try {
    // TODO: Implement actual Neon API integration
    console.log("Saving to Neon CMS:", { xmlContent, articleId });
    
    // Mock response
    const result = {
      articleId: articleId || `article-${Date.now()}`,
      status: "success",
      message: "Article saved to Neon CMS"
    };
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return result;

  } catch (error) {
    console.error("Error saving to Neon:", error);
    throw new Error(`Failed to save article to Neon: ${error.message}`);
  }
}

module.exports = {
  fetchArticles,
  getMobileClientHandler,
  getMobileClientEditorHandler,
  postMobileClientSaveHandler,
  getMobileClientApiArticlesHandler,
  getMobileClientApiArticleHandler,
  generateArticleXML,
  saveArticleToNeon
};