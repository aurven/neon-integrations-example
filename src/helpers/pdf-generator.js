/**
 * PDF Generator for Neon Articles
 * Generates professional PDF reports using PDFKit
 */

const PDFDocument = require('pdfkit');
const axios = require('axios');

/**
 * Download image from URL
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      // Bypass SSL verification for local development if needed
      httpsAgent: process.env.NEON_EXT_LOCATION === 'Local'
        ? new (require('https').Agent)({ rejectUnauthorized: false })
        : undefined
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Failed to download image from ${url}:`, error.message);
    return null;
  }
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Split text into chunks that fit in columns
 * @param {PDFDocument} doc - PDF document
 * @param {string} text - Text to split
 * @param {number} columnWidth - Width of column
 * @returns {Array} - Array of text chunks
 */
function splitTextForColumns(doc, text, columnWidth) {
  const paragraphs = text.split('\n\n');
  return paragraphs;
}

/**
 * Calculate text height for given width
 * @param {PDFDocument} doc - PDF document
 * @param {string} text - Text to measure
 * @param {number} width - Width constraint
 * @param {Object} options - Text options
 * @returns {number} - Calculated height
 */
function calculateTextHeight(doc, text, width, options = {}) {
  return doc.heightOfString(text, { ...options, width });
}

/**
 * Draw text in two columns
 * @param {PDFDocument} doc - PDF document
 * @param {Array} paragraphs - Array of paragraph strings
 * @param {number} startY - Starting Y position
 * @param {Object} layout - Layout configuration
 */
function drawTwoColumnText(doc, paragraphs, startY, layout) {
  const { leftColumnX, rightColumnX, columnWidth, bottomMargin, pageHeight } = layout;

  let currentColumn = 'left';
  let currentY = startY;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphHeight = calculateTextHeight(doc, paragraph, columnWidth, {
      align: 'justify'
    });

    // Check if we need to add a new page
    if (currentY + paragraphHeight > pageHeight - bottomMargin) {
      // If we're in the left column, try to move to right column
      if (currentColumn === 'left') {
        currentColumn = 'right';
        currentY = startY;
      } else {
        // Add new page
        doc.addPage();
        currentColumn = 'left';
        currentY = layout.topMargin;
      }
    }

    // Draw paragraph
    const x = currentColumn === 'left' ? leftColumnX : rightColumnX;
    doc.text(paragraph, x, currentY, {
      width: columnWidth,
      align: 'justify'
    });

    // Update Y position
    currentY += paragraphHeight + 15; // Add spacing between paragraphs

    // Switch column logic: try to balance columns
    if (currentColumn === 'left' && i < paragraphs.length - 1) {
      const nextParagraphHeight = calculateTextHeight(doc, paragraphs[i + 1], columnWidth, {
        align: 'justify'
      });

      // If there's not enough space in left column, move to right
      if (currentY + nextParagraphHeight > pageHeight - bottomMargin) {
        currentColumn = 'right';
        currentY = startY;
      }
    }
  }
}

/**
 * Generate PDF for article
 * @param {Object} articleData - Parsed article data
 * @returns {Promise<PDFDocument>} - PDF document stream
 */
async function generateArticlePDF(articleData) {
  // Create PDF document with Letter US size
  const doc = new PDFDocument({
    size: 'letter', // 8.5" x 11" = 612pt x 792pt
    layout: 'portrait',
    margins: {
      top: 72,    // 1 inch
      bottom: 72,
      left: 72,
      right: 72
    },
    info: {
      Title: articleData.title,
      Author: articleData.author || articleData.authors.join(', '),
      Subject: articleData.summary,
      Creator: 'Neon Integrations - PDF Generator',
      Producer: 'PDFKit'
    }
  });

  // Layout constants
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 72;
  const marginRight = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const contentWidth = pageWidth - marginLeft - marginRight; // 468pt
  const columnGap = 20;
  const columnWidth = (contentWidth - columnGap) / 2; // 224pt each

  // Header
  doc.fontSize(9)
     .fillColor('#666')
     .font('Helvetica');

  const headerY = 40;
  const headerParts = [
    articleData.siteName,
    articleData.sectionPath,
    formatDate(articleData.publicationTime)
  ].filter(Boolean);

  if (articleData.author) {
    headerParts.push(`By ${articleData.author}`);
  }

  doc.text(headerParts.join(' • '), marginLeft, headerY, {
    width: contentWidth,
    align: 'center'
  });

  // Move to content start
  doc.y = marginTop;

  // Cover Image (if available)
  if (articleData.coverImage && articleData.coverImage.url) {
    console.log('Downloading cover image:', articleData.coverImage.url);
    const imageBuffer = await downloadImage(articleData.coverImage.url);

    if (imageBuffer) {
      try {
        // Add image with fit to width
        doc.image(imageBuffer, marginLeft, doc.y, {
          fit: [contentWidth, 300],
          align: 'center'
        });

        // Move down after image
        doc.moveDown(2);

        // Add caption and credit if available
        if (articleData.coverImage.caption || articleData.coverImage.credit) {
          doc.fontSize(8)
             .fillColor('#666')
             .font('Helvetica-Oblique');

          const captionParts = [];
          if (articleData.coverImage.caption) {
            captionParts.push(articleData.coverImage.caption);
          }
          if (articleData.coverImage.credit) {
            captionParts.push(articleData.coverImage.credit);
          }

          doc.text(captionParts.join(' | '), marginLeft, doc.y, {
            width: contentWidth,
            align: 'center'
          });

          doc.moveDown(1.5);
        } else {
          doc.moveDown(1);
        }
      } catch (imageError) {
        console.error('Error adding image to PDF:', imageError.message);
        // Continue without image
        doc.moveDown(1);
      }
    } else {
      doc.moveDown(1);
    }
  }

  // Overhead (if available)
  if (articleData.overhead) {
    doc.fontSize(12)
       .fillColor('#333')
       .font('Helvetica-Bold')
       .text(articleData.overhead.toUpperCase(), marginLeft, doc.y, {
         width: contentWidth,
         align: 'center'
       });
    doc.moveDown(0.5);
  }

  // Headline
  doc.fontSize(24)
     .fillColor('#000')
     .font('Helvetica-Bold')
     .text(articleData.title, marginLeft, doc.y, {
       width: contentWidth,
       align: 'center'
     });

  doc.moveDown(1);

  // Summary (if available)
  if (articleData.summary) {
    doc.fontSize(12)
       .fillColor('#333')
       .font('Helvetica-Oblique')
       .text(articleData.summary, marginLeft, doc.y, {
         width: contentWidth,
         align: 'center'
       });
    doc.moveDown(1.5);
  } else {
    doc.moveDown(1);
  }

  // Draw separator line
  doc.strokeColor('#ccc')
     .lineWidth(0.5)
     .moveTo(marginLeft, doc.y)
     .lineTo(pageWidth - marginRight, doc.y)
     .stroke();

  doc.moveDown(1.5);

  // Body Text - Two Columns
  if (articleData.bodyParagraphs && articleData.bodyParagraphs.length > 0) {
    doc.fontSize(10)
       .fillColor('#333')
       .font('Helvetica');

    const startY = doc.y;

    // Draw two-column text
    drawTwoColumnText(doc, articleData.bodyParagraphs, startY, {
      leftColumnX: marginLeft,
      rightColumnX: marginLeft + columnWidth + columnGap,
      columnWidth: columnWidth,
      topMargin: marginTop,
      bottomMargin: marginBottom,
      pageHeight: pageHeight
    });
  } else {
    // No body content
    doc.fontSize(10)
       .fillColor('#999')
       .font('Helvetica-Oblique')
       .text('[No body content available]', marginLeft, doc.y, {
         width: contentWidth,
         align: 'center'
       });
  }

  // Footer on last page
  const finalY = doc.y;
  if (finalY < pageHeight - marginBottom - 30) {
    doc.fontSize(8)
       .fillColor('#999')
       .font('Helvetica')
       .text(
         `Generated on ${new Date().toLocaleString('en-US')}`,
         marginLeft,
         pageHeight - marginBottom + 10,
         {
           width: contentWidth,
           align: 'center'
         }
       );
  }

  // Note: Do NOT call doc.end() here!
  // The PDF stream will be piped to the HTTP response,
  // and the piping mechanism will handle finalization.
  // Calling doc.end() here would close the stream before piping.

  return doc;
}

module.exports = {
  generateArticlePDF,
  downloadImage,
  formatDate
};
