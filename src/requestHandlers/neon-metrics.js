const neonApi = require('../helpers/neon-bo-api-v2.js');
const { safeLogRequest } = require("../helpers/utils.js");
const { authenticate } = require("../helpers/auth.js");
const fs = require('fs');
const path = require('path');

/**
 * Get available metrics reports from Neon BO
 * GET /neon/api/core/metrics
 */
async function getMetricsReportsHandler(request, reply) {
    console.log("getMetricsReportsHandler << IN:");
    const safeRequest = safeLogRequest(request?.headers || {}, {});
    console.log("Request Headers:", JSON.stringify(safeRequest.headers));

    const isDemoMode = request.query.demo === 'true';

    if (isDemoMode) {
        // Return demo data
        const demoReportsPath = path.join(__dirname, '../../public/data/neon-analytics/available-reports.json');
        try {
            const demoData = JSON.parse(fs.readFileSync(demoReportsPath, 'utf8'));
            console.log("getMetricsReportsHandler << OUT (demo mode):");
            return reply.status(200).send(demoData);
        } catch (error) {
            console.error("Failed to load demo reports data:", error.message);
            return reply.status(500).send({ error: "Failed to load demo data" });
        }
    }

    try {
        const result = await neonApi.getMetricsReports();
        console.log("getMetricsReportsHandler << OUT:");
        console.log("Response Data:", result);
        return reply.status(200).send(result);
    } catch (error) {
        console.error("getMetricsReportsHandler << ERROR:", error.message);
        return reply.status(error.response?.status || 500).send({
            error: error.message,
            details: error.response?.data || null
        });
    }
}

/**
 * Get specific metrics data from Neon BO
 * GET /neon/api/core/metrics/:reportId
 */
async function getMetricsDataHandler(request, reply) {
    const { reportId } = request.params;

    console.log("getMetricsDataHandler << IN:");
    const safeRequest = safeLogRequest(request?.headers || {}, {});
    console.log("Request Headers:", JSON.stringify(safeRequest.headers));
    console.log("Report ID:", reportId);

    const isDemoMode = request.query.demo === 'true';

    if (isDemoMode) {
        // Return demo data based on reportId
        const demoDataPath = path.join(__dirname, `../../public/data/neon-analytics/api-metrics-example-${reportId}.json`);
        try {
            if (fs.existsSync(demoDataPath)) {
                const demoData = JSON.parse(fs.readFileSync(demoDataPath, 'utf8'));
                console.log("getMetricsDataHandler << OUT (demo mode):");
                return reply.status(200).send(demoData);
            } else {
                return reply.status(404).send({ error: `Demo data for report '${reportId}' not found` });
            }
        } catch (error) {
            console.error("Failed to load demo metrics data:", error.message);
            return reply.status(500).send({ error: "Failed to load demo data" });
        }
    }

    try {
        const result = await neonApi.getMetricsData(reportId);
        console.log("getMetricsDataHandler << OUT:");
        console.log("Response Data:", result);
        return reply.status(200).send(result);
    } catch (error) {
        console.error("getMetricsDataHandler << ERROR:", error.message);
        return reply.status(error.response?.status || 500).send({
            error: error.message,
            details: error.response?.data || null
        });
    }
}

module.exports = {
    getMetricsReportsHandler,
    getMetricsDataHandler
};
