/**
 * GA4 Analytics Charts Initializer
 *
 * Initializes Chart.js charts with Google Analytics 4 styling.
 * Requires Chart.js to be loaded first.
 */

(function(window) {
    'use strict';

    // Google Analytics brand colors
    const GA_COLORS = {
        primary: '#1a73e8',        // Google Blue
        red: '#ea4335',            // Google Red
        yellow: '#fbbc04',         // Google Yellow
        green: '#34a853',          // Google Green
        textPrimary: '#202124',
        textSecondary: '#5f6368',
        border: '#dadce0',
        gridLines: '#f1f3f4'
    };

    /**
     * Common Chart.js options for GA4 style
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
                titleColor: GA_COLORS.textPrimary,
                bodyColor: GA_COLORS.textSecondary,
                borderColor: GA_COLORS.border,
                borderWidth: 1,
                padding: 12,
                displayColors: false,
                titleFont: {
                    size: 13,
                    weight: '500'
                },
                bodyFont: {
                    size: 12
                },
                boxPadding: 6
            }
        }
    };

    /**
     * Initialize Traffic Over Time line chart (GA4 style)
     * @param {string} canvasId - Canvas element ID
     * @param {array} labels - X-axis labels (days)
     * @param {array} data - Y-axis data (user counts)
     */
    function initTrafficTimeChart(canvasId, labels, data) {
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
                    borderColor: GA_COLORS.primary,
                    backgroundColor: 'rgba(26, 115, 232, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: GA_COLORS.primary,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
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
                            color: GA_COLORS.textSecondary,
                            font: {
                                size: 11
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: GA_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: GA_COLORS.textSecondary,
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
                                return 'Users: ' + context.parsed.y.toLocaleString();
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

        // Color mapping for different sources
        const colors = [
            GA_COLORS.primary,  // Google
            GA_COLORS.textSecondary,  // Direct
            '#7baaf7',  // Social (light blue)
            '#fbbc04',  // Referral (yellow)
            '#d2d3d5'   // Other (gray)
        ];

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 4,
                    barThickness: 24
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
                            color: GA_COLORS.gridLines,
                            drawBorder: false
                        },
                        ticks: {
                            color: GA_COLORS.textSecondary,
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
                            color: GA_COLORS.textPrimary,
                            font: {
                                size: 12
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
                                return context.parsed.x.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialize Device Category donut chart
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

        // Google colors for devices
        const colors = [
            GA_COLORS.primary,   // Desktop (blue)
            GA_COLORS.green,     // Mobile (green)
            GA_COLORS.yellow     // Tablet (yellow)
        ];

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                ...commonOptions,
                cutout: '65%',
                plugins: {
                    ...commonOptions.plugins,
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: GA_COLORS.textPrimary,
                            font: {
                                size: 12
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
    window.GA4Charts = {
        initTrafficTimeChart,
        initTrafficSourcesChart,
        initDeviceChart
    };

})(window);
