/**
 * SmartOcto Analytics Data Generator
 *
 * Generates realistic, deterministic fake analytics data based on a UUID seed.
 * Same UUID will always produce the same data.
 *
 * Mimics SmartOcto metrics and insights.
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
     * Generate time series data with realistic decay pattern for article lifecycle
     * @param {function} random - Seeded random function
     * @param {number} peakValue - Peak metric value
     * @param {number} hours - Number of hours (default 24)
     * @returns {array} Array of values for each hour
     */
    function generateLifecycleData(random, peakValue, hours = 24) {
        const data = [];

        for (let i = 0; i < hours; i++) {
            let decay;
            if (i < 2) {
                // Initial spike: 80-100% of peak
                decay = randFloat(random, 0.8, 1.0, 2);
            } else if (i < 6) {
                // First decline: 50-80% of peak
                decay = randFloat(random, 0.5, 0.8, 2);
            } else if (i < 12) {
                // Steady state: 20-40% of peak
                decay = randFloat(random, 0.2, 0.4, 2);
            } else {
                // Long tail: 5-20% of peak
                decay = randFloat(random, 0.05, 0.2, 2);
            }
            data.push(Math.round(peakValue * decay));
        }

        return data;
    }

    /**
     * Generate scroll depth distribution data
     * @param {function} random - Seeded random function
     * @param {number} totalViews - Total page views
     * @returns {object} Scroll depth buckets
     */
    function generateScrollDepth(random, totalViews) {
        // Generate realistic funnel: fewer people read deeper
        const raw = {
            '0-25%': randFloat(random, 15, 30, 1),
            '25-50%': randFloat(random, 20, 35, 1),
            '50-75%': randFloat(random, 20, 30, 1),
            '75-100%': randFloat(random, 15, 25, 1)
        };

        const normalized = normalizePercentages(raw);

        // Convert to actual counts
        return {
            '0-25%': Math.round(totalViews * normalized['0-25%'] / 100),
            '25-50%': Math.round(totalViews * normalized['25-50%'] / 100),
            '50-75%': Math.round(totalViews * normalized['50-75%'] / 100),
            '75-100%': Math.round(totalViews * normalized['75-100%'] / 100),
            percentages: normalized
        };
    }

    /**
     * Generate engagement funnel data
     * @param {function} random - Seeded random function
     * @param {number} views - Total views
     * @returns {object} Funnel stages with counts
     */
    function generateEngagementFunnel(random, views) {
        // Each stage has fewer people (realistic funnel)
        const visitors = views;
        const readers = Math.round(visitors * randFloat(random, 0.60, 0.75, 2)); // 60-75% read
        const engaged = Math.round(readers * randFloat(random, 0.45, 0.60, 2)); // 45-60% engaged
        const shared = Math.round(engaged * randFloat(random, 0.08, 0.15, 2)); // 8-15% share
        const converted = Math.round(shared * randFloat(random, 0.20, 0.40, 2)); // 20-40% convert

        return {
            visitors,
            readers,
            engaged,
            shared,
            converted,
            // Conversion rates between stages
            visitorToReader: parseFloat(((readers / visitors) * 100).toFixed(1)),
            readerToEngaged: parseFloat(((engaged / readers) * 100).toFixed(1)),
            engagedToShared: parseFloat(((shared / engaged) * 100).toFixed(1)),
            sharedToConverted: parseFloat(((converted / shared) * 100).toFixed(1))
        };
    }

    /**
     * Generate complete SmartOcto metrics for an article
     * @param {string} uuid - Article UUID
     * @returns {object} Complete SmartOcto metrics object
     */
    function generateSmartOctoMetrics(uuid) {
        const seed = hashUUID(uuid);
        const random = createSeededRandom(seed);

        // Primary metrics
        const pageViews = randInt(random, 800, 45000);
        const attentionScore = randInt(random, 35, 95); // SmartOcto's proprietary score (0-100)
        const readRatio = randFloat(random, 45, 85, 1); // % who actually read
        const avgEngagementTime = randInt(random, 45, 480); // 45s - 8min
        const recirculationRate = randFloat(random, 15, 55, 1); // % who click to another article
        const socialShares = randInt(random, 10, 850);

        // Content quality metrics
        const contentHealthScore = randInt(random, 60, 98); // Overall quality (0-100)
        const completionRate = randFloat(random, 30, 75, 1); // % who read to the end
        const loyaltyIndex = randFloat(random, 20, 70, 1); // Returning visitor engagement

        // Traffic sources (raw values, will be normalized)
        const trafficSourcesRaw = {
            'Direct': randFloat(random, 15, 35, 1),
            'Social Media': randFloat(random, 20, 45, 1),
            'Search Engines': randFloat(random, 15, 35, 1),
            'Referrals': randFloat(random, 5, 20, 1),
            'Email': randFloat(random, 2, 15, 1)
        };
        const trafficSources = normalizePercentages(trafficSourcesRaw);

        // Device breakdown (raw values, will be normalized)
        const devicesRaw = {
            'Desktop': randFloat(random, 35, 55, 1),
            'Mobile': randFloat(random, 35, 55, 1),
            'Tablet': randFloat(random, 5, 15, 1)
        };
        const devices = normalizePercentages(devicesRaw);

        // Performance prediction
        const predictedViews = Math.round(pageViews * randFloat(random, 0.90, 1.10, 2));
        const performanceVsPrediction = parseFloat((((pageViews - predictedViews) / predictedViews) * 100).toFixed(1));

        // Time series data (24 hours article lifecycle)
        const lifecycleData = generateLifecycleData(random, Math.round(pageViews / 10), 24);

        // Scroll depth distribution
        const scrollDepth = generateScrollDepth(random, pageViews);

        // Engagement funnel
        const engagementFunnel = generateEngagementFunnel(random, pageViews);

        // Social media breakdown
        const socialBreakdownRaw = {
            'Facebook': randFloat(random, 30, 50, 1),
            'Twitter': randFloat(random, 20, 35, 1),
            'LinkedIn': randFloat(random, 10, 25, 1),
            'WhatsApp': randFloat(random, 5, 20, 1),
            'Other': randFloat(random, 2, 10, 1)
        };
        const socialBreakdown = normalizePercentages(socialBreakdownRaw);

        // Calculate trends (comparing to "previous period")
        const trends = {
            attentionScore: randFloat(random, -12, 35, 1),
            pageViews: randFloat(random, -15, 45, 1),
            readRatio: randFloat(random, -8, 20, 1),
            avgEngagementTime: randFloat(random, -10, 25, 1),
            recirculationRate: randFloat(random, -5, 18, 1),
            socialShares: randFloat(random, -20, 60, 1)
        };

        // AI-generated recommendations
        const recommendations = [
            {
                type: 'headline',
                priority: attentionScore < 60 ? 'high' : 'medium',
                text: attentionScore < 60
                    ? 'Consider A/B testing alternative headlines to improve engagement'
                    : 'Headline performing well - maintain current style'
            },
            {
                type: 'timing',
                priority: 'medium',
                text: `Optimal publish time for similar content: ${randInt(random, 6, 10)}:00 AM`
            },
            {
                type: 'length',
                priority: completionRate < 50 ? 'high' : 'low',
                text: completionRate < 50
                    ? 'Article may be too long - consider breaking into series'
                    : 'Content length is optimal for your audience'
            },
            {
                type: 'social',
                priority: socialShares < 100 ? 'medium' : 'low',
                text: socialShares < 100
                    ? 'Add more shareable quotes and key takeaways'
                    : 'Social sharing performance is strong'
            }
        ];

        return {
            // Primary metrics
            attentionScore,
            pageViews,
            readRatio,
            avgEngagementTime,
            avgEngagementTimeFormatted: formatTime(avgEngagementTime),
            recirculationRate,
            socialShares,

            // Quality metrics
            contentHealthScore,
            completionRate,
            loyaltyIndex,

            // Traffic sources
            trafficSources,

            // Devices
            devices,

            // Performance metrics
            predictedViews,
            performanceVsPrediction,

            // Time series
            lifecycleData,
            lifecycleLabels: Array.from({length: 24}, (_, i) => i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i-12}pm`),

            // Scroll depth
            scrollDepth,

            // Engagement funnel
            engagementFunnel,

            // Social breakdown
            socialBreakdown,

            // Trends (percentage change)
            trends,

            // Recommendations
            recommendations,

            // Additional computed metrics
            readersCount: Math.round(pageViews * (readRatio / 100)),
            engagedReadersCount: engagementFunnel.engaged,

            // Metadata
            uuid,
            generatedAt: new Date().toISOString(),
            isLive: random() > 0.5 // Random "live" status for demo
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

    /**
     * Get score color based on value (0-100)
     * @param {number} score - Score value
     * @returns {string} Tailwind color class
     */
    function getScoreColor(score) {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-teal-600';
        if (score >= 40) return 'text-yellow-600';
        return 'text-orange-600';
    }

    /**
     * Get priority badge color
     * @param {string} priority - Priority level (high, medium, low)
     * @returns {string} Tailwind color classes
     */
    function getPriorityColor(priority) {
        switch(priority) {
            case 'high': return 'bg-red-100 text-red-800';
            case 'medium': return 'bg-yellow-100 text-yellow-800';
            case 'low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    // Export to global scope
    window.SmartOctoDataGenerator = {
        generateSmartOctoMetrics,
        getTrendIndicator,
        getScoreColor,
        getPriorityColor,
        hashUUID
    };

})(window);
