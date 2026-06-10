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

// Channel exclusion rules for tags
// Format: { tagName: '!ChannelName' } to exclude a tag from a specific channel
// Example: { table: '!Tabloid', figure: '!Web' }
const DEFAULT_CHANNEL_RULES = {
  table: '!Tabloid'
};

const getChannelRules = (customRules = {}) => {
  return { ...DEFAULT_CHANNEL_RULES, ...customRules };
};

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
        "emxed-trx-anchor-element",
      ],
      excludeTags: [
        "style",
        "teaser",
        "oembedblock"
      ],
      channelRules: getChannelRules(),
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

function resolveMethodeFileref(neonSrc, imageReferences) {
  if (!neonSrc || !imageReferences) return null;
  const matched = Object.entries(imageReferences).find(([targetId]) => neonSrc.includes(targetId));
  return matched ? matched[1].fileref : null;
}

function replaceImageWithWebImage($doc, img, imageReferences) {
  const $img = $doc(img);
  const attribs = { ...(img.attribs || {}) };
  const fileref = resolveMethodeFileref(attribs.src, imageReferences);
  if (fileref) attribs.fileref = fileref;
  delete attribs.src;
  const attribStr = Object.entries(attribs).map(([k, v]) => ` ${k}="${v}"`).join('');
  $img.replaceWith(`<web-image${attribStr}/>`);
}

function injectFilerefIntoImage($doc, img, imageReferences) {
  const $img = $doc(img);
  const fileref = resolveMethodeFileref($img.attr('src'), imageReferences);
  if (fileref) $img.attr('fileref', fileref);
  $img.removeAttr('src');
}

function restructureCaptionGroup($doc, captionEl, captionTag) {
  const $captionGroup = $doc(captionEl);
  const captionText = $captionGroup.find('caption').text() || '<?EM-dummyText Caption ?>';
  const creditText  = $captionGroup.find('credit').text()  || '<?EM-dummyText Credit ?>';
  $captionGroup.replaceWith(
    `<${captionTag}><p><caption>${captionText}</caption><credit>${creditText}</credit></p></${captionTag}>`
  );
}

function transformWebImageGroups($doc, imageReferences) {
  // web-image-group: <image> → <web-image> with fileref; <web-image-caption> restructured
  $doc('web-image-group').each((_, group) => {
    const $group = $doc(group);
    $group.find('image').each((_, img) => replaceImageWithWebImage($doc, img, imageReferences));
    $group.find('web-image-caption').each((_, cap) => restructureCaptionGroup($doc, cap, 'web-image-caption'));
  });

  // inline-media-group: same treatment, but caption tag is image-caption → web-image-caption
  $doc('inline-media-group').each((_, group) => {
    const $group = $doc(group);
    $group.find('image').each((_, img) => injectFilerefIntoImage($doc, img, imageReferences));
    $group.find('image-caption').each((_, cap) => restructureCaptionGroup($doc, cap, 'web-image-caption'));
  });
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
              <p><caption><![CDATA[${captionText}]]></caption><ld pattern=" " /><credit><![CDATA[${creditText}]]></credit></p>
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
  const { MethodeClient } = require('./helpers/methode-bo-api.js');
  const methodeClient = new MethodeClient();

  try {
    const { info, name, xmlDeclarations, $doc } = await processWebhookData(model);

    const issueDate = dayjs().add(1, 'day').format('YYYYMMDD');

    await methodeClient.login({ username: USERNAME, password: PASSWORD });

    // Check if this Neon object was already sent to Méthode via methodeHook writeback
    const existingStoryId = info.pubInfo?.webhookData?.methodeHook?.storyId;
    let loid;

    if (existingStoryId) {
      console.log(`🔍 methodeHook found — checking if story ${existingStoryId} exists in Méthode...`);
      let existingStory = null;
      try {
        existingStory = await methodeClient.getObject(existingStoryId);
      } catch (err) {
        console.warn(`⚠️ Could not fetch story ${existingStoryId} from Méthode: ${err.message}. Will create a new one.`);
      }

      if (existingStory) {
        console.log(`✅ Story ${existingStoryId} exists in Méthode — will update instead of creating.`);
        loid = existingStoryId;

        // Check if this story is linked to a page (PrintPageLinked role)
        console.log(`Checking if story ${existingStoryId} is linked to a page...`);
        let linkedObjects = null;
        try {
          linkedObjects = await methodeClient.getObjectLinked(existingStoryId, 'EOM::PrintPageLinked');
          console.log(`Linked objects for ${existingStoryId}: ${JSON.stringify(linkedObjects, null, 2)}`);
        } catch (err) {
          console.warn(`⚠️ Could not check PrintPageLinked for ${existingStoryId}: ${err.message}`);
        }

        const isLinkedToPage = linkedObjects?.roles?.length > 0;
        if (isLinkedToPage) {
          console.log(`📄 Story ${existingStoryId} is linked to a page — checking for Tabloid channel copy...`);

          const hasTabloidCopy = linkedObjects.roles.some(
            role => role.bundleChildChannel === 'Tabloid' || role.channel === 'Tabloid'
          );

          if (!hasTabloidCopy) {
            console.log(`📋 No Tabloid channel copy found — creating one...`);
            await methodeClient.createChannelCopy(existingStoryId, 'Tabloid', 'Neutral');
          } else {
            console.log(`✅ Tabloid channel copy already exists — skipping creation.`);
          }
        }
      } else {
        console.log(`⚠️ Story ${existingStoryId} not found in Méthode — creating a new story.`);
      }
    }

    if (!loid) {
      loid = await methodeClient.createStory({
        name,
        issueDate,
        template: TEMPLATE,
        channel: CHANNEL,
        workFolder: WORKFOLDER,
        attributes: null
      });
    }

    const imageReferences = await images.modelImagesToMethode(
      methodeClient,
      model, {
        channel: CHANNEL,
        workFolder: WORKFOLDER,
        issueDate
      }
    );

    transformWebImageGroups($doc, imageReferences);

    Object.values(imageReferences).forEach(imageReference => {
      addPrintImageGroup($doc, imageReference);
    });

    const content = xmlDeclarations + $doc.html();
    const cleanedContent = utils.stripAllCData(content);
    loid && (await methodeClient.putContentToStory(loid, cleanedContent));

    await methodeClient.sendMessage({
      subject: `New update for Story from Digital (${loid})`,
      body: 'There are new updates on the Master copy of a story already linked to a page. Please review the changes and update the channel copy if necessary.',
      recipients: ['aureliano.ventrella', 'Emmanuel'], // Méthode principal names (users or groups)
      priority: '1',       // optional, defaults to '1'
      attachments: [loid]      // optional, defaults to []
    });

    await methodeClient.logout();

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
    await methodeClient.cleanup();
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
