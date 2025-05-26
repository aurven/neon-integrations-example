const axios = require('axios');
const { parse } = require('node-html-parser');
const Parser = require('rss-parser');
const utils = require('../helpers/utils.js');

function parseAnsaArticle(html) {
  const root = parse(html);

  // Extract the title
  const headline = root.querySelector('h1.post-single-title')?.text.trim();
  const overhead = root.querySelector('.section-heading li.is-section a')?.text.trim();
  const summary = root.querySelector('.summary.post-single-summary')?.text.trim();

  // Extract the content
  const content = root.querySelector('.post-single-text')?.text.trim();

  // Extract the author
  const author = root.querySelector('.post-single-meta .author')?.text.trim();

  // Extract the publication date
  const publicationDate = root.querySelector('.post-single-meta .details')?.text.trim();

  // Extract the image URL
  const figureUrl = 'https://www.ansa.it' + root.querySelector('figure.image img')?.getAttribute('src');

  // Extract the image caption
  const figureCaption = root.querySelector('figure.image img')?.getAttribute('alt');
  
  const figureCredit = figureCaption.split?.('- ')?.[1];

  // Extract the tags
  const tags = [];
  root.querySelectorAll('#all-tags li').forEach(element => {
    tags.push(element.text.trim());
  });

  
  return {
    headline,
    overhead,
    summary,
    mainContent: content,
    mainContentHtml: utils.textToHtmlParagraphs(content),
    byline: author,
    // publicationDate,
    figureUrl,
    figureCaption,
    // tags,
  };
}

function parseTgcom24Article(html) {
  const root = parse(html);

  // Extract the title
  const headline = root.querySelector('[data-testid="title-container"]')?.text.trim();
  const overhead = root.querySelector('[data-testid="eyelet-test"]')?.text.trim();
  const summary = root.querySelector('[data-testid="text-container"]')?.text.trim();

  // Extract the content
  const paragraphs = [];
  root.querySelectorAll('[data-testid="paragraph-text"] p')
    .forEach?.(p => { paragraphs.push(p.text.trim()) });
  const content = paragraphs.length > 0 ? paragraphs.join('\n').trim() : null;

  // Extract the author
  const author = 'La Redazione';

  // Extract the publication date
  const publicationDate = null;

  // Extract the image URL
  const figureUrl = utils.getLargestSrcFromPicture(
    root.querySelector('[data-testid="leaf-section-header-image"] picture')
  );

  // Extract the image caption
  const agencyIn = root.querySelector('[data-testid="agency-in"]')?.text?.trim?.();
  const figureCaption = agencyIn.split?.('©')?.[0]?.trim?.() || null;
  const figureCredit = agencyIn.split?.('©')?.[1]?.trim?.() | null;

  // Extract the tags
  const tags = [];
  /* root.querySelectorAll('#all-tags li').forEach(element => {
    tags.push(element.text.trim());
  }); */

  
  return {
    headline,
    overhead,
    summary,
    mainContent: content,
    mainContentHtml: content ? utils.textToHtmlParagraphs(content) : null,
    byline: author,
    // publicationDate,
    figureUrl,
    figureCaption,
    // tags,
  };
}


async function getStoriesFromRSS (rssUrl, maxItems) {
  const parser = new Parser();
  const feed = await parser.parseURL(rssUrl);
  
  const selectedItems = maxItems ? feed.items.slice(0, maxItems) : feed.items;
  
  return selectedItems.map(item => ({
    title: item.title,
    description: item.content || item.description,
    date: item.isoDate || item.pubDate,
    url: item.link
  }))
}

function getParserFunctionByUrl(url) {
  if (/https?:\/\/(www\.)?ansa\.it/.test(url)) {
    return parseAnsaArticle;
  } else if (/https?:\/\/(www\.)?tgcom24\.mediaset\.it/.test(url)) {
    return parseTgcom24Article;
  } else if (/https?:\/\/(www\.)?sportmediaset\.mediaset\.it/.test(url)) {
    return parseTgcom24Article;
  }

  return null; // Fallback if no parser matches
}


async function getStoryContent(storyUrl) {
    const articleParser = getParserFunctionByUrl(storyUrl);
  
    return await axios.get(storyUrl)
        .then(response => {
            if (response.status === 200) {
                const data = response.data;
              
                return articleParser(response.data);
            }
        })
        .catch(error => {
            console.log(`❌ Error: ${error}`);
        });
}

async function getItems ({ rssUrl, maxItems = 5 }) {
  const stories = await getStoriesFromRSS (rssUrl, maxItems);
  
  return await Promise.all(stories.map(async story => {
    const storyContent = await getStoryContent(story.url);
    
    return Object.assign({}, story, storyContent);
  }))
}

module.exports = {
  getItems,
};