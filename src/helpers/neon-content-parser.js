/**
 * Neon Content Parser
 * Parses Neon CMS article data structure to extract content for PDF generation
 */

/**
 * Extract plain text from XML-like element structure
 * @param {Array} elements - Array of element objects
 * @returns {string} - Concatenated plain text
 */
function extractTextFromElements(elements) {
  if (!elements || !Array.isArray(elements)) {
    return '';
  }

  let text = '';

  for (const element of elements) {
    if (element.nodeType === 'plainText' && element.value) {
      text += element.value;
    } else if (element.nodeType === 'p' && element.elements) {
      // Recursively extract text from paragraph elements
      const paragraphText = extractTextFromElements(element.elements);
      if (paragraphText) {
        text += (text ? '\n\n' : '') + paragraphText;
      }
    } else if (element.elements) {
      // Recursively process nested elements
      const nestedText = extractTextFromElements(element.elements);
      if (nestedText) {
        text += (text ? ' ' : '') + nestedText;
      }
    }
  }

  return text.trim();
}

/**
 * Find element by nodeType in elements array
 * @param {Array} elements - Array of element objects
 * @param {string} nodeType - Type of node to find
 * @returns {Object|null} - Found element or null
 */
function findElementByNodeType(elements, nodeType) {
  if (!elements || !Array.isArray(elements)) {
    return null;
  }

  for (const element of elements) {
    if (element.nodeType === nodeType) {
      return element;
    }
    // Search recursively in nested elements
    if (element.elements) {
      const found = findElementByNodeType(element.elements, nodeType);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Find all elements by nodeType in elements array
 * @param {Array} elements - Array of element objects
 * @param {string} nodeType - Type of node to find
 * @returns {Array} - Array of found elements
 */
function findAllElementsByNodeType(elements, nodeType) {
  if (!elements || !Array.isArray(elements)) {
    return [];
  }

  const found = [];

  for (const element of elements) {
    if (element.nodeType === nodeType) {
      found.push(element);
    }
    // Search recursively in nested elements
    if (element.elements) {
      found.push(...findAllElementsByNodeType(element.elements, nodeType));
    }
  }

  return found;
}

/**
 * Extract cover image URL from web-image-group
 * @param {Array} elements - Story elements
 * @param {string} neonBaseUrl - Base URL for Neon resources
 * @returns {Object|null} - Image data or null
 */
function extractCoverImage(elements, neonBaseUrl) {
  const imageGroup = findElementByNodeType(elements, 'web-image-group');

  if (!imageGroup || !imageGroup.elements) {
    return null;
  }

  // Find the first "Wide" crop image
  const wideImage = imageGroup.elements.find(
    el => el.nodeType === 'image' && el.attributes?.softCrop === 'Wide'
  );

  if (!wideImage || !wideImage.attributes?.src) {
    // Fallback to first image if no Wide crop found
    const firstImage = imageGroup.elements.find(el => el.nodeType === 'image');
    if (!firstImage || !firstImage.attributes?.src) {
      return null;
    }

    return {
      url: neonBaseUrl + firstImage.attributes.src,
      crop: firstImage.attributes.softCrop || 'default'
    };
  }

  // Extract caption if available
  const captionGroup = findElementByNodeType(imageGroup.elements, 'web-image-caption');
  let caption = null;
  let credit = null;

  if (captionGroup) {
    const captionElement = findElementByNodeType(captionGroup.elements, 'caption');
    const creditElement = findElementByNodeType(captionGroup.elements, 'credit');

    if (captionElement) {
      caption = extractTextFromElements(captionElement.elements);
    }
    if (creditElement) {
      credit = extractTextFromElements(creditElement.elements);
    }
  }

  return {
    url: neonBaseUrl + wideImage.attributes.src,
    crop: 'Wide',
    caption,
    credit
  };
}

/**
 * Extract body paragraphs from text elements
 * @param {Array} elements - Story elements
 * @returns {Array} - Array of paragraph strings
 */
function extractBodyParagraphs(elements) {
  const textElement = findElementByNodeType(elements, 'text');

  if (!textElement || !textElement.elements) {
    return [];
  }

  const paragraphs = [];

  for (const element of textElement.elements) {
    if (element.nodeType === 'p') {
      const paragraphText = extractTextFromElements(element.elements);
      if (paragraphText && paragraphText.trim()) {
        paragraphs.push(paragraphText.trim());
      }
    }
  }

  return paragraphs;
}

/**
 * Parse Neon article object to extract content for PDF
 * @param {Object} neonObject - Neon CMS article object
 * @returns {Object} - Parsed article data
 */
function parseNeonArticleContent(neonObject) {
  const neonBaseUrl = process.env.NEON_BO_URL || '';

  // Extract root-level metadata
  const rootData = neonObject.rootData || neonObject;
  const pubInfo = rootData.pubInfo || {};
  const sys = rootData.sys || {};
  const files = rootData.files || {};
  const contentFile = files.content || {};
  const contentData = contentFile.data || {};

  // Find story element
  const storyElement = contentData.elements?.find(el => el.nodeType === 'story');
  const storyElements = storyElement?.elements || [];

  // Extract grouphead (overhead + headline)
  const grouphead = findElementByNodeType(storyElements, 'grouphead');
  let overhead = null;
  let headline = null;

  if (grouphead && grouphead.elements) {
    const overheadElement = findElementByNodeType(grouphead.elements, 'overhead');
    const headlineElement = findElementByNodeType(grouphead.elements, 'headline');

    if (overheadElement) {
      overhead = extractTextFromElements(overheadElement.elements);
    }
    if (headlineElement) {
      headline = extractTextFromElements(headlineElement.elements);
    }
  }

  // Extract summary
  const summaryElement = findElementByNodeType(storyElements, 'summary');
  const summary = summaryElement ? extractTextFromElements(summaryElement.elements) : rootData.summary;

  // Extract byline
  const bylineElement = findElementByNodeType(storyElements, 'byline');
  const byline = bylineElement ? extractTextFromElements(bylineElement.elements) : null;

  // Extract cover image
  const coverImage = extractCoverImage(storyElements, neonBaseUrl);

  // Extract body paragraphs
  const bodyParagraphs = extractBodyParagraphs(storyElements);

  // Build authors array
  const authors = rootData.authors || [];
  const authorString = byline || (authors.length > 0 ? authors.join(', ') : null);

  return {
    // Metadata
    title: headline || rootData.title || 'Untitled',
    overhead: overhead,
    summary: summary || '',
    author: authorString,
    authors: authors,

    // Publication info
    siteName: pubInfo.siteName || 'Publication',
    sectionPath: pubInfo.sectionPath || '/',
    publicationTime: pubInfo.publicationTime || sys.creationTime || new Date().toISOString(),
    status: pubInfo.status || 'DRAFT',

    // Content
    coverImage: coverImage,
    bodyParagraphs: bodyParagraphs,
    bodyText: bodyParagraphs.join('\n\n'),

    // System info
    objectId: rootData.id,
    version: rootData.version,
    createdBy: sys.createdBy?.userName || 'Unknown',
    updatedBy: sys.updatedBy?.userName || 'Unknown',
    updateTime: sys.updateTime || sys.creationTime
  };
}

module.exports = {
  parseNeonArticleContent,
  extractTextFromElements,
  findElementByNodeType,
  findAllElementsByNodeType,
  extractCoverImage,
  extractBodyParagraphs
};
