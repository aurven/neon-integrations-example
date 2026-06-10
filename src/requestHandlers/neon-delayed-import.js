const delayedImporter = require("../delayed-importer.js");
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");

// Delayed simulated feed into Neon
async function submitJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("submitJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  console.log("submitJobHandler << IN:");
  const safeRequest = safeLogRequest(request?.headers || {}, request?.body || {});
  console.log("Request Headers:", JSON.stringify(safeRequest.headers));
  console.log("Request Body:", JSON.stringify(safeRequest.body));

  const validation = delayedImporter.validatePayload(request.body);
  if (!validation.valid) {
    console.error(`submitJobHandler << ERROR: ${validation.error}`);
    return reply.status(400).send({ error: validation.error });
  }

  const job = delayedImporter.createJob(request.body);

  console.log("submitJobHandler << OUT:", JSON.stringify(job));
  return reply.status(202).send(job);
}

async function listJobsHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("listJobsHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  return reply.status(200).send({ jobs: delayedImporter.listJobs() });
}

async function getJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("getJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const job = delayedImporter.getJob(request.params.jobId);
  if (!job) {
    return reply.status(404).send({ error: "Job not found" });
  }
  return reply.status(200).send(job);
}

async function cancelJobHandler(request, reply) {
  const auth = authenticate(request, reply);
  if (!auth.authenticated) {
    console.log("cancelJobHandler << ERROR: Unauthorized");
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const result = delayedImporter.cancelJob(request.params.jobId);
  if (result === null) {
    return reply.status(404).send({ error: "Job not found" });
  }
  if (result.error) {
    return reply.status(409).send({ error: result.error });
  }
  console.log("cancelJobHandler << OUT:", JSON.stringify({ jobId: result.jobId, state: result.state }));
  return reply.status(200).send(result);
}

module.exports = {
  submitJobHandler,
  listJobsHandler,
  getJobHandler,
  cancelJobHandler,
};
