const dayjs = require('dayjs');
const utils = require('../helpers/utils.js');
const neonUtils = require('../helpers/neon-utils.js');
const neon = require('../helpers/neon-bo-api-v3.js');
const images = require('../images-importer.js');

const defaultSite = 'TheGlobe';
const defaultWorkspace = '/Convergent/News';

function cardOptionsTransformer (trelloCard) {
  const topic = {
    neon: {
      username: trelloCard.neon.username,
      priority: trelloCard.neon.priority || 0,
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
        mainImageReference: topic.mainImageReference,
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
        "creationMode": "RETURN_EXISTING",
        "timeSuffix": false,
        "storageFolder": "SELECTED_WORKFOLDER",
        "outputChannel": topic.neon.site,
        "externalRef": "trello:" + topic.trello.id,
        "externalSource": "Trello"
    }
}

async function newNodeFromTopic(topic) {
    return new Promise(async (resolve, reject) => {

        const creationOptions = getCreationOptions(topic);
        const node = await neon.createNewStory(creationOptions);
        const familyRef = node.familyRef;
        const imageUpload = await images.uploadImageFromStory(topic);
        const mainImageReference = images.mainImageReferenceGenerator(imageUpload.node);
        topic.mainImageReference = mainImageReference ? mainImageReference : null;
        const bodyOptions = getOptionsFromTopic(topic);
        if (familyRef) {
            console.log(`Created new node with ID ${familyRef}`);
            const updateStatus = await neon.updateNodeContent(familyRef, utils.bodyGenerator(bodyOptions));
            if (updateStatus) {
                await neon.unlockNode(familyRef);
                await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Created' });
                await neonUtils.workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', priority: topic.neon.priority });
                console.log(`${familyRef} updated successfully!`);
                resolve(familyRef);
            } else {
                //console.warn(`Error during content Update, deletion of ${familyRef} in progress...`);
                //await neon.deleteNode(familyRef, true);
                resolve();
            }
        } else {
            reject();
        }
    });
}



async function importCard (trelloCard) {
  const topic = cardOptionsTransformer(trelloCard);
  
  const neonId = await newNodeFromTopic(topic);
  topic.neon.familyRef = neonId;
  return topic;
}

module.exports = {
    importCard 
}