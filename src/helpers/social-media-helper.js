const OpenAI = require('openai');
const { parseRichText } = require('../connectors/bluesky-connector');

/**
 * Social Media Helper
 * Handles AI content generation and platform-specific formatting
 */

// Platform configurations
const PLATFORM_CONFIGS = {
  facebook: {
    maxLength: 63206,
    tone: 'friendly and engaging',
    emojiLevel: 'moderate',
    hashtagStyle: 'minimal',
    urlPlacement: 'end'
  },
  twitter: {
    maxLength: 280,
    tone: 'concise and impactful',
    emojiLevel: 'light',
    hashtagStyle: 'strategic',
    urlPlacement: 'end'
  },
  instagram: {
    maxLength: 2200,
    tone: 'visual and inspirational',
    emojiLevel: 'high',
    hashtagStyle: 'extensive',
    urlPlacement: 'bio-or-story' // Instagram doesn't support clickable links in captions
  },
  threads: {
    maxLength: 500,
    tone: 'conversational and authentic',
    emojiLevel: 'moderate',
    hashtagStyle: 'natural',
    urlPlacement: 'end'
  },
  bluesky: {
    maxLength: 300,
    tone: 'informative and community-focused',
    emojiLevel: 'light',
    hashtagStyle: 'minimal',
    urlPlacement: 'integrated'
  }
};

/**
 * Initialize OpenAI client
 * @returns {OpenAI} OpenAI client instance
 */
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_APIKEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set OPENAI_APIKEY in .env');
  }

  return new OpenAI({ apiKey });
}

/**
 * Generate social media post content using AI
 * @param {string} platform - Target platform (facebook, twitter, instagram, threads, bluesky)
 * @param {Object} articleData - Article data from Neon context
 * @param {string} articleUrl - URL to include in the post
 * @param {Object} options - Additional generation options
 * @returns {Promise<Object>} Generated content with text and hashtags
 */
async function generatePostContent(platform, articleData, articleUrl, options = {}) {
  try {
    const config = PLATFORM_CONFIGS[platform];

    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`[Social Media Helper] Generating content for ${platform}`);

    const openai = getOpenAIClient();

    // Extract article information
    const title = articleData.title || articleData.name || 'Untitled Article';
    const abstract = articleData.abstract || articleData.description || '';
    const body = articleData.body || articleData.content || '';

    // Truncate body for context (first 1000 chars)
    const bodyPreview = body.length > 1000 ? body.substring(0, 1000) + '...' : body;

    // Build AI prompt
    const prompt = `You are a professional social media manager creating a post for ${platform}.

Article Information:
- Title: ${title}
- Abstract: ${abstract}
- Content Preview: ${bodyPreview}
- Article URL: ${articleUrl}

Platform Guidelines:
- Maximum Length: ${config.maxLength} characters
- Tone: ${config.tone}
- Emoji Usage: ${config.emojiLevel}
- Hashtag Style: ${config.hashtagStyle}
- URL Placement: ${config.urlPlacement}

Task: Create an engaging social media post that:
1. Captures the essence of the article
2. Matches the ${platform} platform style and tone
3. Includes relevant hashtags (3-5 for most platforms, more for Instagram)
4. Includes the article URL ${articleUrl}
5. Stays within the character limit
6. Uses appropriate emojis based on the emoji level
7. Is engaging and encourages clicks

${platform === 'instagram' ? 'Note: For Instagram, the URL should be mentioned but note that links in captions are not clickable. Users should check bio or story for the link.' : ''}

Please respond with a JSON object in this exact format:
{
  "text": "The complete post text including emojis and URL",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "characterCount": 250
}

Important: Make sure the total character count (text + hashtags) is under ${config.maxLength} characters.`;

    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert social media content creator. Always respond with valid JSON only, no additional text or markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 500
    });

    const generatedContent = response.choices[0].message.content.trim();

    // Parse JSON response
    let parsedContent;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = generatedContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                        generatedContent.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : generatedContent;
      parsedContent = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('[Social Media Helper] Failed to parse AI response as JSON:', generatedContent);
      throw new Error('AI response was not valid JSON');
    }

    // Validate and format response
    const result = {
      text: parsedContent.text || '',
      hashtags: Array.isArray(parsedContent.hashtags) ? parsedContent.hashtags : [],
      characterCount: parsedContent.characterCount || parsedContent.text.length,
      platform: platform,
      generatedAt: new Date().toISOString()
    };

    // For Bluesky, parse rich text facets
    if (platform === 'bluesky') {
      const richText = parseRichText(result.text);
      result.facets = richText.facets;
    }

    console.log(`[Social Media Helper] Generated content for ${platform}:`, {
      textLength: result.text.length,
      hashtagCount: result.hashtags.length
    });

    return result;
  } catch (error) {
    console.error('[Social Media Helper] Content generation failed:', error);
    throw new Error(`Failed to generate content: ${error.message}`);
  }
}

/**
 * Build article URL from Neon context
 * @param {Object} neonContext - Neon context with channel and article info
 * @returns {string} Article URL
 */
function buildArticleUrl(neonContext) {
  try {
    // Try to extract URL from channel configuration
    const channel = neonContext.channel;
    const originalNode = neonContext.originalNode;

    if (!channel || !originalNode) {
      throw new Error('Missing channel or article data in context');
    }

    // Get frontoffice URL from channel
    const frontofficeUrl = channel.frontofficeUrls?.[0] || channel.frontofficeUrl;

    if (!frontofficeUrl) {
      console.warn('[Social Media Helper] No frontoffice URL found in channel config');
      return null;
    }

    // Build article path
    // Assuming article slug or ID is in originalNode
    const articleSlug = originalNode.slug || originalNode.name || originalNode.uuid;

    // Construct full URL
    const fullUrl = `${frontofficeUrl}/${articleSlug}`;

    console.log(`[Social Media Helper] Built article URL: ${fullUrl}`);

    return fullUrl;
  } catch (error) {
    console.error('[Social Media Helper] Failed to build article URL:', error);
    return null;
  }
}

/**
 * Validate social media content against platform rules
 * @param {string} platform - Platform name
 * @param {string} text - Post text
 * @param {Array<string>} hashtags - Hashtags
 * @returns {Object} Validation result
 */
function validateContent(platform, text, hashtags = []) {
  const config = PLATFORM_CONFIGS[platform];

  if (!config) {
    return {
      valid: false,
      errors: [`Unsupported platform: ${platform}`]
    };
  }

  const errors = [];
  const warnings = [];

  // Combine text and hashtags for total length
  const hashtagString = hashtags.map(h => `#${h}`).join(' ');
  const totalText = `${text} ${hashtagString}`.trim();
  const totalLength = totalText.length;

  // Check character limit
  if (totalLength > config.maxLength) {
    errors.push(`Content exceeds ${config.maxLength} character limit (current: ${totalLength})`);
  }

  // Platform-specific validations
  if (platform === 'instagram') {
    // Instagram requires images
    warnings.push('Instagram posts require at least one image');

    // Recommend more hashtags for Instagram
    if (hashtags.length < 5) {
      warnings.push('Instagram performs better with 5-30 hashtags');
    }
  }

  if (platform === 'twitter') {
    // Twitter has strict character limit
    if (totalLength > 280) {
      errors.push(`Twitter limit is 280 characters (current: ${totalLength})`);
    }
  }

  // Check for URL presence
  const hasUrl = /https?:\/\/[^\s]+/.test(text);
  if (!hasUrl && platform !== 'instagram') {
    warnings.push('No URL found in post text');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalLength,
      textLength: text.length,
      hashtagCount: hashtags.length,
      characterLimit: config.maxLength,
      remainingChars: config.maxLength - totalLength
    }
  };
}

/**
 * Format hashtags for a specific platform
 * @param {Array<string>} hashtags - Raw hashtag strings
 * @param {string} platform - Target platform
 * @returns {string} Formatted hashtag string
 */
function formatHashtags(hashtags, platform) {
  if (!hashtags || hashtags.length === 0) {
    return '';
  }

  // Remove # if already present and clean up
  const cleanHashtags = hashtags.map(tag => {
    const cleaned = tag.replace(/^#/, '').replace(/[^\w]/g, '');
    return `#${cleaned}`;
  });

  // Platform-specific formatting
  switch (platform) {
    case 'instagram':
      // Instagram: all hashtags at the end, separated by spaces
      return '\n\n' + cleanHashtags.join(' ');

    case 'twitter':
    case 'bluesky':
      // Twitter/Bluesky: concise, at the end or inline
      return ' ' + cleanHashtags.slice(0, 3).join(' ');

    case 'facebook':
    case 'threads':
      // Facebook/Threads: moderate, at the end
      return '\n' + cleanHashtags.slice(0, 5).join(' ');

    default:
      return ' ' + cleanHashtags.join(' ');
  }
}

/**
 * Extract article data from Neon context for AI generation
 * @param {Object} neonContext - Neon context object
 * @returns {Object} Extracted article data
 */
function extractArticleData(neonContext) {
  const node = neonContext.originalNode;

  if (!node) {
    throw new Error('No article data found in Neon context');
  }

  return {
    title: node.title || node.name || 'Untitled',
    abstract: node.abstract || node.description || '',
    body: node.body || node.content || '',
    author: node.author || null,
    tags: node.tags || [],
    category: node.category || null,
    publishDate: node.publishDate || node.createdAt || null
  };
}

module.exports = {
  generatePostContent,
  buildArticleUrl,
  validateContent,
  formatHashtags,
  extractArticleData,
  PLATFORM_CONFIGS
};
