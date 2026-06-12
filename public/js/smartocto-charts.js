/**
 * SmartOcto Analytics Charts Initializer
 *
 * Initializes Chart.js charts with SmartOcto styling.
 * Requires Chart.js to be loaded first.
 */

(function(window) {
    'use strict';

    // SmartOcto brand colors
    const SMARTOCTO_COLORS = {
        primary: '#7C3AED',        // Vibrant Purple
        secondary: '#14B8A6',      // Teal
        accent: '#3B82F6',         // Blue
        success: '#10B981',        // Green
        warning: '#F59E0B',        // Orange
        danger: '#EF4444',         // Red
        textPrimary: '#1F2937',
        textSecondary: '#6B7280',
        border: '#E5E7EB',
        gridLines: '#F3F4F6',
        background: '#f6f3f6'
    };

    /**
     * Common Chart.js options for SmartOcto style
     */
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: '#fff',
                titleColor: SMARTOCTO_COLORS.textPrimary,
                bodyColor: SMARTOCTO_COLORS.textSecondary,
                borderColor: SMARTOCTO_COLORS.border,
                borderWidth: 1,
                padding: 12,
                displayColors: false,
                titleFont: {
                    size: 13,
                    weight: '600'
                },
                bodyFont: {
                    size: 12
                },
                boxPadding: 6,
                cornerRadius: 8
            }
        }
    };

    /**
     * Initialize Performance Lifecycle line chart (24 hours)
     * @param {string} canvasId - Canvas element ID
     * @param {array} labels - X-axis labels (hours)
     * @param {array} data - Y-axis data (attention/views)
     */
    function initLifecycleChart(canvasId, labels, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) {
            console.error('Canvas not found:', canvasId);
            return null;
        }

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    borderColor: SMARTOCTO_COLORS.primary,
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: SMARTOCTO_COLORS.primary,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 3
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textSecondary,
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: SMARTOCTO_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textSecondary,
                            font: {
                                size: 11
                            },
                            callback: function(value) {
                                if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'K';
                                }
                                return value;
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                return 'Views: ' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialize Traffic Sources horizontal bar chart
     * @param {string} canvasId - Canvas element ID
     * @param {object} sources - Traffic sources with percentages
     */
    function initTrafficSourcesChart(canvasId, sources) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) {
            console.error('Canvas not found:', canvasId);
            return null;
        }

        const labels = Object.keys(sources);
        const data = Object.values(sources);

        // SmartOcto gradient colors for different sources
        const colors = [
            SMARTOCTO_COLORS.primary,    // Direct
            SMARTOCTO_COLORS.secondary,  // Social
            SMARTOCTO_COLORS.accent,     // Search
            SMARTOCTO_COLORS.warning,    // Referral
            SMARTOCTO_COLORS.textSecondary  // Email
        ];

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 6,
                    barThickness: 28
                }]
            },
            options: {
                indexAxis: 'y',
                ...commonOptions,
                scales: {
                    x: {
                        beginAtZero: true,
                        max: Math.max(...data) * 1.1,
                        grid: {
                            color: SMARTOCTO_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textSecondary,
                            font: {
                                size: 11
                            },
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textPrimary,
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x.toFixed(1) + '% of traffic';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialize Read Depth Distribution stacked area chart
     * @param {string} canvasId - Canvas element ID
     * @param {object} scrollDepth - Scroll depth data with percentages
     */
    function initReadDepthChart(canvasId, scrollDepth) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) {
            console.error('Canvas not found:', canvasId);
            return null;
        }

        const labels = Object.keys(scrollDepth.percentages);
        const data = Object.values(scrollDepth.percentages);

        // Gradient colors from light to dark purple/teal
        const colors = [
            'rgba(239, 68, 68, 0.6)',    // 0-25% - Red (low engagement)
            'rgba(245, 158, 11, 0.6)',   // 25-50% - Orange
            'rgba(20, 184, 166, 0.6)',   // 50-75% - Teal
            'rgba(124, 58, 237, 0.6)'    // 75-100% - Purple (high engagement)
        ];

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 6,
                    barThickness: 50
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textPrimary,
                            font: {
                                size: 11,
                                weight: '500'
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: SMARTOCTO_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textSecondary,
                            font: {
                                size: 11
                            },
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y.toFixed(1) + '% of readers';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialize Engagement Funnel horizontal bar chart
     * @param {string} canvasId - Canvas element ID
     * @param {object} funnel - Engagement funnel data
     */
    function initEngagementFunnelChart(canvasId, funnel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) {
            console.error('Canvas not found:', canvasId);
            return null;
        }

        const labels = ['Visitors', 'Readers', 'Engaged', 'Shared', 'Converted'];
        const data = [
            funnel.visitors,
            funnel.readers,
            funnel.engaged,
            funnel.shared,
            funnel.converted
        ];

        // Gradient from light to dark purple
        const colors = [
            'rgba(124, 58, 237, 0.3)',
            'rgba(124, 58, 237, 0.5)',
            'rgba(124, 58, 237, 0.7)',
            'rgba(124, 58, 237, 0.85)',
            'rgba(124, 58, 237, 1)'
        ];

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 6,
                    barThickness: 32
                }]
            },
            options: {
                indexAxis: 'y',
                ...commonOptions,
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            color: SMARTOCTO_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textSecondary,
                            font: {
                                size: 11
                            },
                            callback: function(value) {
                                if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'K';
                                }
                                return value;
                            }
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: SMARTOCTO_COLORS.textPrimary,
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x.toLocaleString() + ' users';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialize Device Performance donut chart
     * @param {string} canvasId - Canvas element ID
     * @param {object} devices - Device breakdown with percentages
     */
    function initDeviceChart(canvasId, devices) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) {
            console.error('Canvas not found:', canvasId);
            return null;
        }

        const labels = Object.keys(devices);
        const data = Object.values(devices);

        // SmartOcto colors for devices
        const colors = [
            SMARTOCTO_COLORS.primary,    // Desktop (purple)
            SMARTOCTO_COLORS.secondary,  // Mobile (teal)
            SMARTOCTO_COLORS.accent      // Tablet (blue)
        ];

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                ...commonOptions,
                cutout: '70%',
                plugins: {
                    ...commonOptions.plugins,
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: SMARTOCTO_COLORS.textPrimary,
                            font: {
                                size: 12,
                                weight: '500'
                            },
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        ...commonOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return label + ': ' + value.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    // Export to global scope
    window.SmartOctoCharts = {
        initLifecycleChart,
        initTrafficSourcesChart,
        initReadDepthChart,
        initEngagementFunnelChart,
        initDeviceChart
    };

})(window);
