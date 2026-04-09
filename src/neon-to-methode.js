const unorm = require('unorm');
const { remove } = require('remove-accents');
const { jsonToXml } = require('./helpers/json-to-xml.js');
//const {XMLParser, XMLBuilder, XMLValidator} = require('fast-xml-parser');
const utils = require('./helpers/utils.js');
const cheerio = require('cheerio');
const edapi = require('./helpers/edapi-utils.js');
const dayjs = require('dayjs');
const images = require('./images-importer.js');
const { findElementByNodeType, extractTextFromElements } = require('./helpers/neon-content-parser.js');

const USERNAME = process.env.EDAPI_USERNAME;
const PASSWORD = process.env.EDAPI_PASSWORD;
const TEMPLATE = '/SysConfig/Product/Shared/Templates/Default/story.xml';
const CHANNEL = '';
const WORKFOLDER = '/Product/World';

// Process webhook data
const processWebhookData = async (model) => {
  const generateInfoFromModel = (model) => {
    return {
      id: model.id,
      title: model.title,
      type: model.sys.type,
      pubInfo: model.pubInfo,
      attributes: model.attributes,
    };
  };

  const generateNameFromModel = (model) => {
    function normalizeToPlainText(input) {
      // Normalize the string to NFC form (decomposes characters with diacritics)
      let normalized = unorm.nfd(input);

      // Remove diacritical marks and accents
      normalized = remove(normalized);

      // Remove non-Latin characters (anything not a-z, A-Z, and spaces)
      normalized = normalized.replace(/[^a-zA-Z\s]/g, '');

      // Replace multiple spaces with a single space
      normalized = normalized.replace(/\s+/g, ' ');

      // Replace spaces with dashes
      normalized = normalized.replace(/\s/g, '-');

      console.log(normalized);
      return normalized;
    }

    const title = model.title;
    const normalizedTitle = normalizeToPlainText(title);
    const newName = `${normalizedTitle}.xml`;

    return newName;
  };

  const generateContentFromModel = async (model) => {
    const neonXmlContent = await jsonToXml({
      json: model.files,
      excludeAttributes: [
        "id",
        "enabledcropslist",
        "emxed-trx-anchor",
        "emxed-trx-captiongroup",
        "emxed-trx-captionsequence",
        "emxed-trx-captiontitle",
        "emxed-trx-captiontype",
        "emxed-trx-component",
        "emxed-trx-iscaption",
      ],
      excludeTags: [
        "style",
        //"web-image-group",
        "teaser",
        "oembedblock"
      ],
    });
    
    const $doc = cheerio.load(neonXmlContent, { xml: true }, false);
    
    const summaryText = extractSummaryFromModel(model) || '<?EM-dummyText Subhead ?>';
    $doc('grouphead').append(`<subhead><p><![CDATA[${summaryText}]]></p></subhead>`);

    const xmlDeclarations = `<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE doc SYSTEM "/SysConfig/Rules/EidosMedia.dtd">
        <?EM-dtdExt /SysConfig/Rules/EidosMedia.dtx?>
        <?EM-templateName /SysConfig/Product/Shared/Templates/Default/story.xml?>
        <?xml-stylesheet type="text/css" href="/SysConfig/Rules/main.css"?>`.trim();
    
    const methodeContent = `${xmlDeclarations}
        ${neonXmlContent}`.trim();

    console.log(methodeContent);
    return { 
      content: methodeContent,
      xmlDeclarations,
      $doc
    };
  };

  const info = generateInfoFromModel(model);
  //const name = generateNameFromModel(model);
  const name = `neon_${info.id}.xml`;
  const { content, xmlDeclarations, $doc } = await generateContentFromModel(model);

  return { info, name, content, xmlDeclarations, $doc };
};

function extractSummaryFromModel(model) {
  if (model.summary?.trim()) return model.summary.trim();
  const storyEl = model?.files?.content?.data?.elements?.find(el => el.nodeType === 'story');
  const summaryEl = findElementByNodeType(storyEl?.elements || [], 'summary');
  return summaryEl ? extractTextFromElements(summaryEl.elements) : null;
}

function addPrintImageGroup($doc, methodeImage) {
  const captionText = methodeImage.caption || '<?EM-dummyText Caption ?>';
  const creditText  = methodeImage.credit  || '<?EM-dummyText Credit ?>';

  const groupElement = `
      <print-image-group class="default" group="media"
          id="${utils.generateAutoId()}">
          <print-image
            id="${utils.generateAutoId()}"
            fileref="${methodeImage.fileref}"
            softCrop="Tabloid"
            tmx="${methodeImage.width} ${methodeImage.height} ${methodeImage.width} ${methodeImage.height}"
            xtransform="translate(0 0) scale(1 1)"
          />
          <print-image-caption id="${utils.generateAutoId()}">
              <p>
                  <caption><![CDATA[${captionText}]]></caption>
                  <ld pattern=" " />
                  <credit><![CDATA[${creditText}]]></credit>
              </p>
          </print-image-caption>
      </print-image-group>
  `;

  $doc('story').prepend(groupElement);
}

async function processNeonStory(model) {
  try {
    const { info, name, content } = await processWebhookData(model);

    const issueDate = dayjs().add(1, 'day').format('YYYYMMDD');

    await edapi.login({
      username: USERNAME,
      password: PASSWORD,
    });
    const loid = await edapi.createStory({
      name,
      issueDate,
      template: TEMPLATE,
      channel: CHANNEL,
      workFolder: WORKFOLDER,
      attributes: info.attributes,
    });
    loid && (await edapi.putContentToStory(loid, content));
    await edapi.logout();
    console.log('Neon item imported successfully!');

    return {
      source: info,
      target: {
        id: loid,
      },
    };
  } catch (error) {
    console.error(error);
  }
};

async function processNeonStoryV2 (model) {
  try {
    const { info, name, xmlDeclarations, $doc } = await processWebhookData(model);

    const issueDate = dayjs().add(1, 'day').format('YYYYMMDD');

    await edapi.login({
      username: USERNAME,
      password: PASSWORD,
    });
    const loid = await edapi.createStory({
      name,
      issueDate,
      template: TEMPLATE,
      channel: CHANNEL,
      workFolder: WORKFOLDER,
      // attributes: info.attributes,
      // attributes: {
      //   metadata: {
      //     general: {
      //       priority: 'High'
      //     }
      //   }
      // },
      attributes: null
    });
    const imageReferences = await images.modelImagesToMethode(
      model, { 
        channel: CHANNEL,
        workFolder: WORKFOLDER,
        issueDate
      }
    );
    
    Object.values(imageReferences).forEach(imageReference => {
      addPrintImageGroup($doc, imageReference);
    });
    
    const content = xmlDeclarations + $doc.html();
    const cleanedContent = utils.stripAllCData(content);
    loid && (await edapi.putContentToStory(loid, cleanedContent));
    
    await edapi.logout();
    
    console.log('Neon item imported successfully!');

    return {
      source: info,
      target: {
        storyId: loid,
        imageReferences: simplifyImageReferences(imageReferences)
      },
    };
  } catch (error) {
    console.error(error);
  }
};

async function processNeonImages(model) {
  try {
    const { info, name, content } = await processWebhookData(model);

    const issueDate = dayjs().add(1, 'day').format('YYYYMMDD');

    await edapi.login({
      username: USERNAME,
      password: PASSWORD,
    });
    const imageReferences = await images.modelImagesToMethode(model, { channel: CHANNEL, workFolder: WORKFOLDER, issueDate })
    await edapi.logout();
    console.log('Neon item imported successfully!');

    return {
      imageReferences
    };
  } catch (error) {
    console.error(error);
  }
};

/**
 * Simplifies the imageReferences structure to contain only loid and uuid
 * @param {Object} imageReferences - The complex imageReferences object
 * @returns {Object} Simplified object with only loid and uuid for each image
 */
function simplifyImageReferences(imageReferences) {
  if (!imageReferences || typeof imageReferences !== 'object') {
    return {};
  }

  const simplified = {};
  
  for (const [key, imageData] of Object.entries(imageReferences)) {
    if (imageData && typeof imageData === 'object' && imageData.loid && imageData.uuid) {
      simplified[key] = {
        loid: imageData.loid,
        uuid: imageData.uuid
      };
    }
  }
  
  return simplified;
}

module.exports = {
  processNeonStory,
  processNeonStoryV2,
  processNeonImages
};
