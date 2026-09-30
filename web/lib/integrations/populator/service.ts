/**
 * Populator service: creates Neon story nodes from generic story data,
 * ported from src/stories-populator.js.
 */
import dayjs from 'dayjs';
import {
  removeNonAlphanumeric,
  removeATags,
  bodyGenerator,
  metadataGenerator,
  normalizePrincipals,
} from '../../core/utils';
import type { BodyGeneratorOptions, MetadataGeneratorOptions } from '../../core/utils';
import {
  createNewStory,
  updateNodeContent,
  updateNodeMetadata,
  unlockNode,
  deleteNode,
  promoteNode,
  promoteNodeEverywhere,
} from '../../core/neon-bo-api-v3';
import type { CreateNewStoryOptions } from '../../core/neon-bo-api-v3';
import { workflowTransitionTo, hasWorkflow } from '../../core/neon-utils';
import { uploadImageFromStory, mainImageReferenceGenerator } from './images';

export interface StoryInput {
  id?: string;
  title?: string;
  language?: string;
  translation?: string;
  type?: string;
  name?: string;
  workfolder?: string;
  tgtWorkspace?: string;
  tgtSite?: string;
  tgtSection?: string;
  siteAsChannel?: boolean;
  mainContentHtml?: string;
  mainImageReference?: string;
  figureUrl?: string;
  figureCaption?: string;
  figureCredit?: string;
  overhead?: string;
  headline?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions;
  assignTo?: unknown;
  neon?: { workspace?: string };
}

export function getCreationOptions(itemData: StoryInput): CreateNewStoryOptions {
  const issueDate = dayjs().format('YYYYMMDD');
  const language = itemData.language;
  const translation = itemData.translation;

  const cleanedUpTitle = removeNonAlphanumeric(itemData.id || itemData.title) || '';
  const generatedFileName = `${cleanedUpTitle}${(translation && `_${translation}`) || (language && `_${language}`) || ''}.xml`;
  const fileName = itemData.name || generatedFileName;

  const type = itemData.type || 'article';

  const options: CreateNewStoryOptions = {
    type,
    name: fileName,
    template: 'story.xml',
    issueDate,
    workFolder: itemData.tgtWorkspace,
    creationMode: 'AUTO_RENAME',
    timeSuffix: false,
    storageFolder: 'SELECTED_WORKFOLDER',
  };

  if (itemData.siteAsChannel) {
    options.outputChannel = itemData.tgtSite;
  } else {
    options.edition = 'English-US';
  }

  return options;
}

export function getOptionsFromData(itemData: StoryInput): BodyGeneratorOptions {
  const mainContentHtml = itemData.mainContentHtml?.replaceAll('<br>', '<br />');
  const textHtml = removeATags(mainContentHtml) ?? undefined;

  return {
    mainImageReference: itemData.mainImageReference,
    caption: itemData.figureCaption,
    credit: itemData.figureCredit,
    overhead: itemData.overhead,
    headline: itemData.headline,
    summary: itemData.summary,
    byline: itemData.byline,
    textHtml,
  };
}

export async function newNodeFromStory(story: StoryInput, publishStory = true): Promise<string | null> {
  const creationOptions = getCreationOptions(story);
  const node = await createNewStory(creationOptions);
  const familyRef = node.familyRef;

  if (!familyRef) {
    throw new Error(`Story node creation failed for "${story.title || story.id}"`);
  }

  const imageUpload = await uploadImageFromStory(story);
  const mainImageReference = imageUpload && imageUpload.node ? mainImageReferenceGenerator(imageUpload.node) : null;
  story.mainImageReference = mainImageReference ?? undefined;

  const bodyOptions = getOptionsFromData(story);
  const principals = normalizePrincipals(story.assignTo);

  console.log(`Created new node with ID ${familyRef}`);
  const updateStatus = await updateNodeContent(familyRef, bodyGenerator(bodyOptions));
  await updateNodeMetadata(familyRef, metadataGenerator(story.metadata));

  if (!updateStatus) {
    console.warn(`Error during content Update, deletion of ${familyRef} in progress...`);
    await deleteNode(familyRef, true);
    return null;
  }

  await unlockNode(familyRef);

  if (await hasWorkflow(familyRef)) {
    await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Edit', principals });

    if (publishStory) {
      await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Ready', principals });
    } else {
      await workflowTransitionTo({ familyRef, targetWorkflowName: 'Story', targetStateName: 'Revision', principals });
    }
  } else {
    console.log(`Node ${familyRef} has no associated workflow, skipping workflow transitions`);
  }

  if (publishStory) {
    console.log(`${familyRef} updated successfully!`);
    await promoteNode(familyRef, { targetSite: story.tgtSite, targetSection: story.tgtSection, mode: 'LIVE' });
    await promoteNodeEverywhere(familyRef, { mode: 'LIVE' });
  }

  return familyRef;
}

export interface PopulateOptions {
  site: string;
  workspace: string;
  section?: string;
  language?: string;
  siteAsChannel?: boolean;
  type?: string;
  directPublish?: boolean;
}

export async function populateNeonInstance(data: StoryInput[], options: PopulateOptions): Promise<string[] | string> {
  if (!options.site || !options.workspace) {
    const noOptsError = 'No options provided! {site, workspace}';
    console.log(noOptsError);
    return noOptsError;
  }

  const createdIds: string[] = [];

  for (const story of data) {
    console.log(story.id || story.title);

    story.tgtSite = options.site;
    story.tgtWorkspace = story.workfolder || options.workspace;
    story.tgtSection = options.section;
    story.language = options.language;
    story.siteAsChannel = options.siteAsChannel;
    story.type = story.type || options.type || 'article';

    const familyRef = await newNodeFromStory(story, options.directPublish);
    if (familyRef) {
      createdIds.push(familyRef);
    }
  }

  return createdIds;
}
