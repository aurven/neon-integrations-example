const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const { getSiteHostname } = require('../helpers/sites-helpers');

async function sendSingleEmail(emailData) {
  const auth = Buffer.from(`${process.env.MAILJET_APIKEY}:${process.env.MAILJET_APISECRET}`).toString('base64');
  
  const config = {
    method: 'post',
    url: 'https://api.mailjet.com/v3.1/send',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    data: emailData
  };

  console.log('Sending email with Mailjet:', JSON.stringify(emailData, null, 2));

  try {
    const response = await axios(config);
    console.log('Email sent successfully');
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending email:', error.response?.status || error.message);
    console.error(error.response?.data || error.message);
    throw error;
  }
}

async function sendTest() {
  const emailData = {
    "Messages": [
      {
        "From": {
          "Email": "aureliano.ventrella@eidosmedia.com",
          "Name": "Aureliano (Mailjet Test)"
        },
        "To": [
          {
            "Email": "aureliano.ventrella@gmail.com",
            "Name": "Test User"
          }
        ],
        "Subject": "Test email from Mailjet integration",
        "TextPart": "This is a test email sent from the Mailjet integration.",
        "HTMLPart": "<h3>This is a test email sent from the <a href=\"https://www.mailjet.com/\">Mailjet</a> integration.</h3>"
      }
    ]
  };
  
  return await sendSingleEmail(emailData);
}

/**
 * Fetch a rendered Neon newsletter webpage and extract its email-ready table
 * @param {string} pageUrl - Absolute URL of the rendered newsletter page
 * @param {string} baseUrl - Site base URL, used to make relative links/images absolute
 * @returns {Promise<{htmlContent: string, textContent: string}|null>} - Extracted content, or null if not found
 */
async function fetchNewsletterHtmlFromPage(pageUrl, baseUrl) {
  try {
    const response = await axios.get(pageUrl, {
      timeout: 10000,
      httpsAgent: process.env.NEON_EXT_LOCATION === 'Local'
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined
    });

    const $ = cheerio.load(response.data);
    const $table = $('#neon-newsletter-table');

    if ($table.length === 0) {
      console.warn(`fetchNewsletterHtmlFromPage: no #neon-newsletter-table found at ${pageUrl}`);
      return null;
    }

    $table.find('img[src], a[href]').each((_, el) => {
      const $el = $(el);
      const attr = $el.is('img') ? 'src' : 'href';
      const value = $el.attr(attr);
      if (value && value.startsWith('/') && !value.startsWith('//')) {
        $el.attr(attr, baseUrl + value);
      }
    });

    const htmlContent = `<!DOCTYPE html><html><body>${$.html($table)}</body></html>`;
    const textContent = $table.text().replace(/\s+/g, ' ').trim();

    return { htmlContent, textContent };
  } catch (error) {
    console.error(`fetchNewsletterHtmlFromPage: failed to fetch ${pageUrl}:`, error.message);
    return null;
  }
}

async function sendNewsletter(neonModel, options = {}) {
  const contentData = neonModel.contentData || {};
  const model = neonModel.model || neonModel;
  const newsletterTitle = contentData.data.title || model.data?.title || "Latest News Updates";

  // Get the public hostname for the site (not the Front Office API URL)
  let baseUrl = neonModel.siteNode?.hostname;
  if (!baseUrl) {
    // Fetch the live hostname from the Front Office API
    baseUrl = await getSiteHostname('theglobe', 'live');
  }
  if (!baseUrl) {
    // Final fallback to a default public URL
    baseUrl = 'https://theglobe-demo.neon.eks-dev.dev.eidosmedia.io';
  }

  const mode = options.mode === 'webpage' ? 'webpage' : 'generated';

  if (mode === 'webpage') {
    const pageUrl = contentData.data?.url || model.data?.url;

    if (!pageUrl) {
      console.warn('sendNewsletter: mode=webpage but no page url found on the model, falling back to generated mode');
    } else {
      const fetched = await fetchNewsletterHtmlFromPage(baseUrl + pageUrl, baseUrl);

      if (fetched) {
        const emailData = {
          "Messages": [
            {
              "From": {
                "Email": "aureliano.ventrella@eidosmedia.com",
                "Name": "TheGlobe Newsletter"
              },
              "To": [
                {
                  "Email": "aureliano.ventrella@gmail.com",
                  "Name": "Newsletter Subscriber"
                }
              ],
              "Subject": `${newsletterTitle} - Latest Updates`,
              "TextPart": fetched.textContent,
              "HTMLPart": fetched.htmlContent
            }
          ]
        };

        return await sendSingleEmail(emailData);
      }

      console.warn(`sendNewsletter: could not fetch newsletter table from ${baseUrl + pageUrl}, falling back to generated mode`);
    }
  }

  // Extract linked articles from the model
  const articleIds = contentData.data?.links?.pagelink?.main || model.data?.links?.pagelink?.main || [];
  const articles = [];
  
  // Process each article
  for (const link of articleIds) {
    const articleId = link.targetId;
    const articleNode = contentData.nodes?.[articleId] || neonModel.model.nodes?.[articleId];
    
    if (articleNode && articleNode.title) {
      // Get main image URL
      let imageUrl = '';
      const pictureId = articleNode.picture;
      if (pictureId && articleNode.links?.system?.mainPicture?.[0]?.dynamicCropsResourceUrls) {
        const crops = articleNode.links.system.mainPicture[0].dynamicCropsResourceUrls;
        imageUrl = crops.Wide_large || crops.Wide_small || crops.Square_large || '';
        if (imageUrl) {
          imageUrl = baseUrl + imageUrl;
        }
      }
      
      // Build article URL
      const articleUrl = articleNode.url ? `${baseUrl}${articleNode.url}` : '#';
      
      articles.push({
        title: articleNode.title,
        summary: articleNode.summary || '',
        imageUrl: imageUrl,
        url: articleUrl,
        publicationTime: articleNode.pubInfo?.publicationTime || ''
      });
    }
  }
  
  // Generate newsletter HTML
  const htmlContent = generateNewsletterHTML(newsletterTitle, articles);
  const textContent = generateNewsletterText(newsletterTitle, articles);
  
  const emailData = {
    "Messages": [
      {
        "From": {
          "Email": "aureliano.ventrella@eidosmedia.com",
          "Name": "TheGlobe Newsletter"
        },
        "To": [
          {
            "Email": "aureliano.ventrella@gmail.com",
            "Name": "Newsletter Subscriber"
          }
        ],
        "Subject": `${newsletterTitle} - Latest Updates`,
        "TextPart": textContent,
        "HTMLPart": htmlContent
      }
    ]
  };
  
  return await sendSingleEmail(emailData);
}

function generateNewsletterHTML(title, articles) {
  const articleSections = articles.map(article => `
    <div style="border-bottom: 1px solid #e0e0e0; padding: 20px 0; margin-bottom: 20px;">
      ${article.imageUrl ? `
        <div style="margin-bottom: 15px;">
          <img src="${article.imageUrl}" alt="${article.title}" style="width: 100%; max-width: 600px; height: auto; border-radius: 8px;">
        </div>
      ` : ''}
      <h3 style="color: #1a1a1a; font-size: 20px; line-height: 1.3; margin: 0 0 10px 0; font-family: Georgia, serif;">
        <a href="${article.url}" style="color: #1a1a1a; text-decoration: none;">${article.title}</a>
      </h3>
      <p style="color: #555; font-size: 16px; line-height: 1.5; margin: 0 0 15px 0; font-family: Arial, sans-serif;">
        ${article.summary}
      </p>
      <div style="margin-top: 10px;">
        <a href="${article.url}" style="background-color: #007cba; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px; font-family: Arial, sans-serif;">
          Read More →
        </a>
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <div style="max-width: 650px; margin: 0 auto; background-color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 40px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold; font-family: Georgia, serif;">
            TheGlobe
          </h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
            ${title}
          </p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px;">
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
            Stay informed with the latest news and updates from around the world.
          </p>
          
          ${articleSections}
          
          <!-- Footer -->
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #888; font-size: 14px;">
            <p style="margin: 0;">
              You're receiving this because you subscribed to TheGlobe newsletter.
            </p>
            <p style="margin: 10px 0 0 0;">
              <a href="#" style="color: #007cba; text-decoration: none;">Unsubscribe</a> | 
              <a href="#" style="color: #007cba; text-decoration: none;">Update Preferences</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateNewsletterText(title, articles) {
  const articleText = articles.map(article => `
${article.title}
${article.summary}
Read more: ${article.url}

---
`).join('');

  return `
THE GLOBE NEWSLETTER
${title}

Stay informed with the latest news and updates from around the world.

${articleText}

You're receiving this because you subscribed to TheGlobe newsletter.
To unsubscribe or update preferences, please contact us.
`;
}

module.exports = {
  sendSingleEmail,
  sendTest,
  sendNewsletter
};