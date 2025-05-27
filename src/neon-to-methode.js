const unorm = require('unorm');
const { remove } = require('remove-accents');
const { jsonToXml } = require('./helpers/json-to-xml.js');
//const {XMLParser, XMLBuilder, XMLValidator} = require('fast-xml-parser');
const utils = require('./helpers/utils.js');
const cheerio = require('cheerio');
const edapi = require('./helpers/edapi-utils.js');
const dayjs = require('dayjs');
const images = require('./images-importer.js');

const USERNAME = process.env.EDAPI_USERNAME;
const PASSWORD = process.env.EDAPI_PASSWORD;
const TEMPLATE = '/SysConfig/Product/Shared/Templates/Default/story.xml';
const CHANNEL = 'Tabloid';
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
      excludeTags: ["style", "web-image-group", "teaser", "oembedblock"],
    });
    
    const $doc = cheerio.load(neonXmlContent, { xml: true }, false);
    
    $doc('grouphead').append(`<subhead><p><![CDATA[<?EM-dummyText Subhead ?>]]></p></subhead>`);

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
  const name = generateNameFromModel(model);
  const { content, xmlDeclarations, $doc } = await generateContentFromModel(model);

  return { info, name, content, xmlDeclarations, $doc };
};

function addPrintImageGroup($doc, methodeImage) {
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
                  <caption><![CDATA[<?EM-dummyText Caption ?>]]></caption>
                  <ld pattern=" " />
                  <credit><![CDATA[<?EM-dummyText Credit ?>]]></credit>
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
      attributes: {
        metadata: {
          general: {
            priority: 'High'
          }
        }
      }
    });
    const imageReferences = await images.modelImagesToMethode(model, { channel: CHANNEL, workFolder: WORKFOLDER, issueDate });
    
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
        imageReferences
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

module.exports = {
  processNeonStory,
  processNeonStoryV2,
  processNeonImages
};
