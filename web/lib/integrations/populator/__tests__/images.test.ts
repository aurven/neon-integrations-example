import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  buildImageMetadataXml,
  mainImageReferenceGenerator,
  imageToBase64,
  uploadImage,
  uploadImageFromStory,
} from '../images';
import { putNode } from '../../../core/neon-bo-api-v3';

vi.mock('axios');
vi.mock('../../../core/neon-bo-api-v3', () => ({
  putNode: vi.fn(),
}));

const mockPutNode = putNode as unknown as ReturnType<typeof vi.fn>;

describe('buildImageMetadataXml', () => {
  it('includes credit and caption when both present', () => {
    const xml = buildImageMetadataXml({ caption: 'A caption', credit: 'A credit' });
    expect(xml).toContain('<credit>A credit</credit>');
    expect(xml).toContain('<caption>A caption</caption>');
    expect(xml.indexOf('<credit>')).toBeLessThan(xml.indexOf('<caption>'));
  });

  it('emits an empty credit tag and omits caption when absent', () => {
    const xml = buildImageMetadataXml({});
    expect(xml).toContain('<credit></credit>');
    expect(xml).not.toContain('<caption>');
  });

  it('escapes XML special characters', () => {
    const xml = buildImageMetadataXml({ caption: 'A & B <tag>' });
    expect(xml).toContain('<caption>A &amp; B &lt;tag&gt;</caption>');
  });
});

describe('mainImageReferenceGenerator', () => {
  it('builds a reference from familyRef and workspaceUriPath', () => {
    const ref = mainImageReferenceGenerator({
      familyRef: 'fam-img-1',
      workspaceLinkInfo: { workspaceUriPath: '/Demo/Images' },
    });
    expect(ref).toBe('/Demo/Images?uuid=fam-img-1');
  });

  it('returns null when workspaceLinkInfo is missing', () => {
    const ref = mainImageReferenceGenerator({ familyRef: 'fam-img-1' });
    expect(ref).toBeNull();
  });
});

describe('imageToBase64', () => {
  beforeEach(() => {
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns mimeType and base64 on success', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/jpeg' },
    });

    const result = await imageToBase64('https://example.com/pic.jpg');

    expect(result).toEqual({ mimeType: 'image/jpeg', base64: Buffer.from('hello').toString('base64') });
  });

  it('returns null on fetch failure', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const result = await imageToBase64('https://example.com/pic.jpg');

    expect(result).toBeNull();
  });
});

describe('uploadImage', () => {
  beforeEach(() => {
    mockPutNode.mockReset();
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('builds a multipart body and calls putNode', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/jpeg' },
    });
    mockPutNode.mockResolvedValue({ node: { familyRef: 'fam-img-1' } });

    const result = await uploadImage({
      imageName: 'sunset',
      imageUrl: 'https://example.com/pic.jpg',
      workspace: '/Demo/Images',
      metadata: { caption: 'A sunset' },
    });

    expect(result).toEqual({ node: { familyRef: 'fam-img-1' } });
    const [{ boundary, requestBody }] = mockPutNode.mock.calls[0];
    expect(boundary).toBe('WebKitFormBoundary4B2922fkRo7Alk4m');
    expect(requestBody).toContain('filename="sunset.jpeg"');
    expect(requestBody).toContain('Content-Type: image/jpeg');
    expect(requestBody).toContain('"workFolder":"/Demo/Images"');
    expect(requestBody).toContain('<caption>A sunset</caption>');
    expect(requestBody.endsWith('--WebKitFormBoundary4B2922fkRo7Alk4m--')).toBe(true);
  });

  it('throws when the image cannot be fetched', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    await expect(
      uploadImage({ imageName: 'sunset', imageUrl: 'https://example.com/pic.jpg', workspace: '/Demo/Images' })
    ).rejects.toThrow('Failed to fetch image from URL');
  });
});

describe('uploadImageFromStory', () => {
  beforeEach(() => {
    mockPutNode.mockReset();
    (axios.get as ReturnType<typeof vi.fn>) = vi.fn();
  });

  it('returns false when the story has no figureUrl', async () => {
    const result = await uploadImageFromStory({ id: 'story-1', tgtWorkspace: '/Demo/Imports' });
    expect(result).toBe(false);
  });

  it('uploads the image derived from figureUrl', async () => {
    (axios.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: Buffer.from('hello'),
      headers: { 'content-type': 'image/png' },
    });
    mockPutNode.mockResolvedValue({ node: { familyRef: 'fam-img-2' } });

    const result = await uploadImageFromStory({
      id: 'story-1',
      figureUrl: 'https://example.com/photos/sunset.png',
      tgtWorkspace: '/Demo/Imports',
    });

    expect(result).toEqual({ node: { familyRef: 'fam-img-2' } });
    const [{ requestBody }] = mockPutNode.mock.calls[0];
    expect(requestBody).toContain('filename="sunset.png"');
    expect(requestBody).toContain('"workFolder":"/Demo/Imports"');
  });
});
