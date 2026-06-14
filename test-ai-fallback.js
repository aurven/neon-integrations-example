#!/usr/bin/env node

/**
 * Test script for AI post generation with Claude → OpenAI fallback
 *
 * Usage:
 *   node test-ai-fallback.js [platform]
 *
 * Examples:
 *   node test-ai-fallback.js bluesky
 *   node test-ai-fallback.js twitter
 *   node test-ai-fallback.js instagram
 */

require('dotenv').config();
const { generatePostContent, extractArticleData, buildArticleUrl } = require('./src/helpers/social-media-helper');

// Mock article data for testing
const mockNeonContext = {
  originalNode: {
    uuid: 'test-article-123',
    title: 'Breaking: New AI Technology Transforms Social Media Marketing',
    abstract: 'Revolutionary AI system helps content creators generate platform-specific social media posts in seconds, boosting engagement by up to 300%.',
    body: `In a groundbreaking development, a new AI-powered system is transforming how content creators approach social media marketing.

The innovative technology leverages advanced language models to automatically generate platform-specific content that resonates with each social network's unique audience and format requirements.

Early adopters report engagement increases of up to 300%, with significant time savings in content creation workflows. The system intelligently adapts tone, emoji usage, and hashtag strategies based on whether content is destined for Instagram, Twitter, Facebook, or emerging platforms like Bluesky and Threads.

"This is a game-changer for our team," says Sarah Chen, Social Media Director at a major publishing company. "What used to take hours now takes minutes, and the quality is consistently high across all platforms."

The technology uses a fallback system, attempting to use Claude (Anthropic) first for superior context understanding, then falling back to OpenAI if needed, ensuring 100% uptime even during API issues.`,
    author: 'Tech Correspondent',
    tags: ['AI', 'Social Media', 'Marketing', 'Technology'],
    category: 'Technology',
    slug: 'ai-transforms-social-media-marketing',
    publishDate: new Date().toISOString()
  },
  channel: {
    frontofficeUrls: ['https://example.com/articles'],
    frontofficeUrl: 'https://example.com/articles'
  }
};

async function testAIGeneration(platform) {
  console.log('\n========================================');
  console.log(`Testing AI Post Generation for: ${platform.toUpperCase()}`);
  console.log('========================================\n');

  // Check configured providers
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_APIKEY;

  console.log('Configuration:');
  console.log(`  Claude (Anthropic): ${hasAnthropic ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`  OpenAI:             ${hasOpenAI ? '✓ Configured' : '✗ Not configured'}`);
  console.log('');

  if (!hasAnthropic && !hasOpenAI) {
    console.error('❌ ERROR: No AI provider configured!');
    console.error('Please set ANTHROPIC_API_KEY or OPENAI_APIKEY in your .env file\n');
    process.exit(1);
  }

  try {
    const articleData = extractArticleData(mockNeonContext);
    const articleUrl = buildArticleUrl(mockNeonContext) || 'https://example.com/article';

    console.log(`Generating post for ${platform}...\n`);

    const startTime = Date.now();
    const result = await generatePostContent(platform, articleData, articleUrl);
    const duration = Date.now() - startTime;

    console.log('✓ Generation successful!\n');
    console.log('Results:');
    console.log('--------');
    console.log(`Provider used: ${result.aiProvider.toUpperCase()}`);
    console.log(`Generation time: ${duration}ms`);
    console.log(`Text length: ${result.text.length} characters`);
    console.log(`Hashtags: ${result.hashtags.length}`);
    console.log('');
    console.log('Generated Post:');
    console.log('---------------');
    console.log(result.text);
    console.log('');
    console.log('Hashtags:');
    console.log(result.hashtags.map(h => `#${h}`).join(' '));
    console.log('');

    if (result.facets) {
      console.log('Rich Text Facets (for Bluesky):');
      console.log(JSON.stringify(result.facets, null, 2));
      console.log('');
    }

    console.log('Full Response Object:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    console.error('');
    console.error('Error details:');
    console.error(error);
    process.exit(1);
  }
}

async function testFallback() {
  console.log('\n========================================');
  console.log('Testing Fallback Mechanism');
  console.log('========================================\n');

  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_APIKEY;

  if (!hasAnthropic && !hasOpenAI) {
    console.error('❌ Cannot test fallback: No AI providers configured');
    process.exit(1);
  }

  if (!hasAnthropic) {
    console.log('⚠️  Claude not configured - will use OpenAI directly (no fallback needed)');
  } else if (!hasOpenAI) {
    console.log('⚠️  OpenAI not configured - will use Claude only (no fallback available)');
  } else {
    console.log('✓ Both providers configured - fallback system active');
  }

  console.log('\nTesting with Twitter (quick test)...\n');
  await testAIGeneration('twitter');
}

// Main execution
const args = process.argv.slice(2);
const platform = args[0] || 'bluesky';

const validPlatforms = ['facebook', 'twitter', 'instagram', 'threads', 'bluesky'];

if (args[0] === 'fallback') {
  testFallback().catch(console.error);
} else if (!validPlatforms.includes(platform)) {
  console.error(`Invalid platform: ${platform}`);
  console.error(`Valid platforms: ${validPlatforms.join(', ')}, or "fallback" to test fallback mechanism`);
  process.exit(1);
} else {
  testAIGeneration(platform).catch(console.error);
}
