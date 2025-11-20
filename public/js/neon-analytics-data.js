/**
 * Neon Analytics Data Processing Module
 * Parses and transforms Neon CMS metrics API responses for visualization
 */

/**
 * Parse Neon Metrics API Response
 * @param {Object} apiResponse - Raw API response from Neon metrics endpoint
 * @returns {Object} Parsed and processed metrics data
 */
function parseNeonMetrics(apiResponse) {
    if (!apiResponse || !apiResponse.aggregations) {
        throw new Error('Invalid API response format');
    }

    const agg = apiResponse.aggregations;
    const metadata = apiResponse.metadata || {};

    // Extract bucket aggregations
    const types = extractBuckets(agg.Types);
    const users = extractBuckets(agg.Users || agg.userNames); // Handle different naming
    const workfolders = extractBuckets(agg.Workfolders);
    const endpoints = extractBuckets(agg.Endpoints);
    const timeBuckets = extractTimeBuckets(agg.Time);

    // Calculate derived metrics
    const totalItems = metadata.totalHits || 0;
    const uniqueTypes = types.length;
    const uniqueUsers = users.length;
    const uniqueFolders = workfolders.length;
    const avgPerUser = uniqueUsers > 0 ? totalItems / uniqueUsers : 0;

    // Process time series data
    const timeSeriesData = processTimeSeries(timeBuckets);

    // Find peak day
    const peakDay = findPeakDay(timeBuckets);

    // Aggregate hourly data
    const hourlyData = aggregateByHour(timeBuckets);

    return {
        // Raw data
        metadata,
        types,
        users,
        workfolders,
        endpoints,
        timeBuckets,

        // Calculated metrics
        totalItems,
        uniqueTypes,
        uniqueUsers,
        uniqueFolders,
        avgPerUser,
        peakDay,

        // Time series
        timeSeriesData,
        hourlyData,

        // Query performance
        tookMs: metadata.tookMs || 0
    };
}

/**
 * Extract bucket data from aggregation
 * @param {Object} aggregation - Aggregation with buckets
 * @returns {Array} Array of {key, docCount} objects
 */
function extractBuckets(aggregation) {
    if (!aggregation || !aggregation.buckets) return [];

    return aggregation.buckets.map(bucket => ({
        key: bucket.key,
        docCount: bucket.docCount || 0,
        aggregations: bucket.aggregations || []
    }));
}

/**
 * Extract time buckets with nested aggregations
 * @param {Object} timeAggregation - Time aggregation with date histogram
 * @returns {Array} Array of time bucket objects
 */
function extractTimeBuckets(timeAggregation) {
    if (!timeAggregation || !timeAggregation.buckets) return [];

    return timeAggregation.buckets.map(bucket => {
        const result = {
            key: bucket.key,
            date: new Date(bucket.key),
            docCount: bucket.docCount || 0,
            start: bucket.start
        };

        // Extract nested aggregations if present
        if (bucket.aggregations && Array.isArray(bucket.aggregations)) {
            bucket.aggregations.forEach(agg => {
                if (agg.name === 'Types' && agg.buckets) {
                    result.typeBreakdown = extractBuckets(agg);
                } else if (agg.type === 'count') {
                    result[agg.name] = agg.docCount;
                }
            });
        }

        return result;
    });
}

/**
 * Process time series for charting
 * Groups by day and calculates cumulative
 * @param {Array} timeBuckets - Time bucket array
 * @returns {Object} Processed time series data
 */
function processTimeSeries(timeBuckets) {
    if (!timeBuckets.length) {
        return { daily: [], cumulative: [], labels: [] };
    }

    // Group by day (8-hour buckets -> daily aggregation)
    const dailyMap = new Map();

    timeBuckets.forEach(bucket => {
        const date = new Date(bucket.date);
        const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, {
                date: dayKey,
                docCount: 0,
                bucketCount: 0
            });
        }

        const dayData = dailyMap.get(dayKey);
        dayData.docCount += bucket.docCount;
        dayData.bucketCount += 1;
    });

    // Convert to sorted arrays
    const dailyArray = Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
    );

    // Calculate cumulative
    let cumSum = 0;
    const cumulative = dailyArray.map(day => {
        cumSum += day.docCount;
        return cumSum;
    });

    // Format labels
    const labels = dailyArray.map(day => {
        const d = new Date(day.date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
        daily: dailyArray.map(d => d.docCount),
        cumulative,
        labels,
        rawData: dailyArray
    };
}

/**
 * Find peak activity day
 * @param {Array} timeBuckets - Time bucket array
 * @returns {Object} Peak day info
 */
function findPeakDay(timeBuckets) {
    if (!timeBuckets.length) {
        return { date: '--', count: 0 };
    }

    // Group by day first
    const dailyMap = new Map();

    timeBuckets.forEach(bucket => {
        const date = new Date(bucket.date);
        const dayKey = date.toISOString().split('T')[0];

        if (!dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, { date: dayKey, docCount: 0 });
        }

        dailyMap.get(dayKey).docCount += bucket.docCount;
    });

    // Find max
    let maxDay = { date: '--', docCount: 0 };
    dailyMap.forEach(day => {
        if (day.docCount > maxDay.docCount) {
            maxDay = day;
        }
    });

    // Format date
    const peakDate = new Date(maxDay.date);
    const formatted = peakDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });

    return {
        date: formatted,
        count: maxDay.docCount,
        rawDate: maxDay.date
    };
}

/**
 * Aggregate time buckets by hour of day (0-23)
 * @param {Array} timeBuckets - Time bucket array
 * @returns {Array} Array of 24 values (one per hour)
 */
function aggregateByHour(timeBuckets) {
    const hourlyData = Array(24).fill(0);
    const hourlyCounts = Array(24).fill(0);

    timeBuckets.forEach(bucket => {
        const date = new Date(bucket.date);
        const hour = date.getHours();

        hourlyData[hour] += bucket.docCount;
        hourlyCounts[hour] += 1;
    });

    // Calculate averages
    return hourlyData.map((total, hour) => {
        const count = hourlyCounts[hour];
        return count > 0 ? Math.round(total / count) : 0;
    });
}

/**
 * Generate color gradient from Neon blue to pink
 * @param {number} steps - Number of gradient steps
 * @returns {Array} Array of color strings
 */
function generateNeonGradient(steps) {
    const blueR = 40, blueG = 71, blueB = 226;   // #2847E2
    const pinkR = 247, pinkG = 88, pinkB = 128;  // #F75880

    const gradient = [];

    for (let i = 0; i < steps; i++) {
        const ratio = i / (steps - 1);
        const r = Math.round(blueR + (pinkR - blueR) * ratio);
        const g = Math.round(blueG + (pinkG - blueG) * ratio);
        const b = Math.round(blueB + (pinkB - blueB) * ratio);

        gradient.push(`rgb(${r}, ${g}, ${b})`);
    }

    return gradient;
}

/**
 * Generate intensity gradient for heatmaps (light to dark blue)
 * @param {number} steps - Number of intensity levels
 * @returns {Array} Array of color strings
 */
function generateIntensityGradient(steps) {
    const baseR = 40, baseG = 71, baseB = 226; // #2847E2

    const gradient = [];

    for (let i = 0; i < steps; i++) {
        const intensity = i / (steps - 1);
        const r = Math.round(255 - (255 - baseR) * intensity);
        const g = Math.round(255 - (255 - baseG) * intensity);
        const b = Math.round(255 - (255 - baseB) * intensity);

        gradient.push(`rgb(${r}, ${g}, ${b})`);
    }

    return gradient;
}

/**
 * Calculate color based on value intensity
 * @param {number} value - Value to map to color
 * @param {number} max - Maximum value in dataset
 * @returns {string} RGB color string
 */
function getHeatmapColor(value, max) {
    if (value === 0) return '#F3F4F6'; // Gray for zero

    const intensity = value / max;
    const colors = generateIntensityGradient(5);

    if (intensity < 0.2) return colors[0];
    if (intensity < 0.4) return colors[1];
    if (intensity < 0.6) return colors[2];
    if (intensity < 0.8) return colors[3];
    return colors[4];
}

/**
 * Sort buckets by docCount descending
 * @param {Array} buckets - Array of bucket objects
 * @param {number} limit - Max number to return
 * @returns {Array} Sorted and limited buckets
 */
function sortAndLimitBuckets(buckets, limit = 10) {
    return buckets
        .sort((a, b) => b.docCount - a.docCount)
        .slice(0, limit);
}

/**
 * Format large numbers with K/M suffix
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

/**
 * Calculate percentage of total
 * @param {number} value - Part value
 * @param {number} total - Total value
 * @returns {string} Formatted percentage
 */
function calculatePercentage(value, total) {
    if (total === 0) return '0%';
    return ((value / total) * 100).toFixed(1) + '%';
}

// Export for use in other modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseNeonMetrics,
        extractBuckets,
        extractTimeBuckets,
        processTimeSeries,
        findPeakDay,
        aggregateByHour,
        generateNeonGradient,
        generateIntensityGradient,
        getHeatmapColor,
        sortAndLimitBuckets,
        formatNumber,
        calculatePercentage
    };
}
