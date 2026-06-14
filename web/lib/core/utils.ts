/**
 * Common utilities, ported from src/helpers/utils.js.
 *
 * NOTE: `withNeonSession` is NOT ported here. It is a thin
 * `new NeonClient(options)` wrapper only used by the metrics integration
 * (src/requestHandlers/neon-metrics.js, not yet ported). Re-introduce it
 * alongside that integration's port.
 */

/**
 * Ensures `String.prototype.replaceAll` exists.
 *
 * This was needed for older Node/browser runtimes. `replaceAll` has been
 * standard since ES2021 / Node 15, so this is a no-op on modern runtimes,
 * but is kept for behavioral parity with the original module.
 */
export function polyfills(): void {
  // ReplaceAll
  if (!String.prototype.replaceAll) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (String.prototype as any).replaceAll = function (
      this: string,
      str: string | RegExp,
      newStr: string
    ) {
      // If a regex pattern
      if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
        return this.replace(str as RegExp, newStr);
      }

      // If a string
      return this.replace(new RegExp(str as string, 'g'), newStr);
    };
  }
}
polyfills();

/**
 * Removes all characters except letters, digits, underscore and hyphen.
 */
export function removeNonAlphanumeric(str: string | null | undefined): string | null | undefined {
  return str?.replace?.(/[^a-zA-Z0-9_-]/g, '') ?? str;
}

/**
 * Removes all characters except letters, digits, dot, underscore and hyphen.
 */
export function removeNonAlphanumericPreserveDot(
  str: string | null | undefined
): string | null | undefined {
  return str?.replace?.(/[^a-zA-Z0-9._-]/g, '') ?? str;
}

/**
 * Strips `<a>` and `</a>` tags from an HTML string (leaves inner content).
 */
export function removeATags(htmlString: string | null | undefined): string | null | undefined {
  return htmlString?.replace?.(/<a\b[^>]*>|<\/a>/gi, '');
}

/**
 * Removes all <![CDATA[...]]> blocks from a string, preserving the inner content.
 * Works safely across multiple and multiline CDATA sections.
 * @param xml - The XML string.
 * @returns XML string without CDATA wrappers.
 */
export function stripAllCData(xml: string): string {
  // Use [\s\S] instead of the `s` (dotAll) flag, which requires ES2018+.
  return xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * Checks if a filename string has a file extension.
 * @param filename - The filename (not a full path)
 * @returns True if an extension exists, false otherwise
 */
export function hasFileExtension(filename: string): boolean {
  return /^[^\\.]+(\.[^\\.]+)+$/.test(filename);
}

/**
 * Extracts and sanitizes the filename portion of a URL.
 * @returns The sanitized filename, or null if the URL is invalid.
 */
export function getImageNameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const newName = pathname.substring(pathname.lastIndexOf('/') + 1);
    return (removeNonAlphanumericPreserveDot(newName) ?? null) as string | null;
  } catch (error) {
    console.error('Invalid URL:', error);
    return null;
  }
}

/**
 * Converts plain text into HTML paragraphs, splitting on blank lines.
 */
export function textToHtmlParagraphs(text: string): string {
  return text
    .trim() // Remove leading and trailing whitespace
    .split(/\n\s*\n+/) // Split paragraphs by multiple newlines
    .map((paragraph) => `<p>${paragraph.trim()}</p>`) // Wrap in <p> tags
    .join(''); // Join into a single string
}

/**
 * Generates a random ID of the form `U` followed by 13 alphanumeric characters.
 */
export function generateAutoId(): string {
  const prefix = 'U';
  const length = 13; // Total length after the prefix is 13 characters
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let randomPart = '';
  for (let i = 0; i < length; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return prefix + randomPart;
}

export interface BodyGeneratorOptions {
  mainImageReference?: string;
  caption?: string;
  credit?: string;
  overhead?: string;
  headline?: string;
  summary?: string;
  byline?: string;
  text?: string[];
  textHtml?: string;
}

/**
 * Generates the EM-DTD story XML body used when creating a new Neon story.
 */
export function bodyGenerator({
  mainImageReference = '',
  caption = '<?EM-dummyText Caption ?>',
  credit = '<?EM-dummyText Credit ?>',
  overhead = '<?EM-dummyText Overhead ?>',
  headline = '<?EM-dummyText Headline ?>',
  summary = '<?EM-dummyText Summary ?>',
  byline = '<?EM-dummyText Byline ?>',
  text = [
    '<?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?>',
  ],
  textHtml = '<p><?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?></p>',
}: BodyGeneratorOptions = {}): string {
  const processedMainImageReference = mainImageReference
    ? `fileref="${mainImageReference}"`
    : '';
  const processedCaption = caption ? caption : '<?EM-dummyText Caption ?>';
  const processedCredit = credit ? credit : '<?EM-dummyText Credit ?>';
  const processedOverhead = overhead ? overhead : '<?EM-dummyText Overhead ?>';
  const processedHeadline = headline ? headline : '<?EM-dummyText Headline ?>';
  const processedSummary = summary ? summary : '<?EM-dummyText Summary ?>';
  const processedByline = byline ? byline : '<?EM-dummyText Byline ?>';
  const processedText = text
    ? text
    : [
        '<?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?>',
      ];
  const processedTextHtml = textHtml
    ? textHtml
    : '<p><?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?></p>';

  // processedText is computed for parity with the original (which also left
  // it unused in the template), referenced here to avoid unused-var lint.
  void processedText;

  const body = `
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE doc SYSTEM "/common/rules/EidosMedia.dtd">
        <?EM-dtdExt /common/rules/EidosMedia.dtx?>
        <?EM-templateName /templates/story.xml?>
        <?xml-stylesheet type="text/css" href="/common/styles/css/main.css"?>
        <doc xml:lang="en-us">
            <story>
                <web-image-group id="${generateAutoId()}" group="media" class="default" picturedesklite="true">
                    <web-image ${processedMainImageReference} id="${generateAutoId()}" class="wide" softCrop="Wide" />
                    <web-image ${processedMainImageReference} id="${generateAutoId()}" class="square" softCrop="Square"/>
                    <web-image ${processedMainImageReference} id="${generateAutoId()}" class="portrait" softCrop="Portrait"/>
                    <web-image ${processedMainImageReference} id="${generateAutoId()}" class="ultrawide" softCrop="Ultrawide" />
                    <web-image-caption>
                        <caption id="${generateAutoId()}"><p>${processedCaption}</p></caption>
                        <credit id="${generateAutoId()}"><p>${processedCredit}</p></credit>
                    </web-image-caption>
                </web-image-group>
                <grouphead id="${generateAutoId()}">
                    <overhead id="${generateAutoId()}">
                        <p>${processedOverhead}</p>
                    </overhead>
                    <headline id="${generateAutoId()}">
                        <p>${processedHeadline}</p>
                    </headline>
                </grouphead>
                <summary id="${generateAutoId()}">
                    <p>${processedSummary}</p>
                </summary>
                <byline id="${generateAutoId()}">
                    <p>${processedByline}</p>
                </byline>
                <text id="${generateAutoId()}">
                    ${processedTextHtml}
                </text>
            </story>
            <teaser>
                <web-image-group id="${generateAutoId()}" group="media" class="default" picturedesklite="true">
                    <web-image id="${generateAutoId()}" class="wide" softCrop="Wide" />
                    <web-image id="${generateAutoId()}" class="square" softCrop="Square"/>
                    <web-image id="${generateAutoId()}" class="portrait" softCrop="Portrait"/>
                    <web-image id="${generateAutoId()}" class="ultrawide" softCrop="Ultrawide" />
                </web-image-group>
                <grouphead>
                    <headline id="${generateAutoId()}">
                        <p><?EM-dummyText Teaser Headline ?></p>
                    </headline>
                </grouphead>
                <summary id="${generateAutoId()}">
                    <p><?EM-dummyText Teaser Summary ?></p>
                </summary>
            </teaser>
        </doc>
    `;

  return body.replaceAll('\n', '').replaceAll('    ', '').trim();
}

export interface MetadataGeneratorOptions {
  seoTitle?: string;
  seoMeta?: string;
  keywords?: string;
}

/**
 * Generates the EM-DTD ObjectMetadata XML used when creating a new Neon story.
 */
export function metadataGenerator(meta: MetadataGeneratorOptions | null | undefined): string {
  const seoTitle = meta?.seoTitle || '';
  const seoMeta = meta?.seoMeta || '';
  const keywords = meta?.keywords || '';
  const body = `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE ObjectMetadata SYSTEM "/common/rules/classify.dtd">
        <ObjectMetadata>
            <General>
                <MainCategory>
                    <SuggestedSubjects>
                        <group/>
                        <SuggestedSubject/>
                    </SuggestedSubjects>
                    <SuggestedPeoples>
                        <group/>
                        <SuggestedPeople/>
                    </SuggestedPeoples>
                </MainCategory>
                <NewsCode/>
                <IndustrySegment/>
                <GeographicalPlaces>
                    <Address/>
                    <City/>
                    <State/>
                    <Zip/>
                    <Country/>
                    <Latitude/>
                    <Longitude/>
                </GeographicalPlaces>
                <ContentType>article</ContentType>
                <Language/>
                <Author/>
                <Fee/>
                <People/>
                <Companies>
                    <Company/>
                    <Country/>
                </Companies>
                <coverage_type/>
                <Keywords/>
                <Comment/>
                <Headline/>
                <WordCount/>
                <Priority/>
            </General>
            <DistributionChannels>
                <OnLine>
                    <WebPage/>
                    <WebType/>
                    <WebPortalPath/>
                    <WebPortalCategory/>
                    <WebSections/>
                    <WebPriority/>
                    <WebObjectType/>
                    <WebDateTimePubStart/>
                    <WebDateTimePubEnd>20160908114300</WebDateTimePubEnd>
                    <AllowUserComments/>
                    <SpecialType/>
                    <StartDate/>
                    <EndDate/>
                </OnLine>
                <Radio>
                    <RadioBroadcastDateTime/>
                    <RadioProgram/>
                    <RadioObjectType/>
                </Radio>
                <TV>
                    <TVBroadcastDateTime/>
                    <TVProgram/>
                    <TVObjectType/>
                </TV>
                <Sms/>
                <Mms/>
                <Syndication/>
                <Gallery/>
                <Blog>
                    <BlogSection/>
                    <BlogDate/>
                </Blog>
                <Output>
                    <Queue/>
                    <PriorityQueue/>
                    <Embargo/>
                </Output>
            </DistributionChannels>
            <Diffusion>
                <Diff_Print/>
                <Diff_Web/>
                <Diff_Syndication/>
            </Diffusion>
            <SEO>
                <SEOTitle>${seoTitle}</SEOTitle>
                <MetaDescription>${seoMeta}</MetaDescription>
                <Keywords>${keywords}</Keywords>
                <SchemaMarkup>Article</SchemaMarkup>
                <NoIndex>No</NoIndex>
                <OpenGraph>
                    <OGTitle/>
                    <OGDescription/>
                </OpenGraph>
                <SEM>
                    <GoogleAds>
                        <GoogleAdTitle/>
                        <GoogleAdDescription/>
                    </GoogleAds>
                    <UTMParameters>
                        <UTMSource/>
                    </UTMParameters>
                </SEM>
            </SEO>
            <Paywall>
                <AccessType>Free</AccessType>
                <UserSegment>All</UserSegment>
                <SubscriptionLevel>Basic</SubscriptionLevel>
                <GeoRestriction>None</GeoRestriction>
                <DeviceRestriction>None</DeviceRestriction>
                <BehaviorTracking>None</BehaviorTracking>
                <RenewalPolicy>Auto</RenewalPolicy>
            </Paywall>
        </ObjectMetadata>
    `;

  return body.replaceAll('\n', '').replaceAll('    ', '').trim();
}

export interface SrcsetEntry {
  url: string;
  width: number;
}

/**
 * Parses a srcset string and returns an array of { url, width } entries.
 * Supports width descriptors (e.g., 640w) and pixel density descriptors (e.g., 2x).
 */
export function parseSrcset(srcset: string): SrcsetEntry[] {
  return srcset
    .split(',')
    .map((item) => item.trim())
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/);
      if (!descriptor) return { url, width: 0 }; // fallback
      if (descriptor.endsWith('w')) {
        return { url, width: parseInt(descriptor, 10) };
      } else if (descriptor.endsWith('x')) {
        return { url, width: parseFloat(descriptor) * 1000 }; // scale x to approx width
      }
      return { url, width: 0 };
    });
}

/**
 * Given a <picture> element, returns the URL of the largest image in any srcset.
 * @param picture - The <picture> DOM element
 * @returns URL of the largest image or null if none found
 */
export function getLargestSrcFromPicture(picture: HTMLPictureElement): string | null {
  let candidates: SrcsetEntry[] = [];

  const sourcesElements = picture.querySelectorAll('source');

  if (typeof sourcesElements === typeof undefined) return null;

  // Check <source> elements
  sourcesElements.forEach((source) => {
    const srcset = source.getAttribute('srcset');
    if (srcset) {
      candidates = candidates.concat(parseSrcset(srcset));
    }
  });

  // Optionally include <img srcset> fallback
  const img = picture.querySelector('img');
  if (img) {
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      candidates = candidates.concat(parseSrcset(srcset));
    } else if (img.src) {
      candidates.push({ url: img.src, width: 1 }); // lowest priority fallback
    }
  }

  if (candidates.length === 0) return null;

  // Return the URL with the highest width
  return candidates.sort((a, b) => b.width - a.width)[0].url;
}

export interface SafeLogResult {
  headers: Record<string, unknown>;
  body: unknown;
}

/**
 * Redacts sensitive headers/body fields before logging a request.
 *
 * If `DISABLE_SAFE_LOGGING=true`, returns the original data unredacted.
 */
export function safeLogRequest(
  headers: Record<string, unknown>,
  body: unknown
): SafeLogResult {
  // If DISABLE_SAFE_LOGGING is set to true, return original data without redaction
  if (process.env.DISABLE_SAFE_LOGGING === 'true') {
    return {
      headers,
      body,
    };
  }

  const sensitiveKeys = [
    'apikey',
    'authorization',
    'auth',
    'token',
    'password',
    'secret',
    'key',
    'x-api-key',
    'x-auth-token',
    'cookie',
    'set-cookie',
    'x-forwarded-for',
    'x-real-ip',
  ];

  const safeHeaders: Record<string, unknown> = { ...headers };

  // Remove or redact sensitive headers
  Object.keys(safeHeaders).forEach((key) => {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      safeHeaders[key] = '[REDACTED]';
    }
  });

  let safeBody: unknown = body;

  // Remove or redact sensitive body fields
  if (safeBody && typeof safeBody === 'object') {
    safeBody = { ...(safeBody as Record<string, unknown>) };
    Object.keys(safeBody as Record<string, unknown>).forEach((key) => {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
        (safeBody as Record<string, unknown>)[key] = '[REDACTED]';
      }
    });
  }

  return {
    headers: safeHeaders,
    body: safeBody,
  };
}

// `withNeonSession` (thin `new NeonClient(options)` wrapper) is still not
// ported - only the metrics integration needs it. Re-add alongside that port.

/**
 * Normalizes a workflow assignee into the `principals` array expected by
 * neonUtils.workflowTransitionTo (e.g. ["62038d84-f161-3579-a5f1-7aba053f999a"]).
 */
export function normalizePrincipals(assignTo: unknown): string[] {
  if (!assignTo) return [];
  return Array.isArray(assignTo) ? assignTo.filter(Boolean) : [assignTo as string];
}
