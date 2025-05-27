function polyfills() {
  // ReplaceAll
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (str, newStr) {
      // If a regex pattern
      if (
        Object.prototype.toString.call(str).toLowerCase() === "[object regexp]"
      ) {
        return this.replace(str, newStr);
      }

      // If a string
      return this.replace(new RegExp(str, "g"), newStr);
    };
  }
}
polyfills();

function removeNonAlphanumeric(str) {
  return str.replace?.(/[^a-zA-Z0-9_-]/g, "") || str;
}

function removeNonAlphanumericPreserveDot(str) {
  return str.replace?.(/[^a-zA-Z0-9._-]/g, "") || str;
}

function removeATags(htmlString) {
  return htmlString.replace?.(/<a\b[^>]*>|<\/a>/gi, "");
}

/**
 * Removes all <![CDATA[...]]> blocks from a string, preserving the inner content.
 * Works safely across multiple and multiline CDATA sections.
 * @param {string} xml - The XML string.
 * @returns {string} - XML string without CDATA wrappers.
 */
function stripAllCData(xml) {
  return xml.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}

/**
 * Checks if a filename string has a file extension.
 * @param {string} filename - The filename (not a full path)
 * @returns {boolean} - True if an extension exists, false otherwise
 */
function hasFileExtension(filename) {
  return /^[^\\.]+(\.[^\\.]+)+$/.test(filename);
}

function getImageNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const newName = pathname.substring(pathname.lastIndexOf('/') + 1);
    return removeNonAlphanumericPreserveDot(newName);
  } catch (error) {
    console.error("Invalid URL:", error);
    return null;
  }
}

function textToHtmlParagraphs(text) {
  return text
    .trim() // Remove leading and trailing whitespace
    .split(/\n\s*\n+/) // Split paragraphs by multiple newlines
    .map(paragraph => `<p>${paragraph.trim()}</p>`) // Wrap in <p> tags
    .join(""); // Join into a single string
}

function generateAutoId() {
  const prefix = 'U';
  const length = 13; // Total length after the prefix is 13 characters
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  let randomPart = '';
  for (let i = 0; i < length; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return prefix + randomPart;
}


function bodyGenerator({
    mainImageReference = '',
    caption = '<?EM-dummyText Caption ?>',
    credit = '<?EM-dummyText Credit ?>',
    overhead = '<?EM-dummyText Overhead ?>',
    headline = '<?EM-dummyText Headline ?>',
    summary = '<?EM-dummyText Summary ?>',
    byline = '<?EM-dummyText Byline ?>',
    text = ['<?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?>'],
    textHtml = '<p><?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?></p>',
}) {
    const processedMainImageReference = mainImageReference ? `fileref="${mainImageReference}"` : '';
    const processedCaption = caption ? caption : '<?EM-dummyText Caption ?>'; 
    const processedCredit = credit ? credit : '<?EM-dummyText Credit ?>';
    const processedOverhead = overhead ? overhead : '<?EM-dummyText Overhead ?>';
    const processedHeadline = headline ? headline : '<?EM-dummyText Headline ?>';
    const processedSummary = summary ? summary : '<?EM-dummyText Summary ?>';
    const processedByline = byline ? byline : '<?EM-dummyText Byline ?>';
    const processedText = text ? text : ['<?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?>'];
    const processedTextHtml = textHtml ? textHtml : '<p><?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?></p>';

    const body = `
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE doc SYSTEM "/common/rules/EidosMedia.dtd">
        <?EM-dtdExt /common/rules/EidosMedia.dtx?>
        <?EM-templateName /templates/story.xml?>
        <?xml-stylesheet type="text/css" href="/common/styles/css/main.css"?>
        <doc xml:lang="en-us">
            <story>
                <web-image-group id="9Ge0PKxKzLsOBjo" group="media" class="default" picturedesklite="true">
                    <web-image ${processedMainImageReference} id="cJsGBk6C1zX6Mu0" class="wide" softCrop="Wide" />
                    <web-image ${processedMainImageReference} id="Tv6ovLrTVZCufxJ" class="square" softCrop="Square"/>
                    <web-image ${processedMainImageReference} id="lI5qvoKT6rQmZP6" class="portrait" softCrop="Portrait"/>
                    <web-image ${processedMainImageReference} id="DjHOEomkrt5j56m" class="ultrawide" softCrop="Ultrawide" />
                    <web-image-caption>
                        <caption id="x4uSrQnRtPHhzog"><p>${processedCaption}</p></caption>
                        <credit id="daQWoJATGjkRjxN"><p>${processedCredit}</p></credit>
                    </web-image-caption>
                </web-image-group>
                <grouphead id="HyGfGTqtgkS1r10">
                    <overhead id="8wBfRNVk0Cy18dB">
                        <p>${processedOverhead}</p>
                    </overhead>
                    <headline id="l7LHJMA3z6wm4m6">
                        <p>${processedHeadline}</p>
                    </headline>
                </grouphead>
                <summary id="3CRkB9hDWlDD4Rq">
                    <p>${processedSummary}</p>
                </summary>
                <byline id="v9EMmjofXwNnrqs">
                    <p>${processedByline}</p>
                </byline>
                <text id="yjm90uF7IlvVTPX">
                    ${processedTextHtml}
                </text>
            </story>
            <teaser>
                <web-image-group id="eyXgctKGr6NgKVH" group="media" class="default" picturedesklite="true">
                    <web-image id="OnfoLzcIawL8Lvl" class="wide" softCrop="Wide" />
                    <web-image id="lAD685ktThyR2wK" class="square" softCrop="Square"/>
                    <web-image id="F6iNQSPx3LcbnCI" class="portrait" softCrop="Portrait"/>
                    <web-image id="9M2n7Yh9VPBa95P" class="ultrawide" softCrop="Ultrawide" />
                    <web-image-caption>
                        <caption id="ztnacsNP1XOPV8s"><p><?EM-dummyText Caption ?></p></caption>
                        <credit id="hgKq6b6uvmfkWZn"><p><?EM-dummyText Credit ?></p></credit>
                    </web-image-caption>
                </web-image-group>
                <grouphead>
                    <headline id="vxP5csG6DrRPZMP">
                        <p><?EM-dummyText Teaser Headline ?></p>
                    </headline>
                </grouphead>
                <summary id="FL6rotUA32PhnA8">
                    <p><?EM-dummyText Teaser Summary ?></p>
                </summary>
            </teaser>
        </doc>
    `;

    return body.replaceAll('\n', '').replaceAll('    ', '').trim();
}

function nextStepAssignmentBodyGenerator(getNextStepsResult, targetStateName) {
    const processName = getNextStepsResult.associatedWorkflow?.processInstance?.processName;
    const matchingStep = getNextStepsResult.associatedWorkflow?.steps?.find?.(step => 
        step.state.name === targetStateName
    );
    const nodeTitle = getNextStepsResult.node.title || 'Automatically transitioned by a Neon Integration';

    if (!matchingStep) {
        console.error(`Step with state name '${targetStateName}' not found`);
    }

    const nextStepAssignmentBody = {
      "workflowAssignment": {
        "title": nodeTitle,
        "comment": "",
        "principals": [],
        "prioprity": 0
      },
      "workflowStep": {
        "connectorName": matchingStep.name,
        "workflowName": processName
      }
    };

    return nextStepAssignmentBody;
}

/**
 * Parses a srcset string and returns an array of { url, width } entries.
 * Supports width descriptors (e.g., 640w) and pixel density descriptors (e.g., 2x).
 */
function parseSrcset(srcset) {
  return srcset
    .split(',')
    .map(item => item.trim())
    .map(entry => {
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
 * @param {HTMLPictureElement} picture - The <picture> DOM element
 * @returns {string|null} - URL of the largest image or null if none found
 */
function getLargestSrcFromPicture(picture) {
  let candidates = [];
  
  const sourcesElements = picture.querySelectorAll('source');
  
  if (typeof sourcesElements === typeof undefined) return null;

  // Check <source> elements
  sourcesElements.forEach(source => {
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


module.exports = {
  polyfills,
  removeNonAlphanumeric,
  removeATags,
  stripAllCData,
  hasFileExtension,
  getImageNameFromUrl,
  textToHtmlParagraphs,
  generateAutoId,
  bodyGenerator,
  nextStepAssignmentBodyGenerator,
  getLargestSrcFromPicture
};
