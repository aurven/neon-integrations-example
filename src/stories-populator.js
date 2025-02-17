const dayjs = require('dayjs');
const neon = require('./helpers/neon-bo-api.js');

if (!String.prototype.replaceAll) {
	String.prototype.replaceAll = function (str, newStr){

		// If a regex pattern
		if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
			return this.replace(str, newStr);
		}

		// If a string
		return this.replace(new RegExp(str, 'g'), newStr);

	};
}

function removeNonAlphanumeric(str) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getCreationOptions(scrappedDataItem) {
    const issueDate = dayjs().format('YYYYMMDD');

    const cleanedUpTitle = removeNonAlphanumeric(scrappedDataItem.id);
    const fileName = cleanedUpTitle + '.xml';

    return {
        "type": "article",
        "name": fileName,
        "template": "story.xml",
        "issueDate": issueDate,
        "workFolder": scrappedDataItem.tgtWorkspace,
        "creationMode": "AUTO_RENAME",
        "timeSuffix": false,
        "storageFolder": "SELECTED_WORKFOLDER",
        "outputChannel": scrappedDataItem.tgtSite
    }
}

function getOptionsFromData(scrapedDataItem) {
    return {
        caption: scrapedDataItem.figureCaption,
        credit: scrapedDataItem.figureCredit,
        overhead: scrapedDataItem.overhead,
        headline: scrapedDataItem.headline,
        summary: scrapedDataItem.summary,
        byline: scrapedDataItem.byline,
        text: [scrapedDataItem.mainContent],
        textHtml: [scrapedDataItem.mainContentHtml.replaceAll('<br>', '<br />')]
    }
}

function bodyGenerator({
    caption = '<?EM-dummyText Caption ?>',
    credit = '<?EM-dummyText Credit ?>',
    overhead = '<?EM-dummyText Overhead ?>',
    headline = '<?EM-dummyText Headline ?>',
    summary = '<?EM-dummyText Summary ?>',
    byline = '<?EM-dummyText Byline ?>',
    text = ['<?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?>'],
    textHtml = '<p><?EM-dummyText The wizard quickly jinxed the gnomes before they vaporized! Grumpy wizards make toxic brew for the evil Queen and Jack. ?></p>',
}) {

    // const textParagraphs = text.reduce((acc, curr) => {
    //     acc += `<p>${curr}</p>`;
    //     return acc
    // }, '');

    const body = `
        <?xml version="1.0" encoding="utf-8"?>
        <!DOCTYPE doc SYSTEM "/common/rules/EidosMedia.dtd">
        <?EM-dtdExt /common/rules/EidosMedia.dtx?>
        <?EM-templateName /templates/story.xml?>
        <?xml-stylesheet type="text/css" href="/common/styles/css/main.css"?>
        <doc xml:lang="en-us">
            <story>
                <web-image-group group="media" class="default" picturedesklite="true">
                    <web-image class="wide" softCrop="Wide" />
                    <web-image class="square" softCrop="Square"/>
                    <web-image class="portrait" softCrop="Portrait"/>
                    <web-image class="ultrawide" softCrop="Ultrawide" />
                    <web-image-caption>
                        <caption><p>${caption}</p></caption>
                        <credit><p>${credit}</p></credit>
                    </web-image-caption>
                </web-image-group>
                <grouphead>
                    <overhead>
                        <p>${overhead}</p>
                    </overhead>
                    <headline>
                        <p>${headline}</p>
                    </headline>
                </grouphead>
                <summary>
                    <p>${summary}</p>
                </summary>
                <byline>
                    <p>${byline}</p>
                </byline>
                <text>
                    ${textHtml}
                </text>
            </story>
            <teaser>
                <web-image-group group="media" class="default" picturedesklite="true">
                    <web-image class="wide" softCrop="Wide" />
                    <web-image class="square" softCrop="Square"/>
                    <web-image class="portrait" softCrop="Portrait"/>
                    <web-image class="ultrawide" softCrop="Ultrawide" />
                    <web-image-caption>
                        <caption><p><?EM-dummyText Caption ?></p></caption>
                        <credit><p><?EM-dummyText Credit ?></p></credit>
                    </web-image-caption>
                </web-image-group>
                <grouphead>
                    <headline>
                        <p><?EM-dummyText Teaser Headline ?></p>
                    </headline>
                </grouphead>
                <summary>
                    <p><?EM-dummyText Teaser Summary ?></p>
                </summary>
            </teaser>
        </doc>
    `;

    return body.replaceAll('\n', '').replaceAll('    ', '').trim();
}

async function newNodeFromStory(story) {
    return new Promise(async (resolve, reject) => {

        const creationOptions = getCreationOptions(story);
        const familyRef = await neon.createNewStory(creationOptions);
        const bodyOptions = getOptionsFromData(story);
        if (familyRef) {
            console.log(`Created new node with ID ${familyRef}`);
            const updateStatus = await neon.updateNodeContent(familyRef, bodyGenerator(bodyOptions));
            if (updateStatus) {
                await neon.unlockNode(familyRef);
                console.log(`${familyRef} updated successfully!`);
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

async function populateNeonInstance(data, options = {site: null, workspace: null}) {
    if (!options.site || !options.workspace) {
      const noOptsError = 'No options provided! {site, workspace}';
      console.log(noOptsError);
      return(noOptsError);
    }
  
    await neon.login();

    data.reduce((promiseAcc, story) => {
        console.log(story.id);

        story.tgtSite = options.site;
        story.tgtWorkspace = options.workspace;

        return promiseAcc.then(async () => {
            return await newNodeFromStory(story);
        });
    }, Promise.resolve())
        .finally(() => {
            neon.logout();
        });
    
}

module.exports = {
  populateNeonInstance,
};
