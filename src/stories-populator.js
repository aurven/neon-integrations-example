const dayjs = require('dayjs');
const utils = require('./helpers/utils.js');
const neonUtils = require('./helpers/neon-utils.js');
const neon = require('./helpers/neon-bo-api-v3.js');
const deepl = require('deepl-node');
const images = require('./images-importer.js');

utils.polyfills();

let createdIds = [];

function getCreationOptions(itemData) {
    const issueDate = dayjs().format('YYYYMMDD');
    const language = itemData.language;
    const translation = itemData.translation;

    const cleanedUpTitle = utils.removeNonAlphanumeric(itemData.id || itemData.title);
    const fileName = cleanedUpTitle + '_' + (translation || language) + '.xml';

    const type = itemData.type || 'article';

    const options = {
        "type": type,
        "name": fileName,
        "template": "story.xml",
        "issueDate": issueDate,
        "workFolder": itemData.tgtWorkspace,
        "creationMode": "AUTO_RENAME",
        "timeSuffix": false,
        "storageFolder": "SELECTED_WORKFOLDER"
    }
    
    if (itemData.siteAsChannel) {
      options['outputChannel'] = itemData.tgtSite;
    } else {
      options['edition'] = 'English-US';
    }
  
    return options;
}

function getOptionsFromData(itemData) {
    const mainContentHtml = itemData.mainContentHtml?.replaceAll?.('<br>', '<br />');
    
    const textHtml = utils.removeATags(mainContentHtml);
  
    return {
        mainImageReference: itemData.mainImageReference,
        caption: itemData.figureCaption,
        credit: itemData.figureCredit,
        overhead: itemData.overhead,
        headline: itemData.headline,
        summary: itemData.summary,
        byline: itemData.byline,
        // text: [itemData.mainContent],
        textHtml
    }
}



async function newNodeFromStory(story, publishStory = true) {
    return new Promise(async (resolve, reject) => {
        const creationOptions = getCreationOptions(story);
        const node = await neon.createNewStory(creationOptions);
        const familyRef = node.familyRef;
        const imageUpload = await images.uploadImageFromStory(story);
        const mainImageReference = imageUpload.node ? images.mainImageReferenceGenerator(imageUpload.node) : null;
        story.mainImageReference = mainImageReference ? mainImageReference : null;
        const bodyOptions = story.translate ? await translateStory(story) : getOptionsFromData(story);
      
        if (familyRef) {
            console.log(`Created new node with ID ${familyRef}`);
            createdIds.push(familyRef);
            const updateStatus = await neon.updateNodeContent(familyRef, utils.bodyGenerator(bodyOptions));
            const metaUpdateStatus = await neon.updateNodeMetadata(familyRef, utils.metadataGenerator(story.metadata));
          
            if (updateStatus) {
                await neon.unlockNode(familyRef);
                await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit' });
              
                if (publishStory) {
                  await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready' });
                  console.log(`${familyRef} updated successfully!`);
                  const promotionResponse = await neon.promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
                  await neon.promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
                } else {
                  await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision' });  
                }
              
                resolve();
            } else {
                console.warn(`Error during content Update, deletion of ${familyRef} in progress...`);
                await neon.deleteNode(familyRef, true);
                resolve();
            }
        } else {
            reject();
        }
    });
}

async function translateStory(story) {
  const source = story.language;
  const target = story.translate;
  
  const storyOptions = getOptionsFromData(story);
  
  const translator = new deepl.Translator(process.env.DEEPL_APIKEY);
  
  const translatedStory = {
    caption:    await translator.translateText(storyOptions.caption, source, target),
    credit:     await translator.translateText(storyOptions.credit, source, target),
    overhead:   await translator.translateText(storyOptions.overhead, source, target),
    headline:   await translator.translateText(storyOptions.headline, source, target),
    summary:    await translator.translateText(storyOptions.summary, source, target),
    byline:     storyOptions.byline,
    text:       storyOptions.text,
    textHtml:   await translator.translateText(storyOptions.textHtml, source, target, {tagHandling: 'xml'})
  }
  
  return story;
}

async function populateNeonInstance(data, options = {site: null, workspace: null, language: 'en', translate: null, siteAsChannel: false}) {
    if (!options.site || !options.workspace) {
      const noOptsError = 'No options provided! {site, workspace}';
      console.log(noOptsError);
      return(noOptsError);
    }
  
    createdIds = [];
  
    return await data.reduce(async (promiseAcc, story) => {
        console.log(story.id || story.title);

        story.tgtSite = options.site;
        story.tgtWorkspace = options.workspace;
        story.tgtSection = options.section;
        story.language = options.language;
        story.translate = options.translate;
        story.siteAsChannel = options.siteAsChannel;
        story.type = options.type || 'article';
        const directPublish = options.directPublish;

        return await promiseAcc.then(async () => {
            return await newNodeFromStory(story, directPublish);
        });
    }, Promise.resolve())
        .then(() => {
            return createdIds;
        });
}

async function testStoryTranslations(data, options = {site: null, workspace: null, language: 'en', translate: null}) {
    if (!options.site || !options.workspace) {
      const noOptsError = 'No options provided! {site, workspace}';
      console.log(noOptsError);
      return(noOptsError);
    }

    data.reduce((promiseAcc, story) => {
        console.log(story.id);

        story.tgtSite = options.site;
        story.tgtWorkspace = options.workspace;
        story.language = options.language;
        story.translate = options.translate;

        return promiseAcc.then(async () => {
            return await translateStory(story);
        });
    }, Promise.resolve());
    
}


module.exports = {
  populateNeonInstance,
  testStoryTranslations
};
