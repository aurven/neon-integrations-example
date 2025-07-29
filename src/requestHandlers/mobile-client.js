const neonBoApi = require("../helpers/neon-bo-api.js");

async function getMobileClientHandler(request, reply) {
  try {
    // TODO: Replace with actual Neon API call to get articles
    const mockArticles = [
      {
        uuid: "article-001",
        title: "Breaking: Major Tech Announcement",
        summary: "A revolutionary new technology has been unveiled that promises to change the industry landscape.",
        lastModified: "2024-01-15T10:30:00Z",
        status: "published"
      },
      {
        uuid: "article-002", 
        title: "Sports Update: Championship Results",
        summary: "The final results from yesterday's championship game with detailed analysis and player statistics.",
        lastModified: "2024-01-14T18:45:00Z",
        status: "draft"
      },
      {
        uuid: "article-003",
        title: "Weather Alert: Storm Warning",
        summary: "Severe weather conditions expected in the region with safety recommendations for residents.",
        lastModified: "2024-01-14T14:20:00Z", 
        status: "published"
      }
    ];

    const params = {
      seo: { title: "Mobile Client - Article Manager" },
      articles: mockArticles
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

async function getMobileClientApiArticlesHandler(request, reply) {
  try {
    // TODO: Replace with actual Neon API call
    const mockArticles = [
      {
        uuid: "article-001",
        title: "Breaking: Major Tech Announcement", 
        summary: "A revolutionary new technology has been unveiled that promises to change the industry landscape.",
        lastModified: "2024-01-15T10:30:00Z",
        status: "published"
      },
      {
        uuid: "article-002",
        title: "Sports Update: Championship Results",
        summary: "The final results from yesterday's championship game with detailed analysis and player statistics.", 
        lastModified: "2024-01-14T18:45:00Z",
        status: "draft"
      },
      {
        uuid: "article-003", 
        title: "Weather Alert: Storm Warning",
        summary: "Severe weather conditions expected in the region with safety recommendations for residents.",
        lastModified: "2024-01-14T14:20:00Z",
        status: "published"
      }
    ];

    return reply.status(200).send({
      success: true,
      articles: mockArticles
    });

  } catch (error) {
    console.error("Error fetching articles:", error);
    return reply.status(500).send({
      success: false,
      error: "Failed to fetch articles"
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
  getMobileClientHandler,
  getMobileClientEditorHandler,
  postMobileClientSaveHandler,
  getMobileClientApiArticlesHandler,
  getMobileClientApiArticleHandler,
  generateArticleXML,
  saveArticleToNeon
};