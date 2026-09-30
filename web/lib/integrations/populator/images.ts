/**
 * Populator-relevant image helpers, ported from src/images-importer.js.
 */
import querystring from 'querystring';
import axios from 'axios';
import { putNode } from '../../core/neon-bo-api-v3';
import type { NeonNode, PutNodeResponse } from '../../core/neon-bo-api-v3';
import { hasFileExtension, getImageNameFromUrl } from '../../core/utils';

export interface ImageMetadata {
  caption?: string;
  credit?: string;
}

export interface UploadImageOptions {
  imageName: string;
  imageUrl: string;
  workspace?: string;
  metadata?: ImageMetadata;
}

export interface StoryForImageUpload {
  figureUrl?: string;
  id?: string;
  tgtWorkspace?: string;
  neon?: { workspace?: string };
}

export async function imageToBase64(url: string): Promise<{ mimeType: string; base64: string } | null> {
  const [baseUrl, queryString] = url.split('?');
  const queryParams = queryString ? querystring.parse(queryString) : {};

  try {
    const response = await axios.get<ArrayBuffer>(baseUrl, { responseType: 'arraybuffer', params: queryParams });
    const base64 = Buffer.from(response.data).toString('base64');
    const mimeType = response.headers['content-type'] as string;
    return { mimeType, base64 };
  } catch (error) {
    console.error('Error fetching image:', (error as Error).message);
    return null;
  }
}

function escapeXml(value: string): string {
  const replacements: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return String(value).replace(/[<>&'"]/g, (c) => replacements[c]);
}

export function buildImageMetadataXml(metadata: ImageMetadata = {}): string {
  // credit is always emitted (empty when absent) to keep legacy output byte-identical;
  // caption is only emitted when present; image.dtd requires credit before caption.
  const caption = metadata.caption ? `<caption>${escapeXml(metadata.caption)}</caption>` : '';
  const credit = `<credit>${metadata.credit ? escapeXml(metadata.credit) : ''}</credit>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE ObjectMetadata SYSTEM "/common/rules/image.dtd">` +
    `<ObjectMetadata>` +
    `<iptc>` +
    credit +
    caption +
    `</iptc>` +
    `<WebDesign><WebType>Image</WebType></WebDesign>` +
    `</ObjectMetadata>`
  );
}

export async function uploadImage(options: UploadImageOptions): Promise<PutNodeResponse> {
  const imageUrl = options.imageUrl;

  console.log('Fetching image from URL: ' + imageUrl);

  const imageData = await imageToBase64(imageUrl);
  if (!imageData) {
    throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
  }
  const { mimeType, base64 } = imageData;

  console.log('Detected Image MIME type: ' + mimeType);

  const imageType = mimeType.split('/')[1];
  const imageName = hasFileExtension(options.imageName) ? options.imageName : `${options.imageName}.${imageType}`;

  console.log(`Uploading image: ${imageName} with ${imageType} type to workspace: ${options.workspace}`);

  const boundary = 'WebKitFormBoundary4B2922fkRo7Alk4m';

  const imagePart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="${imageName}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64}\r\n`;

  const objectModel = {
    workFolder: options.workspace,
    creationMode: 'AUTO_RENAME',
    timeSuffix: true,
    name: imageName,
  };

  const objectModelPart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="objectModel"; filename="blob"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(objectModel)}\r\n`;

  const xmlMetadata = buildImageMetadataXml(options.metadata);

  const attributesPart =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="attributes"; filename="blob"\r\n` +
    `Content-Type: application/xml\r\n\r\n` +
    `${xmlMetadata}\r\n`;

  const finalBoundary = `--${boundary}--`;

  const requestBody = imagePart + objectModelPart + attributesPart + finalBoundary;

  return putNode({ boundary, requestBody });
}

export function mainImageReferenceGenerator(imageNode: NeonNode): string | null {
  try {
    const { familyRef, workspaceLinkInfo } = imageNode;
    const { workspaceUriPath } = workspaceLinkInfo as NonNullable<NeonNode['workspaceLinkInfo']>;
    return workspaceUriPath + '?uuid=' + familyRef;
  } catch {
    return null;
  }
}

export async function uploadImageFromStory(story: StoryForImageUpload): Promise<PutNodeResponse | false> {
  const imageUrl = story.figureUrl;
  const workspace = story.tgtWorkspace || story.neon?.workspace;

  if (!imageUrl) return false;

  const imageName = getImageNameFromUrl(imageUrl) || story.id || '';

  return await uploadImage({ imageName, imageUrl, workspace });
}
