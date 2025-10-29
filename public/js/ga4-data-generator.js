/**
 * GA4 Analytics Data Generator
 *
 * Generates realistic, deterministic fake analytics data based on a UUID seed.
 * Same UUID will always produce the same data.
 *
 * Mimics Google Analytics 4 metrics and dimensions.
 */

(function(window) {
    'use strict';

    /**
     * Hash a UUID string to get a numeric seed
     * @param {string} uuid - The UUID to hash
     * @returns {number} A positive integer seed
     */
    function hashUUID(uuid) {
        let hash = 0;
        const str = uuid || 'default-uuid';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Create a seeded random number generator (Mulberry32 algorithm)
     * @param {number} seed - The seed value
     * @returns {function} Function that returns random float between 0-1
     */
    function createSeededRandom(seed) {
        return function() {
            seed += 0x6D2B79F5;
            let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    /**
     * Generate a random integer within a range
     * @param {function} random - Seeded random function
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Random integer
     */
    function randInt(random, min, max) {
        return Math.floor(random() * (max - min + 1)) + min;
    }

    /**
     * Generate a random float within a range
     * @param {function} random - Seeded random function
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {number} decimals - Number of decimal places
     * @returns {number} Random float
     */
    function randFloat(random, min, max, decimals = 1) {
        const value = random() * (max - min) + min;
        return parseFloat(value.toFixed(decimals));
    }

    /**
     * Normalize percentages to sum to 100
     * @param {object} obj - Object with percentage values
     * @returns {object} Normalized object
     */
    function normalizePercentages(obj) {
        const total = Object.values(obj).reduce((sum, val) => sum + val, 0);
        const normalized = {};
        Object.keys(obj).forEach(key => {
            normalized[key] = parseFloat(((obj[key] / total) * 100).toFixed(1));
        });
        return normalized;
    }

    /**
     * Format seconds to MM:SS format
     * @param {number} seconds - Total seconds
     * @returns {string} Formatted time
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Generate time series data for traffic chart (7 days)
     * @param {function} random - Seeded random function
     * @param {number} baseValue - Base metric value
     * @param {number} days - Number of days (default 7)
     * @returns {array} Array of values for each day
     */
    function generateTimeSeriesData(random, baseValue, days = 7) {
        const data = [];

        // Day of week patterns: lower on weekends, higher mid-week
        const dayPatterns = [0.7, 0.9, 1.1, 1.15, 1.1, 0.85, 0.65]; // Sun-Sat

        for (let i = 0; i < days; i++) {
            const dayPattern = dayPatterns[i % 7];
            const randomVariation = 0.85 + (random() * 0.3); // 0.85 - 1.15
            const value = Math.round(baseValue * dayPattern * randomVariation);
            data.push(Math.max(0, value));
        }

        return data;
    }

    /**
     * Generate complete GA4 metrics for an article
     * @param {string} uuid - Article UUID
     * @returns {object} Complete GA4 metrics object
     */
    function generateGA4Metrics(uuid) {
        const seed = hashUUID(uuid);
        const random = createSeededRandom(seed);

        // Primary metrics
        const views = randInt(random, 600, 50000);
        const users = Math.round(views * randFloat(random, 0.75, 0.85, 2)); // Users < Views
        const avgEngagementTime = randInt(random, 30, 420); // 30s - 7min
        const bounceRate = randFloat(random, 25, 75, 1);
        const engagementRate = randFloat(random, 40, 85, 1);
        const conversions = randInt(random, 5, 500);

        // Traffic sources (raw values, will be normalized)
        const trafficSourcesRaw = {
            'Google (Organic)': randFloat(random, 20, 50, 1),
            'Direct': randFloat(random, 15, 35, 1),
            'Social Networks': randFloat(random, 10, 30, 1),
            'Referral': randFloat(random, 5, 20, 1),
            'Other': randFloat(random, 2, 10, 1)
        };
        const trafficSources = normalizePercentages(trafficSourcesRaw);

        // Device breakdown (raw values, will be normalized)
        const devicesRaw = {
            'Desktop': randFloat(random, 50, 75, 1),
            'Mobile': randFloat(random, 20, 40, 1),
            'Tablet': randFloat(random, 5, 15, 1)
        };
        const devices = normalizePercentages(devicesRaw);

        // Events (calculated from views)
        const events = {
            'page_view': views,
            'scroll': Math.round(views * 0.6),     // 60% scroll
            'click': Math.round(views * 0.15),     // 15% click
            'share': Math.round(views * 0.04),     // 4% share
            'form_submit': Math.round(views * 0.02) // 2% submit
        };

        // Time series data (7 days)
        const timeSeriesData = generateTimeSeriesData(random, Math.round(users / 7), 7);

        // Calculate trends (comparing to "previous period")
        const trends = {
            users: randFloat(random, -10, 40, 1),
            views: randFloat(random, -10, 40, 1),
            avgEngagementTime: randFloat(random, -15, 30, 1),
            bounceRate: randFloat(random, -20, 15, 1),
            engagementRate: randFloat(random, -10, 25, 1),
            conversions: randFloat(random, -5, 50, 1)
        };

        return {
            // Primary metrics
            users,
            views,
            avgEngagementTime,
            avgEngagementTimeFormatted: formatTime(avgEngagementTime),
            bounceRate,
            engagementRate,
            conversions,

            // Traffic sources
            trafficSources,

            // Devices
            devices,

            // Events
            events,

            // Time series
            timeSeriesData,
            timeSeriesLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

            // Trends (percentage change)
            trends,

            // Additional computed metrics
            viewsPerUser: parseFloat((views / users).toFixed(2)),
            avgTimeOnPage: avgEngagementTime,

            // Metadata
            uuid,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Get trend indicator (up/down arrow and color)
     * @param {number} trend - Trend percentage
     * @param {boolean} inverse - If true, negative is good (like bounce rate)
     * @returns {object} Icon and color class
     */
    function getTrendIndicator(trend, inverse = false) {
        const isPositive = inverse ? trend < 0 : trend > 0;
        return {
            icon: isPositive ? '↑' : '↓',
            color: isPositive ? 'text-green-600' : 'text-red-600',
            value: Math.abs(trend).toFixed(1) + '%'
        };
    }

    // Export to global scope
    window.GA4DataGenerator = {
        generateGA4Metrics,
        getTrendIndicator,
        hashUUID
    };

})(window);
