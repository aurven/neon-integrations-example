const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const NEON_BASEURL = process.env.NEON_BO_URL;
const NEON_USERNAME = process.env.NEON_USERNAME;
const NEON_PASSWORD = process.env.NEON_PASSWORD;
const NEON_BO_APIKEY = process.env.NEON_BO_APIKEY;

async function login() {
    const data = JSON.stringify({
        "name": NEON_USERNAME,
        "password": NEON_PASSWORD
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/sessions/login?rememberMe=true`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function logout(all = false) {
    const data = JSON.stringify({});

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/sessions/logout?all=${all ? 'true' : 'false'}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function deleteNode(familyRef, force = false) {
    const config = {
        method: 'delete',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes?familyRefs=${familyRef}&unpublish=${force}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function lockNode(familyRef) {
    const data = JSON.stringify([
        familyRef
    ]);

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/lock`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function unlockNode(familyRef, unlockMode = 'MAJOR') {
    const data = JSON.stringify([
        familyRef
    ]);

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/unlock?unlockMode=${unlockMode}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function updateNodeContent(familyRef, xmlBodyString) {
    const data = xmlBodyString;

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/story/${familyRef}?saveMode=UPDATE_ONLY&keepCheckedout=false`,
        headers: {
            'Content-Type': 'application/xml',
            'Accept': 'text/xml',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };
    
    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return true;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
            return false;
        });
}

async function createNewStory(options) {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/story`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data.node.familyRef;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function getSites() {
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/core/sites`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data.result;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function createNewSiteNode(options, realm = 'default') {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/core/sites/nodes/create?realm=${realm}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data.id;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function publishSiteNode(options, realm = 'default', viewStatus = 'LIVE') {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/core/sites/nodes/publish?realm=${realm}&viewStatus=${viewStatus}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function createUser(options) {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/users/create`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function getUsers() {
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/users?limit=100`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function addUserToGroup(userId, groupName) {
    const data = JSON.stringify({
        id: userId,
        group: groupName
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/users/groups/add?realm=default`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function createGroup(options) {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/groups/create`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function updateGroup(options) {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/directory/groups/update`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function updateWorkspace({parentWorkspaceName, targetWorkspaceId, options}) {
    const data = JSON.stringify(options);

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/folders/config/${parentWorkspaceName}/${targetWorkspaceId}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function updateWorkspaceTemplates({targetWorkspaceId, options}) {
    const data = JSON.stringify(options);

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/folders/templates/${targetWorkspaceId}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function getWorkspace() {
    // TODO
}

async function createBasefolder(options) {
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/folders`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

// Workflow
async function getNextSteps(familyRef = null) {
    if (familyRef === null) return null;

    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/${familyRef}/workflow/nextsteps`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function nextStepAssignment(familyRef = null, options) {
    if (familyRef === null) return null;

    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/${familyRef}/workflow/nextsteps`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    return await client.request(config)
        .then((response) => {
            console.log(JSON.stringify(response.data));
            return response;
        })
        .catch((error) => {
            console.error(`❌ ERROR: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}



module.exports = {
  login,
  logout,
  deleteNode,
  lockNode,
  unlockNode,
  updateNodeContent,
  createNewStory,
  getSites,
  createNewSiteNode,
  publishSiteNode,
  createUser,
  getUsers,
  addUserToGroup,
  createGroup,
  updateGroup,
  getWorkspace,
  updateWorkspace,
  updateWorkspaceTemplates,
  createBasefolder,
};