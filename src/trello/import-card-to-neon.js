const dayjs = require('dayjs');
const utils = require('../helpers/utils.js');
const neon = require('../helpers/neon-bo-api.js');
const images = require('../images-importer.js');

const defaultSite = 'TheGlobe';
const defaultWorkspace = '/Convergente/Attualità';

function cardOptionsTransformer (trelloCard) {
  const topic = {
    neon: {
      username: trelloCard.neonUsername,
      site: defaultSite,
      workspace: defaultWorkspace
    },
    trello: {
      id: trelloCard.id,
      url: trelloCard.url,
      shortLink: trelloCard.shortLink
    },
    title: trelloCard.name,
    description: trelloCard.desc,
    figureUrl: trelloCard.cover?.url,
    dueDate: trelloCard.due,
    assignees: trelloCard.members?.map?.(member => member.username) || []
  };
  
  console.log('Topic:');
  console.log(topic);
  
  return topic;
}

function getOptionsFromTopic(topic) {
  
    return {
        caption: null,
        credit: null,
        figureUrl: topic.figureUrl,
        overhead: null,
        headline: topic.title,
        summary: topic.description,
        byline: null,
        text: null,
        textHtml: '<p>This story has been automatically generated from Trello!</p>'
    }
}

function getCreationOptions(topic) {
    const issueDate = dayjs().format('YYYYMMDD');

    const cleanedUpTitle = utils.removeNonAlphanumeric(topic.title);
    const fileName = cleanedUpTitle + '.xml';

    return {
        "type": "article",
        "name": fileName,
        "template": "story.xml",
        "issueDate": issueDate,
        "workFolder": topic.neon.workspace,
        "creationMode": "AUTO_RENAME",
        "timeSuffix": false,
        "storageFolder": "SELECTED_WORKFOLDER",
        "outputChannel": topic.neon.site
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

async function newNodeFromTopic(topic) {
    return new Promise(async (resolve, reject) => {

        const creationOptions = getCreationOptions(topic);
        const familyRef = await neon.createNewStory(creationOptions);
        const imageUpload = await images.uploadImageFromStory(topic);
        const mainImageReference = images.mainImageReferenceGenerator(imageUpload.node);
        topic.mainImageReference = mainImageReference ? mainImageReference : null;
        const bodyOptions = getOptionsFromTopic(topic);
        if (familyRef) {
            console.log(`Created new node with ID ${familyRef}`);
            const updateStatus = await neon.updateNodeContent(familyRef, utils.bodyGenerator(bodyOptions));
            if (updateStatus) {
                await neon.unlockNode(familyRef);
                await workflowTransitionTo(familyRef, 'Edit');
                console.log(`${familyRef} updated successfully!`);
                resolve(familyRef);
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



async function importCard (trelloCard) {
  const topic = cardOptionsTransformer(trelloCard);
  
  await neon.login();
  
  const neonId = await newNodeFromTopic(topic);
  
  topic.neon.familyRef = neonId;
  
  await neon.logout();
  
  return topic;
}

module.exports = {
    importCard 
}