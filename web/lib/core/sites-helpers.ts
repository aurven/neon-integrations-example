/**
 * Site-specific helper functions for talking to the Neon Front Office API,
 * ported from src/helpers/sites-helpers.js.
 */

import https from 'https';
import axios from 'axios';

const NEON_FO_APIKEY = process.env.NEON_FO_APIKEY;

export type SiteEnvironment = 'live' | 'preview' | string;

interface SiteNodeResponse {
  siteNode?: {
    hostname?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function insecureAxios() {
  return axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
  });
}

/**
 * Get the live public hostname for a site by fetching the siteNode info from the Front Office API
 * @param siteName - The site name (e.g., 'theglobe')
 * @param environment - The environment ('live' or 'preview')
 * @returns The public hostname URL or null if not found
 */
export async function getSiteHostname(
  siteName: string,
  environment: SiteEnvironment = 'live'
): Promise<string | null> {
  console.log(`[getSiteHostname] siteName: ${siteName}, environment: ${environment}`);
  const frontOfficeUrl = getFrontOfficeUrl(siteName, environment);

  if (!frontOfficeUrl) {
    console.error(
      `[getSiteHostname] No Front Office URL found for site: ${siteName}, environment: ${environment}`
    );
    return null;
  }

  const config = {
    method: 'get' as const,
    maxBodyLength: Infinity,
    url: `${frontOfficeUrl}/api/sites/current`,
    headers: {
      'Content-Type': 'application/json',
      'neon-fo-access-key': NEON_FO_APIKEY,
    },
  };

  const insecureInstance = insecureAxios();

  try {
    const response = await insecureInstance.request<SiteNodeResponse>(config);
    const hostname = response.data?.siteNode?.hostname;
    console.log(`[getSiteHostname] Retrieved hostname: ${hostname}`);
    return hostname || null;
  } catch (error) {
    const err = error as { code?: string; message?: string; response?: { data?: unknown } };
    console.error(`[getSiteHostname] ERROR: ${err.code || err.message}`);
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data));
    }
    return null;
  }
}

export function getFrontOfficeUrl(siteName: string, environment: SiteEnvironment = 'live'): string | undefined {
  console.log(`[getFrontOfficeUrl] siteName: ${siteName}, environment: ${environment}`);
  // Build env var name: NEON_FO_THEGLOBE_LIVE_URL, NEON_FO_THEGLOBE_PREVIEW_URL, etc.
  const envVarName = `NEON_FO_${siteName.toUpperCase()}_${environment.toUpperCase()}_URL`;
  const url = process.env[envVarName];
  console.log(`[getFrontOfficeUrl] returning: ${url}`);
  return url;
}

export interface GetNodeByIdOptions {
  siteName: string;
  targetId: string;
  environment?: SiteEnvironment;
}

export async function getNodeById({
  siteName,
  targetId,
  environment,
}: GetNodeByIdOptions): Promise<unknown> {
  console.log(
    `[getNodeById] siteName: ${siteName}, targetId: ${targetId}, environment: ${environment}, NEON_FO_APIKEY: ${NEON_FO_APIKEY}`
  );
  const frontOfficeUrl = getFrontOfficeUrl(siteName, environment);

  const config = {
    method: 'get' as const,
    maxBodyLength: Infinity,
    url: `${frontOfficeUrl}/api/nodes/${targetId}`,
    headers: {
      'Content-Type': 'application/json',
      'neon-fo-access-key': NEON_FO_APIKEY,
    },
  };

  const insecureInstance = insecureAxios();

  return await insecureInstance
    .request(config)
    .then((response) => {
      console.log(JSON.stringify(response.data));
      return response.data;
    })
    .catch((error) => {
      const err = error as { code?: string; response?: { data?: unknown } };
      console.error(`ERROR: ${err.code}`);
      console.error(JSON.stringify(err.response?.data));
      return undefined;
    });
}

export interface GetResourceOptions {
  siteName: string;
  url: string;
  environment?: SiteEnvironment;
}

export async function getResource({
  siteName,
  url,
  environment,
}: GetResourceOptions): Promise<unknown> {
  console.log(
    `[getResource] siteName: ${siteName}, url: ${url}, environment: ${environment}, NEON_FO_APIKEY: ${NEON_FO_APIKEY}`
  );
  const frontOfficeUrl = getFrontOfficeUrl(siteName, environment);

  const config = {
    method: 'get' as const,
    maxBodyLength: Infinity,
    url: `${frontOfficeUrl}${url}`,
    responseType: 'stream' as const,
    headers: {
      'neon-fo-access-key': NEON_FO_APIKEY,
      Accept: 'image/*',
    },
  };

  const insecureInstance = insecureAxios();

  return await insecureInstance
    .request(config)
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      const err = error as { code?: string; response?: { data?: unknown } };
      console.error(`ERROR: ${err.code}`);
      console.error(JSON.stringify(err.response?.data));
      return undefined;
    });
}

export interface GetResourceByIdOptions {
  siteName: string;
  targetId: string;
  environment?: SiteEnvironment;
}

export interface ResourceByIdResult {
  node: unknown;
  data: unknown;
}

export async function getResourceById({
  siteName,
  targetId,
  environment = 'live',
}: GetResourceByIdOptions): Promise<ResourceByIdResult> {
  const node = await getNodeById({ siteName, targetId, environment });
  const { resourceUrl } = (node ?? {}) as { resourceUrl?: string };
  return {
    node,
    data: await getResource({ siteName, url: resourceUrl ?? '', environment }),
  };
}
