const neon = require('../helpers/neon-bo-api-v3.js');
const { applyMetadataChanges } = require('../helpers/metadata-xpath-utils.js');
const { authenticate } = require('../helpers/auth.js');
const { safeLogRequest } = require('../helpers/utils.js');

/**
 * POST /utilities/metadata/update
 * Body: { familyRef: string, changes: [{ xpath, action: 'set'|'unset', value? }] }
 *
 * Fetches the node's ObjectMetadata XML, applies the requested xpath
 * set/unset changes, and saves it back to Neon.
 */
async function updateMetadataHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("updateMetadataHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const { familyRef, changes } = request.body || {};

  console.log("updateMetadataHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  if (!familyRef) {
    console.error("updateMetadataHandler << ERROR: familyRef is required");
    return reply.status(400).send({ error: "familyRef is required" });
  }

  if (!Array.isArray(changes) || changes.length === 0) {
    console.error("updateMetadataHandler << ERROR: changes must be a non-empty array");
    return reply.status(400).send({ error: "changes must be a non-empty array" });
  }

  try {
    let updatedXml = await neon.getNodeMetadata(familyRef);
    for (const change of changes) {
      try {
        updatedXml = applyMetadataChanges(updatedXml, [change]);
      } catch (error) {
        console.warn(`⚠️ updateMetadataHandler: failed to apply change ${JSON.stringify(change)}: ${error.message}`);
      }
    }
    const success = await neon.updateNodeMetadata(familyRef, updatedXml);

    if (!success) {
      console.error("updateMetadataHandler << ERROR: updateNodeMetadata returned falsy");
      return reply.status(502).send({ error: "Failed to update node metadata" });
    }

    const result = { success: true, familyRef };
    console.log("updateMetadataHandler << OUT:");
    console.log("Response Data:", result);
    return reply.status(200).send(result);
  } catch (error) {
    console.error("updateMetadataHandler << ERROR:", error.message);
    return reply.status(502).send({ error: error.message });
  }
}

module.exports = {
  updateMetadataHandler
};
