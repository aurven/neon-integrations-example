const querystring = require('querystring');
const axios = require('axios');
const FormData = require('form-data');
const neon = require('./helpers/neon-bo-api-v3.js');
const utils = require('./helpers/utils.js');
const siteshelpers = require('./helpers/sites-helpers.js');
const { findAllElementsByNodeType, findElementByNodeType, extractTextFromElements } = require('./helpers/neon-content-parser.js');

function isTrelloUrl(url) {
    return /^https?:\/\/(www\.)?trello\.com\//.test(url);
}

async function getTrelloCoverUrl(story) {
  const apiKey = process.env.TRELLO_APIKEY;
  const token = process.env.TRELLO_TOKEN;
  const cardId = story.trello.id;

  if (!apiKey || !token) {
      throw new Error('Missing Trello API credentials in .env file');
  }
  
  const url = `https://api.trello.com/1/cards/${cardId}?fields=cover&key=${apiKey}&token=${token}`;
  
  const response = await axios.get(url, { responseType: 'application/json' });
  
  const data = JSON.parse(response.data);
  
  const covers = data.cover.scaled;
  const targetCover = covers[covers.length - 1];
  
  console.log('Trello URL: ' + targetCover.url);

  return targetCover.url;
}

async function imageToBase64(url) {
    const apiKey = process.env.TRELLO_APIKEY;
    const token = process.env.TRELLO_TOKEN;
  
    const [baseUrl, queryString] = url.split('?');
    const queryParams = queryString ? querystring.parse(queryString) : {};
  
    const options = !isTrelloUrl ? 
          { responseType: 'arraybuffer', params: queryParams } :
          { responseType: 'arraybuffer', params: queryParams, headers: 
            { "Authorization": `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"` }
          }
  
    try {
        const response = await axios.get(baseUrl, options);
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const mimeType = response.headers['content-type']; // Get the image MIME type

        //console.log(`{data:${mimeType};base64,${base64}}`);
      
        return { mimeType, base64 }
    } catch (error) {
        console.error('Error fetching image:', error.message);
        return null;
    }
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]));
}

function buildImageMetadataXml(metadata = {}) {
  const caption = metadata.caption ? `<caption>${escapeXml(metadata.caption)}</caption>` : '';
  const credit = `<credit>${metadata.credit ? escapeXml(metadata.credit) : ''}</credit>`;
  return `<?xml version="1.0" encoding="UTF-8"?>` +
         `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
         `<ObjectMetadata>` +
         `<iptc>` +
         caption +
         credit +
         `</iptc>` +
         `<WebDesign><WebType>Image</WebType></WebDesign>` +
         `</ObjectMetadata>`;
}

async function uploadImage(options = {
    imageName: '',
    imageUrl: '',
    workspace: '',
    story: {}
  }) {
  
  // const imageUrl = !isTrelloUrl(options.imageUrl) ? options.imageUrl : await getTrelloCoverUrl(options.story);
  const imageUrl = options.imageUrl;

  console.log('Fetching image from URL: ' + imageUrl);
  
  const { mimeType, base64 } = await imageToBase64(imageUrl);

  console.log('Detected Image MIME type: ' + mimeType);
  
  const imageType = mimeType.split('/')[1];
  const imageName = utils.hasFileExtension(options.imageName) ? options.imageName : options.imageName + '.' + imageType;
  
  console.log('Uploading image: ' + imageName + ' with ' + imageType + ' type to workspace: ' + options.workspace);
  
  const boundary = 'WebKitFormBoundary4B2922fkRo7Alk4m';
  
  // Prepare the image part
  const imagePart = `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="content"; filename="${imageName}"\r\n` +
                    `Content-Type: ${mimeType}\r\n` +
                    `Content-Transfer-Encoding: base64\r\n\r\n` +
                    `${base64}\r\n`;
                    
  // Prepare the objectModel part (JSON metadata)
  const objectModel = {
    "workFolder": options.workspace,
    "creationMode": "AUTO_RENAME",
    "timeSuffix": true,
    "name": imageName
  };
  
  const objectModelPart = `--${boundary}\r\n` +
                          `Content-Disposition: form-data; name="objectModel"; filename="blob"\r\n` +
                          `Content-Type: application/json\r\n\r\n` +
                          `${JSON.stringify(objectModel)}\r\n`;

  const xmlMetadata = buildImageMetadataXml(options.metadata);
  
  const attributesPart = `--${boundary}\r\n` +
                         `Content-Disposition: form-data; name="attributes"; filename="blob"\r\n` +
                         `Content-Type: application/xml\r\n\r\n` +
                         `${xmlMetadata}\r\n`;

  const finalBoundary = `--${boundary}--`;

  const requestBody = imagePart + objectModelPart + attributesPart + finalBoundary;
  
  return neon.putNode({ boundary, requestBody });
}

function mainImageReferenceGenerator(imageNode) {
  try {
    const { familyRef, workspaceLinkInfo } = imageNode;
    const { workspaceUriPath } = workspaceLinkInfo;
    return workspaceUriPath + '?uuid=' + familyRef;
  } catch (error) {
    return null
  }
}

async function uploadImageFromStory(story) {
  
  const imageUrl = story.figureUrl;
  const workspace = story.tgtWorkspace || story.neon.workspace;
  
  if (!imageUrl) return false;
  
  const imageName = utils.getImageNameFromUrl(imageUrl) || story.id;
  
  return await uploadImage({ imageName, imageUrl, workspace, story });
}


async function prepareNeonImage({ siteName, targetId, environment }) {
    try {
        console.log('prepareNeonImage - process.env.NEON_FO_APIKEY: ' + process.env.NEON_FO_APIKEY); 
        const { node, data } = await siteshelpers.getResourceById({ siteName, targetId, environment });
        // const base64 = Buffer.from(data, 'binary').toString('base64');
        const { fileName, mimeType } = node.files.editorial;
        const { width, height } = node.files.editorial.metadata.imageInfo;
      
        return { node, fileName, mimeType, width, height, data };
    } catch (error) {
        console.error('Error fetching image:', error.message);
        return null;
    }
}

function extractImageCaptions(model) {
  const storyEl = model?.files?.content?.data?.elements?.find(el => el.nodeType === 'story');
  const imageGroups = findAllElementsByNodeType(storyEl?.elements || [], 'web-image-group');

  return imageGroups.map(group => {
    const captionGroup = findElementByNodeType(group.elements || [], 'web-image-caption');
    if (!captionGroup) return { caption: null, credit: null };
    const captionEl = findElementByNodeType(captionGroup.elements || [], 'caption');
    const creditEl  = findElementByNodeType(captionGroup.elements || [], 'credit');
    return {
      caption: captionEl ? extractTextFromElements(captionEl.elements) : null,
      credit:  creditEl  ? extractTextFromElements(creditEl.elements)  : null,
    };
  });
}

async function modelImagesToMethode(methodeClient,model, {workFolder, channel, issueDate}) {

  const siteName = model.pubInfo.siteName;
  const captions = extractImageCaptions(model);

  const images = model.links?.hyperlink?.image?.map?.(image => image.targetId) || [];
  const methodeImages = {};
  
  for (let i = 0; i < images.length; i++) {
    const targetId = images[i];
    const neonImage = await prepareNeonImage({ siteName, targetId, environment: 'live' })
    if (!neonImage) {
      console.warn(`⚠️ WARNING: Could not retrieve image ${targetId} from Neon (site: ${siteName}). Skipping image.`);
      continue;
    }
    const methodeData = await uploadImageToMethode(methodeClient, { neonImage, workFolder, channel, issueDate });
    if (!methodeData) {
      console.warn(`⚠️ WARNING: Could not upload image ${targetId} to Methode. Skipping image.`);
      continue;
    }
    methodeImages[targetId] = {
      loid: methodeData.id,
      uuid: methodeData.pstate.uuid,
      path: methodeData.path,
      fileref: methodeData.path + '?uuid=' + methodeData.pstate.uuid,
      width: neonImage.width,
      height: neonImage.height,
      caption: captions[i]?.caption || null,
      credit:  captions[i]?.credit  || null,
    };
  }
  
  return methodeImages;
}

async function uploadImageToMethode(methodeClient, options = {
    neonImage: null,
    workFolder: '',
    channel: '',
    issueDate: ''
  }) {
  
  const form = new FormData();
  
  try {
    const { fileName, mimeType, data } = options.neonImage;
    
    form.append('content', data, {
      filename: fileName,
      contentType: mimeType,
      contentDisposition: 'form-data'
    });
    
    // Prepare the objectModel part (JSON metadata)
    const optionsModel = {
      "databaseId": 33,
      "application": "neonToMethodeApp",
      "type": "Image",
      "workFolder": options.workFolder,
      "name": fileName,
      "options": {
            "showPath": true,
            "showSystemAttributes": true,
            "showAttributes": true,
            "createMode": "NEW_VERSION"
      },
      // "attributes": "<!DOCTYPE metadata SYSTEM \"/SysConfig/Shared/Classify/classify.dtd\"><metadata>\n\t<general>\n\t\t<type/>\n\t\t<title/>\n\t\t<description/>\n\t\t<authors>\n\t\t\t<author/>\n\t\t</authors>\n\t</general>\n\t<mediaInfo>\n\t\t<caption/>\n\t\t<credit/>\n\t\t<duration/>\n\t\t<width/>\n\t\t<height/>\n\t\t<mediaUrl/>\n\t\t<mediaSource/>\n\t</mediaInfo>\n\t<location>\n\t\t<address/>\n\t\t<city/>\n\t\t<state/>\n\t\t<zip/>\n\t\t<country/>\n\t\t<latitude/>\n\t\t<longitude/>\n\t</location>\t\n<classification><keywords><keyword>Earth</keyword><keyword>K2-18b</keyword><keyword>Planet</keyword><keyword>Exoplanet</keyword><keyword>Star</keyword></keywords></classification><archive><archiveDate/></archive><source><sourceType/><sourceProvider/><sourceVersion/><sourceTransmissionDateTime/><sourceCreationDateTime/><sourceModificationDateTime/><sourcePriority/><sourceUrgency/></source><legal><copyrightHolder/><copyrightNotice/><usageTerms/></legal></metadata>",
      "systemAttributes": `<props><workFolder>${options.workFolder}</workFolder><productInfo><name>${options.channel}</name><issueDate>${options.issueDate}</issueDate></productInfo></props>`,
    };
    
    form.append('options', JSON.stringify(optionsModel), {
      filename: 'blob',
      contentType: 'application/json',
      contentDisposition: 'form-data'
    });
    
    return methodeClient.createObject(form);

  } catch (error) {
    console.error('Error preparing image upload:', error.message);
    return null;
  }
}

module.exports = {
    mainImageReferenceGenerator,
    buildImageMetadataXml,
    uploadImage,
    uploadImageFromStory,
    uploadImageToMethode,
    modelImagesToMethode
}
