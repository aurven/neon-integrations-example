const dayjs = require('dayjs');
const utils = require('./helpers/utils.js');
const neon = require('./helpers/neon-bo-api.js');
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

    return {
        "type": "article",
        "name": fileName,
        "template": "story.xml",
        "issueDate": issueDate,
        "workFolder": itemData.tgtWorkspace,
        "creationMode": "AUTO_RENAME",
        "timeSuffix": false,
        "storageFolder": "SELECTED_WORKFOLDER",
        "outputChannel": itemData.tgtSite
    }
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

async function workflowTransitionTo(familyRef, targetStateName) {
  const getNextStepsResult = await neon.getNextSteps(familyRef);
  if (getNextStepsResult.data?.node?.familyRef === familyRef) {
    try {
      const nextStepBody = utils.nextStepAssignmentBodyGenerator(getNextStepsResult.data, targetStateName);
      // console.log(nextStepBody);
      return await neon.nextStepAssignment(familyRef, nextStepBody);
    } catch (error) {
        console.error(error.message);
    }
  } else {
    console.error(`Cannot transition to ${targetStateName} for ${familyRef}`);
  }
}

async function newNodeFromStory(story, publishStory = true) {
    return new Promise(async (resolve, reject) => {
        const creationOptions = getCreationOptions(story);
        const familyRef = await neon.createNewStory(creationOptions);
        const imageUpload = await images.uploadImageFromStory(story);
        const mainImageReference = images.mainImageReferenceGenerator(imageUpload.node);
        story.mainImageReference = mainImageReference ? mainImageReference : null;
        const bodyOptions = story.translate ? await translateStory(story) : getOptionsFromData(story);
      
        if (familyRef) {
            console.log(`Created new node with ID ${familyRef}`);
            const updateStatus = await neon.updateNodeContent(familyRef, utils.bodyGenerator(bodyOptions));
          
            if (updateStatus) {
                await neon.unlockNode(familyRef);
                await workflowTransitionTo(familyRef, 'Edit');
              
                if (publishStory) {
                  await workflowTransitionTo(familyRef, 'Ready');
                  createdIds.push(familyRef);
                  console.log(`${familyRef} updated successfully!`);
                  await neon.promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
                } else {
                  await workflowTransitionTo(familyRef, 'Revision');  
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

async function populateNeonInstance(data, options = {site: null, workspace: null, language: 'en', translate: null}) {
    if (!options.site || !options.workspace) {
      const noOptsError = 'No options provided! {site, workspace}';
      console.log(noOptsError);
      return(noOptsError);
    }
  
    createdIds = [];
  
    await neon.login();

    return await data.reduce((promiseAcc, story) => {
        console.log(story.id || story.title);

        story.tgtSite = options.site;
        story.tgtWorkspace = options.workspace;
        story.tgtSection = options.section;
        story.language = options.language;
        story.translate = options.translate;
        const directPublish = options.directPublish;

        return promiseAcc.then(async () => {
            return await newNodeFromStory(story, directPublish);
        });
    }, Promise.resolve())
        .finally(() => {
            neon.logout();
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
