import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreationOptions, getOptionsFromData, newNodeFromStory, populateNeonInstance } from '../service';
import type { StoryInput } from '../service';
import {
  createNewStory,
  updateNodeContent,
  updateNodeMetadata,
  unlockNode,
  deleteNode,
  promoteNode,
  promoteNodeEverywhere,
} from '../../../core/neon-bo-api-v3';
import { workflowTransitionTo, hasWorkflow } from '../../../core/neon-utils';
import { uploadImageFromStory, mainImageReferenceGenerator } from '../images';

vi.mock('../../../core/neon-bo-api-v3', () => ({
  createNewStory: vi.fn(),
  updateNodeContent: vi.fn(),
  updateNodeMetadata: vi.fn(),
  unlockNode: vi.fn(),
  deleteNode: vi.fn(),
  promoteNode: vi.fn(),
  promoteNodeEverywhere: vi.fn(),
}));
vi.mock('../../../core/neon-utils', () => ({
  workflowTransitionTo: vi.fn(),
  hasWorkflow: vi.fn(),
}));
vi.mock('../images', () => ({
  uploadImageFromStory: vi.fn(),
  mainImageReferenceGenerator: vi.fn(),
}));

const mocks = {
  createNewStory: createNewStory as unknown as ReturnType<typeof vi.fn>,
  updateNodeContent: updateNodeContent as unknown as ReturnType<typeof vi.fn>,
  updateNodeMetadata: updateNodeMetadata as unknown as ReturnType<typeof vi.fn>,
  unlockNode: unlockNode as unknown as ReturnType<typeof vi.fn>,
  deleteNode: deleteNode as unknown as ReturnType<typeof vi.fn>,
  promoteNode: promoteNode as unknown as ReturnType<typeof vi.fn>,
  promoteNodeEverywhere: promoteNodeEverywhere as unknown as ReturnType<typeof vi.fn>,
  workflowTransitionTo: workflowTransitionTo as unknown as ReturnType<typeof vi.fn>,
  hasWorkflow: hasWorkflow as unknown as ReturnType<typeof vi.fn>,
  uploadImageFromStory: uploadImageFromStory as unknown as ReturnType<typeof vi.fn>,
  mainImageReferenceGenerator: mainImageReferenceGenerator as unknown as ReturnType<typeof vi.fn>,
};

describe('getCreationOptions', () => {
  it('builds an edition-based filename when siteAsChannel is falsy', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en' });
    expect(options.name).toBe('my-story_en.xml');
    expect(options.edition).toBe('English-US');
    expect(options.outputChannel).toBeUndefined();
    expect(options.issueDate).toMatch(/^\d{8}$/);
  });

  it('sets outputChannel when siteAsChannel is true', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en', siteAsChannel: true, tgtSite: 'theglobe' });
    expect(options.outputChannel).toBe('theglobe');
    expect(options.edition).toBeUndefined();
  });

  it('prefers translation over language in the filename when present', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en', translation: 'fr' });
    expect(options.name).toBe('my-story_fr.xml');
  });

  it('uses itemData.name as an explicit filename override', () => {
    const options = getCreationOptions({ id: 'my-story', language: 'en', name: 'custom-name.xml' });
    expect(options.name).toBe('custom-name.xml');
  });

  it('omits the trailing underscore segment when neither translation nor language is set', () => {
    const options = getCreationOptions({ id: 'my-story' });
    expect(options.name).toBe('my-story.xml');
  });
});

describe('getOptionsFromData', () => {
  it('converts <br> to self-closing and strips <a> tags', () => {
    const options = getOptionsFromData({
      mainContentHtml: '<p>Hello<br>World <a href="x">link</a></p>',
      figureCaption: 'cap',
      figureCredit: 'cred',
    });
    expect(options.textHtml).toBe('<p>Hello<br />World link</p>');
    expect(options.caption).toBe('cap');
    expect(options.credit).toBe('cred');
  });
});

describe('newNodeFromStory', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createNewStory.mockResolvedValue({ familyRef: 'fam-1' });
    mocks.uploadImageFromStory.mockResolvedValue(false);
    mocks.updateNodeContent.mockResolvedValue(true);
    mocks.updateNodeMetadata.mockResolvedValue(true);
    mocks.hasWorkflow.mockResolvedValue(true);
  });

  it('throws when story creation does not return a familyRef', async () => {
    mocks.createNewStory.mockResolvedValue({ familyRef: '' });

    await expect(newNodeFromStory({ id: 'story-1' })).rejects.toThrow('Story node creation failed');
  });

  it('publishes via Edit -> Ready and promotes when publishStory is true', async () => {
    const familyRef = await newNodeFromStory({ id: 'story-1', tgtSite: 'theglobe', tgtSection: '/news' }, true);

    expect(familyRef).toBe('fam-1');
    expect(mocks.unlockNode).toHaveBeenCalledWith('fam-1');
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ familyRef: 'fam-1', targetStateName: 'Edit' })
    );
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ familyRef: 'fam-1', targetStateName: 'Ready' })
    );
    expect(mocks.promoteNode).toHaveBeenCalledWith('fam-1', { targetSite: 'theglobe', targetSection: '/news', mode: 'LIVE' });
    expect(mocks.promoteNodeEverywhere).toHaveBeenCalledWith('fam-1', { mode: 'LIVE' });
  });

  it('transitions to Revision and does not promote when publishStory is false', async () => {
    await newNodeFromStory({ id: 'story-1' }, false);

    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Edit' })
    );
    expect(mocks.workflowTransitionTo).toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Revision' })
    );
    expect(mocks.workflowTransitionTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetStateName: 'Ready' })
    );
    expect(mocks.promoteNode).not.toHaveBeenCalled();
  });

  it('deletes the node and returns null when content update fails', async () => {
    mocks.updateNodeContent.mockResolvedValue(false);

    const result = await newNodeFromStory({ id: 'story-1' }, true);

    expect(result).toBeNull();
    expect(mocks.deleteNode).toHaveBeenCalledWith('fam-1', true);
    expect(mocks.unlockNode).not.toHaveBeenCalled();
  });

  it('sets mainImageReference from the uploaded image when present', async () => {
    mocks.uploadImageFromStory.mockResolvedValue({ node: { familyRef: 'fam-img-1', workspaceLinkInfo: { workspaceUriPath: '/img' } } });
    mocks.mainImageReferenceGenerator.mockReturnValue('/img?uuid=fam-img-1');

    const story: StoryInput = { id: 'story-1', figureUrl: 'https://example.com/a.jpg' };
    await newNodeFromStory(story, true);

    expect(story.mainImageReference).toBe('/img?uuid=fam-img-1');
  });

  it('skips workflow transitions and still promotes when the node has no associated workflow', async () => {
    mocks.hasWorkflow.mockResolvedValue(false);

    const familyRef = await newNodeFromStory({ id: 'story-1', tgtSite: 'theglobe' }, true);

    expect(familyRef).toBe('fam-1');
    expect(mocks.workflowTransitionTo).not.toHaveBeenCalled();
    expect(mocks.promoteNode).toHaveBeenCalled();
  });
});

describe('populateNeonInstance', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.createNewStory.mockResolvedValue({ familyRef: 'fam-1' });
    mocks.uploadImageFromStory.mockResolvedValue(false);
    mocks.updateNodeContent.mockResolvedValue(true);
    mocks.updateNodeMetadata.mockResolvedValue(true);
  });

  it('returns an error string when site or workspace is missing', async () => {
    const result = await populateNeonInstance([], { site: '', workspace: '' });
    expect(result).toBe('No options provided! {site, workspace}');
  });

  it('creates a node per story and collects the familyRefs', async () => {
    mocks.createNewStory
      .mockResolvedValueOnce({ familyRef: 'fam-1' })
      .mockResolvedValueOnce({ familyRef: 'fam-2' });

    const result = await populateNeonInstance(
      [{ id: 'story-1' }, { id: 'story-2' }],
      { site: 'theglobe', workspace: '/Demo/Imports', directPublish: false }
    );

    expect(result).toEqual(['fam-1', 'fam-2']);
    expect(mocks.createNewStory).toHaveBeenCalledTimes(2);
  });

  it('lets a per-story workfolder and type override the batch-level options', async () => {
    mocks.createNewStory.mockResolvedValueOnce({ familyRef: 'fam-1' });

    await populateNeonInstance(
      [{ id: 'story-1', workfolder: '/Custom/Folder', type: 'wirestory' }],
      { site: 'theglobe', workspace: '/Default/Folder', directPublish: false }
    );

    expect(mocks.createNewStory).toHaveBeenCalledWith(
      expect.objectContaining({ workFolder: '/Custom/Folder', type: 'wirestory' })
    );
  });
});
