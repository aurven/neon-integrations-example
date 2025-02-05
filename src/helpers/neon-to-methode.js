const unorm = require("unorm");
const { remove } = require("remove-accents");
const { jsonToXml } = require("./json-to-xml.js");
const edapi = require("./edapi-utils.js");
const dayjs = require("dayjs");

const USERNAME = process.env.EDAPI_USERNAME;
const PASSWORD = process.env.EDAPI_PASSWORD;
const TEMPLATE = "/SysConfig/Product/Shared/Templates/Default/story.xml";
const CHANNEL = "Tabloid";
const WORKFOLDER = "/Product/World";

// Process webhook data
const processWebhookData = async (model) => {
  const generateInfoFromModel = (model) => {
    return {
      id: model.data.id,
      title: model.data.title,
      type: model.data.sys.type,
      pubInfo: model.data.pubInfo,
      attributes: model.data.attributes,
    };
  };

  const generateNameFromModel = (model) => {
    function normalizeToPlainText(input) {
      // Normalize the string to NFC form (decomposes characters with diacritics)
      let normalized = unorm.nfd(input);

      // Remove diacritical marks and accents
      normalized = remove(normalized);

      // Remove non-Latin characters (anything not a-z, A-Z, and spaces)
      normalized = normalized.replace(/[^a-zA-Z\s]/g, "");

      // Replace multiple spaces with a single space
      normalized = normalized.replace(/\s+/g, " ");

      // Replace spaces with dashes
      normalized = normalized.replace(/\s/g, "-");

      console.log(normalized);
      return normalized;
    }

    const title = model.data.title;
    const normalizedTitle = normalizeToPlainText(title);
    const newName = `${normalizedTitle}.xml`;

    return newName;
  };

  const generateContentFromModel = async (model) => {
    const neonXmlContent = await jsonToXml({
      json: model.data.files,
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

    const methodeContent = `<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE doc SYSTEM "/SysConfig/Rules/EidosMedia.dtd">
        <?EM-dtdExt /SysConfig/Rules/EidosMedia.dtx?>
        <?EM-templateName /SysConfig/Product/Shared/Templates/Default/story.xml?>
        <?xml-stylesheet type="text/css" href="/SysConfig/Rules/main.css"?>
        ${neonXmlContent}`.trim();

    console.log(methodeContent);
    return methodeContent;
  };

  const info = generateInfoFromModel(model);
  const name = generateNameFromModel(model);
  const content = await generateContentFromModel(model);

  return { info, name, content };
};

const processNeonStory = async (model) => {
  try {
    const { info, name, content } = await processWebhookData(model);

    const issueDate = dayjs().add(1, "day").format("YYYYMMDD");

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
    console.log("Neon item imported successfully!");

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

module.exports = {
  processNeonStory,
};
