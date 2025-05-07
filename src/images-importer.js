const querystring = require('querystring');
const axios = require('axios');
const FormData = require('form-data');
const neon = require('./helpers/neon-bo-api.js');
const edapi = require('./helpers/edapi-utils.js');
const utils = require('./helpers/utils.js');
const siteshelpers = require('./helpers/sites-helpers.js');

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

        console.log(`{data:${mimeType};base64,${base64}}`);
      
        return { mimeType, base64 }
    } catch (error) {
        console.error('Error fetching image:', error.message);
        return null;
    }
}

async function uploadImage(options = {
    imageName: '',
    imageUrl: '',
    workspace: '',
    story: {}
  }) {
  
  // const imageUrl = !isTrelloUrl(options.imageUrl) ? options.imageUrl : await getTrelloCoverUrl(options.story);
  const imageUrl = options.imageUrl;
  
  const { mimeType, base64 } = await imageToBase64(imageUrl);
  
  //return { mimeType, base64 };
  
  const boundary = 'WebKitFormBoundary4B2922fkRo7Alk4m';
  
  // Prepare the image part
  const imagePart = `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="content"; filename="${options.imageName}"\r\n` +
                    `Content-Type: ${mimeType}\r\n` +
                    `Content-Transfer-Encoding: base64\r\n\r\n` +
                    `${base64}\r\n`;
                    
  // Prepare the objectModel part (JSON metadata)
  const objectModel = {
    "workFolder": options.workspace,
    "creationMode": "AUTO_RENAME",
    "timeSuffix": true,
    "name": options.imageName
  };
  
  const objectModelPart = `--${boundary}\r\n` +
                          `Content-Disposition: form-data; name="objectModel"; filename="blob"\r\n` +
                          `Content-Type: application/json\r\n\r\n` +
                          `${JSON.stringify(objectModel)}\r\n`;

  const xmlMetadata = `<?xml version="1.0" encoding="UTF-8"?>` +
                      `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
                      `<ObjectMetadata>` +
                      `<iptc>` +
                      `<credit></credit>` +  // Add the credit from description here
                      `</iptc>` +
                      `<WebDesign><WebType>Image</WebType></WebDesign>` +
                      `</ObjectMetadata>`;
  
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

async function modelImagesToMethode(model, {workFolder, channel, issueDate}) {
  
  const siteName = model.pubInfo.siteName;
  
  const images = model.links?.hyperlink?.image?.map?.(image => image.targetId);
  const methodeImages = {};
  
  for (let i = 0; i < images.length; i++) {
    const targetId = images[i];
    const neonImage = await prepareNeonImage({ siteName, targetId, environment: 'live' })
    const methodeData = await uploadImageToMethode({ neonImage, workFolder, channel, issueDate });
    // methodeImages[targetId] = methodeData;
    methodeImages[targetId] = {
      loid: methodeData.id,
      uuid: methodeData.pstate.uuid,
      path: methodeData.path,
      fileref: methodeData.path + '?uuid=' + methodeData.pstate.uuid,
      width: neonImage.width,
      height: neonImage.height
    };
  }
  
  return methodeImages;
}

async function uploadImageToMethode(options = {
    neonImage: null,
    workFolder: '',
    channel: '',
    issueDate: ''
  }) {
  
  /*
  const { fileName, mimeType, base64 } = options.neonImage;
  
  const boundary = 'WebKitFormBoundary4B2922fkRo7Alk4m';
  
  // Prepare the image part
  const imagePart = `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="content"; filename="${fileName}"\r\n` +
                    `Content-Type: ${mimeType}\r\n` +
                    `Content-Transfer-Encoding: base64\r\n\r\n` +
                    `${base64}\r\n`;
                    
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
  
  const optionsPart = `--${boundary}\r\n` +
                          `Content-Disposition: form-data; name="options"; filename="blob"\r\n` +
                          `Content-Type: application/json\r\n\r\n` +
                          `${JSON.stringify(optionsModel)}\r\n`;

  const finalBoundary = `--${boundary}--`;

  const requestBody = imagePart + optionsPart + finalBoundary;
  */
  
  const form = new FormData();
  
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
  
  return edapi.createObject(form);
}

module.exports = {
    mainImageReferenceGenerator,
    uploadImage,
    uploadImageFromStory,
    uploadImageToMethode,
    modelImagesToMethode
}
