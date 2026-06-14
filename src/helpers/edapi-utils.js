const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const EDAPI_SERVER = process.env.EDAPI_SERVER;
const EDAPI_REST_ENDPOINT = process.env.EDAPI_REST_ENDPOINT;
const EDAPIURL = EDAPI_SERVER + EDAPI_REST_ENDPOINT;
const EDAPI_CONNECTIONID = process.env.EDAPI_CONNECTIONID;
const EDAPI_DATABASEID = process.env.EDAPI_DATABASEID;

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

async function login({ username, password }) {
    const authEndpoint = '/v3/auth/login';
    const authUrl = `${EDAPIURL}${authEndpoint}`;

    const authPayload = {
        applicationId: 'neonToMethodeApp',
        connectionId: EDAPI_CONNECTIONID,
        username,
        password,
        options: {
            showJSON: false,
            showUserInfo: false,
        },
    };

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: authUrl,
        headers: {
            'Content-Type': 'application/json'
        },
        data: authPayload
    };

    console.log(`Logging in to Méthode at ${EDAPIURL} as user ${username}...`);

    try {
        await client.request(config)
            .then((response) => {
                // console.log(JSON.stringify(response.data));
                const token = response.data.result.token.value;
                console.log(`Authenticated. Token is: ${token}`);
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
            });
    } catch (error) {
        console.error('Authentication failed...', error.response?.data || error.message);
    }

    return null;
}

async function logout() {
    const logoutEndpoint = `/v3/auth/logout`;
    const logoutUrl = `${EDAPIURL}${logoutEndpoint}`;

    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: logoutUrl,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    try {
        await client.request(config)
            .then((response) => {
                console.log(JSON.stringify(response.data));
                console.log('Logged out.');
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
            });
    } catch (error) {
        console.error('Error. Not logged out.', error.response?.data || error.message);
    }
}

async function getObjects(loids) {
    const getObjectEndpoint = `/v3/object`;
    const getObjectUrl = `${EDAPIURL}${getObjectEndpoint}`;

    const options = {
        sources: loids,
        options: {
            showAdditionalInfo: true,
            showSystemAttributes: true,
            showAttributes: true,
            showUsageTickets: true,
            showVirtualAttributes: true,
            showXml: true,
            showJson: true,
            showUniquenessString: true,
            showPath: true,
        },
    };

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: getObjectUrl,
        headers: {
            'Content-Type': 'application/json'
        },
        data: options
    };

    try {
        return await client.request(config)
            .then((response) => {
                // console.log(JSON.stringify(response.data));
                const objectInfo = response.data.result;
                console.log(`Fetched object info:`, objectInfo);
                return objectInfo;
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
            });
    } catch (error) {
        console.error('Get Object failed...', error.response?.data || error.message);
    }

    return null;
}

async function getObject(loid) {
    const objectsInfo = await getObjects([loid]);
    return objectsInfo?.items?.[0] || null;
}

async function createStory({ name, issueDate, channel, template, workFolder, attributes }) {
    const createEndpoint = `/v3/object/create/from/template/path?path=${template}`;
    const createUrl = `${EDAPIURL}${createEndpoint}`;

    const options = {
        name,
        workFolder,
        issueDate,
        attributes,
        type: 'EOM::CompoundStory',
        application: 'neonToMethodeApp',
        databaseId: EDAPI_DATABASEID,
        edition: '',
        product: channel,
        options: {
            showSystemAttribute: true,
            showPath: true,
            createMode: 'NEW_VERSION',
            useDefaultProduct: false,
            issueDateDefaultStrategy: 'CALENDAR',
            timeSuffix: false,
            checkinAction: true,
            unlock: true,
            keepCheckedOut: false
        }
    };

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: createUrl,
        headers: {
            'Content-Type': 'application/json'
        },
        data: options
    };

    try {
        return await client.request(config)
            .then((response) => {
                // console.log(JSON.stringify(response.data));
                const storyLoid = response.data.result.id;
                console.log(`Created. Loid is: ${storyLoid}`);
                return storyLoid;
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
                return null;
            });
    } catch (error) {
        console.error('Creation failed...', error.response?.data || error.message);
    }

    return null;
}

async function createObject(form) {
    const createEndpoint = `/v3/object/create`;
    const createUrl = `${EDAPIURL}${createEndpoint}`;


    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        url: createUrl,
        headers: {
            ...form.getHeaders()
        },
        data: form
    };

    try {
        return await client.request(config)
            .then((response) => {
                // console.log(JSON.stringify(response.data));
                const objectLoid = response.data.result.id;
                console.log(`Created. Loid is: ${objectLoid}`);
                return response.data.result;
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
                return null;
            });
    } catch (error) {
        console.error('Creation failed...', error.response?.data || error.message);
    }

    return null;
}

async function readContent(token, loid) {
    const readContentEndpoint = `/v3/object/loid/content?loid=${loid}&showDtd=true&token=${token}`;
    const readContentUrl = `${EDAPIURL}${readContentEndpoint}`;

    try {
        const readContentResponse = await axios.get(readContentUrl, {
            headers: { 'Content-Type': 'application/json' },
        });

        if (readContentResponse.status === 200) {
            return readContentResponse.data;
        }
    } catch (error) {
        console.error('Read Content failed...', error.response?.data || error.message);
    }

    return null;
}

async function putContentToStory(loid, content) {
    const putContentEndpoint = `/v3/object/loid/content?loid=${loid}&checkIn=true&checkOut=true&keepCheckedOut=false&checkOutClean=false`;
    const putContentUrl = `${EDAPIURL}${putContentEndpoint}`;

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: putContentUrl,
        headers: {
            'Content-Type': 'application/octet-stream'
        },
        data: content,
        
    };

    try {
        await client.request(config)
            .then((response) => {
                // console.log(JSON.stringify(response.data));
                console.log(`Content Updated Successfully on ${loid}`);
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response.data));
            });
    } catch (error) {
        console.error(`Content Update Failed on ${loid}`, error.response?.data || error.message);
    }

    return null;
}

/**
 * Helper function to get story shape and handle complex workflow for PDF preview generation
 * This retrieves the story shape JSON which contains layout information needed for preview
 */
async function getObjectLinked(id, roleType = null) {
    const queryParams = new URLSearchParams({ id });
    if (roleType) queryParams.append('roleType', roleType);

    const url = `${EDAPIURL}/object/linked?${queryParams}`;

    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url,
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        return await client.request(config)
            .then((response) => {
                return response.data.result || response.data;
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response?.data));
                return null;
            });
    } catch (error) {
        console.error(`Get object linked failed for ID ${id}:`, error.response?.data || error.message);
    }

    return null;
}

async function createChannelCopy(loid, channel = 'Tabloid', inheritFrom = 'Neutral') {
    const url = `${EDAPIURL}/v3/container/bundle/${loid}/channelcopy`;

    const payload = {
        showAdditionalInfo: true,
        showPath: true,
        showSystemAttributes: true,
        showAttributes: true,
        showUsageTickets: true,
        showVirtualAttributes: true,
        showXml: true,
        showUniquenessString: true,
        checkIn: true,
        unlock: true,
        channel,
        inheritFrom,
        source: loid,
        keepCheckedOut: false
    };

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url,
        headers: { 'Content-Type': 'application/json' },
        data: payload
    };

    try {
        return await client.request(config)
            .then((response) => {
                console.log(`Channel copy created for LOID: ${loid} (channel: ${channel})`);
                return response.data.result || response.data;
            })
            .catch((error) => {
                console.error(`❌ ERROR: ${error.code}`);
                console.error(JSON.stringify(error.response?.data));
                return null;
            });
    } catch (error) {
        console.error(`Create channel copy failed for LOID ${loid}:`, error.response?.data || error.message);
    }

    return null;
}

async function getStoryShapeWithContent(loid) {
    const { MethodeClient } = require('./methode-bo-api.js');
    
    try {
        // Create a temporary Méthode client for this request
        const methodeClient = new MethodeClient();
        
        // Login with credentials from environment
        await methodeClient.login({
            username: process.env.EDAPI_USERNAME,
            password: process.env.EDAPI_PASSWORD
        });

        // Get the story object metadata (JSON)
        const storyObject = await methodeClient.getObject(loid);
        if (!storyObject) {
            throw new Error('Failed to retrieve story object');
        }

        // Get links to find the print page this story is connected to
        let printPageId = null;
        let targetBundleChannel = null;
        let targetWorkfolder = null;
        let linkId = null;
        let linkedPagePath = null;

        const linkedObjects = await methodeClient.getObjectLinked(loid, 'EOM::PrintPageLinked');
        console.log(`Found ${linkedObjects.count || 0} EOM::PrintPageLinked objects for story ${loid}`);

        if (linkedObjects.roles && linkedObjects.roles.length > 0) {
            // Get the first linked print page
            const firstRole = linkedObjects.roles[0];
            linkId = firstRole.name || null;
            printPageId = firstRole.object?.id || null;
            targetBundleChannel = firstRole.bundleChildChannel || null;
            targetWorkfolder = firstRole.object?.system_attributes?.workfolder || null;
            linkedPagePath = firstRole.object?.path || null;

            console.log(`Story ${loid} is linked to print page: ${printPageId}, bundle channel: ${targetBundleChannel}, page path: ${linkedPagePath}`);
        } else {
            console.log(`No EOM::PrintPageLinked objects found for story ${loid}`);
        }

        const getStoryShapeOptions = {};

        if (targetBundleChannel) getStoryShapeOptions.channel = targetBundleChannel;
        if (targetWorkfolder) getStoryShapeOptions.workFolder = targetWorkfolder;
        if (printPageId) getStoryShapeOptions.pageId = printPageId;

        // Get the story shape information using the new API method
        const shapeResult = await methodeClient.getStoryShape(loid, getStoryShapeOptions);

        // Extract and format the pgx XML string from shapeResult
        const pgxContent = shapeResult?.pgx?.xml || null;
        const pgxValue = pgxContent ? `<?xml version="1.0" encoding="utf-8"?><pgx>${pgxContent}</pgx>` : null;

        pgxValue && console.log(`Extracted and formatted pgx XML for story ${loid}`);

        // Get the actual XML content using readContent method
        const token = methodeClient.getCurrentToken();
        const xmlContentData = await methodeClient.readContent(token, loid);
        const xmlContent = xmlContentData || null;
        
        // Cleanup the client
        await methodeClient.cleanup();
        
        return {
            shape: pgxValue,
            storyObject: storyObject,
            xmlContent: xmlContent,
            printPageId: printPageId,
            targetBundleChannel: targetBundleChannel,
            linkId: linkId,
            linkedPagePath: linkedPagePath
        };

    } catch (error) {
        console.error(`Get story shape with content failed for LOID ${loid}:`, error.message);
        throw error;
    }
}

/**
 * Helper function to create story preview with complex payload handling
 * This handles the middle steps for retrieving content, XML, and shape data
 * before sending to the print service for PDF generation
 */
async function createStoryPreviewWithSetup(loid, previewOptions = {}) {
    const { MethodeClient } = require('./methode-bo-api.js');
    
    try {
        console.log(`Starting story preview generation for LOID: ${loid}`);
        
        // Create a temporary Méthode client for this request
        const methodeClient = new MethodeClient();
        
        // Login with credentials from environment
        await methodeClient.login({
            username: process.env.EDAPI_USERNAME,
            password: process.env.EDAPI_PASSWORD
        });
        
        // Get all required data using the helper function
        const { shape, storyObject, xmlContent, printPageId, targetBundleChannel, linkId, linkedPagePath } = await getStoryShapeWithContent(loid);

        // Log the extracted link information
        console.log(`Preview setup - Print Page ID: ${printPageId}, Target Bundle Channel: ${targetBundleChannel}, Linked Page Path: ${linkedPagePath}`);

        // Build the payload structure as specified
        const previewPayload = {
            requestID: `U${Date.now()}${Math.random().toString(36).substring(2, 8)}`,
            content: xmlContent,
            pgx: shape,
            parameters: {
                id: storyObject.id,
                border: previewOptions.border || "yes",
                hrefPdf: previewOptions.hrefPdf !== false,
                channel: targetBundleChannel,
                lid: linkId,
                page: linkedPagePath
            },
            op: "preview",
            forcePdfCreation: previewOptions.forcePdfCreation !== false
        };

        console.log('Preview payload structure:', JSON.stringify(previewPayload, null, 2));

        // Use the updated API method with proper parameters
        const getPdf = previewOptions.getPdf !== false;
        const previewResult = await methodeClient.createStoryPreview(loid, previewPayload, getPdf);
        
        // Cleanup the client
        await methodeClient.cleanup();

        return previewResult;

    } catch (error) {
        console.error(`Create story preview with setup failed for LOID ${loid}:`, error.message);
        throw error;
    }
}

module.exports = {
    login,
    logout,
    getObjects,
    getObject,
    getObjectLinked,
    createChannelCopy,
    createStory,
    createObject,
    readContent,
    putContentToStory,
    getStoryShapeWithContent,
    createStoryPreviewWithSetup
};
