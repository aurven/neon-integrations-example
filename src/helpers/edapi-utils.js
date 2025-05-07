const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const SERVER_EDAPI = process.env.SERVER_EDAPI;
const EDAPI_REST_ENDPOINT = process.env.EDAPI_REST_ENDPOINT;
const EDAPIURL = SERVER_EDAPI + EDAPI_REST_ENDPOINT;
const CONNECTIONID = process.env.CONNECTIONID;
const DATABASEID = process.env.DATABASEID;

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

async function login({ username, password }) {
    const authEndpoint = '/v3/auth/login';
    const authUrl = `${EDAPIURL}${authEndpoint}`;

    const authPayload = {
        applicationId: 'neonToMethodeApp',
        connectionId: CONNECTIONID,
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
        await client.request(config)
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
        databaseId: DATABASEID,
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

module.exports = {
    login,
    logout,
    getObjects,
    getObject,
    createStory,
    createObject,
    readContent,
    putContentToStory
};
