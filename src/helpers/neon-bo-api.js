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
            //console.log(JSON.stringify(response.data));
            const { user } = response.data;
            console.log(`Neon Session initiated. Logged in as ${user.name} [${user.id}]`);
        })
        .catch((error) => {
            console.error(`❌ ERROR during login: ${error.code}`);
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
            console.log('Neon Session terminated successfully.')
            // console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR during logout: ${error.code}`);
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
            console.log(`Node ${familyRef} deleted successfully`);
            // console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR during deleteNode: ${error.code}`);
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
            console.log(`Node ${familyRef} locked successfully`);
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR during lockNode: ${error.code}`);
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
            console.log(`Node ${familyRef} unlocked successfully`);
            // console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR during unlockNode: ${error.code}`);
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
  
    console.log(`Updating Node Content for ${familyRef}`);
    console.log('xmlBodyString', xmlBodyString);
    
    return await client.request(config)
        .then((response) => {
            console.log(`Node Content for ${familyRef} updated successfully`);
            // console.log(JSON.stringify(response.data));
            return true;
        })
        .catch((error) => {
            console.error(`❌ ERROR during updateNodeContent: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
            return false;
        });
}

async function updateNodeMetadata(familyRef, xmlBodyString) {
    const data = xmlBodyString;

    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/${familyRef}/metadata`,
        headers: {
            'Content-Type': 'application/xml',
            'Accept': 'text/xml',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: data
    };
  
    console.log(`Updating Node Metadata for ${familyRef}`);
    console.log('xmlBodyString', xmlBodyString);
    
    return await client.request(config)
        .then((response) => {
            // console.log(JSON.stringify(response.data));
            console.log(`Node Content for ${familyRef} updated successfully`);
            return true;
        })
        .catch((error) => {
            console.error(`❌ ERROR during updateNodeMetadata: ${error.code}`);
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
            const familyRef = response.data.node.familyRef;
            // console.log(JSON.stringify(response.data));
            console.log(`Created new Story: ${familyRef}`);
            return familyRef;
        })
        .catch((error) => {
            console.error(`❌ ERROR during createNewStory: ${error.code}`);
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
            console.log(`Success retrieving sites`);
            console.log(JSON.stringify(response.data));
            return response.data.result;
        })
        .catch((error) => {
            console.error(`❌ ERROR during getSites: ${error.code}`);
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
            const siteId = response.data.id;
            // console.log(JSON.stringify(response.data));
            console.log(`Created new Site! Id: ${siteId}`);
            return siteId;
        })
        .catch((error) => {
            console.error(`❌ ERROR during createNewSiteNode: ${error.code}`);
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
            console.log('Site Node published successfully');
            //console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR publishSiteNode: ${error.code}`);
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
            console.log('New user created.');
            // console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during createUser: ${error.code}`);
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
            console.log('Got Users:');
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during getUsers: ${error.code}`);
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
            console.log(`User ${userId} added to ${groupName}`);
            console.log(JSON.stringify(response.data));
        })
        .catch((error) => {
            console.error(`❌ ERROR during addUserToGroup: ${error.code}`);
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
            console.log('New group created:');
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during createGroup: ${error.code}`);
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
            console.log('Group updated:');
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during updateGroup: ${error.code}`);
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
            console.log('Workspace updated:');
            console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during updateWorkspace: ${error.code}`);
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
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during updateWorkspaceTemplates: ${error.code}`);
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
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during createBasefolder: ${error.code}`);
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
            console.log(`Got next workflow steps for ${familyRef}`);
            //console.log(JSON.stringify(response.data));
            return response;
        })
        .catch((error) => {
            console.error(`❌ ERROR during getNextSteps: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function nextStepAssignment(familyRef = null, options) {
    if (familyRef === null) return null;
  
    const data = JSON.stringify(options);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/workflow/instance/task/nextStepAssignment?objRef=${familyRef}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: options
    };

    return await client.request(config)
        .then((response) => {
            console.log(`Assigned new workflow step to ${familyRef}:`);
            console.log(data);
            //console.log(JSON.stringify(response.data));
            return response;
        })
        .catch((error) => {
            console.error(`❌ ERROR during nextStepAssignment: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

// Images Upload
async function putNode({ boundary, requestBody }) {
    const config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes`,
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data: requestBody
    };

    return await client.request(config)
        .then((response) => {
            //console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during putNode: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

// Promote
async function promoteNode(familyRef = null, { targetSite, targetSection, mode }) {
    if (familyRef === null) return null;
  
    const data = JSON.stringify({
      "siteDetails": [{
        "siteName": targetSite,
        "sitePath": targetSection
      }]
    });

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/contents/nodes/${familyRef}/promote/${mode || 'PREVIEW'}`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        },
        data
    };

    return await client.request(config)
        .then((response) => {
            console.log(`Node ${familyRef} promoted to:`, data);
            //console.log(JSON.stringify(response.data));
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during promoteNode: ${error.code}`);
            console.error(JSON.stringify(error.response.data));
        });
}

async function discoveryServices() {
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `${NEON_BASEURL}/discovery/services`,
        headers: {
            'Content-Type': 'application/json',
            'neon-bo-access-key': NEON_BO_APIKEY
        }
    };

    return await client.request(config)
        .then((response) => {
            console.log('Called /discovery/services successfully');
            return response.data;
        })
        .catch((error) => {
            console.error(`❌ ERROR during discoveryServices: ${error.code}`);
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
  updateNodeMetadata,
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
  getNextSteps,
  nextStepAssignment,
  putNode,
  promoteNode,
  discoveryServices
};