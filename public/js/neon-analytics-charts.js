/**
 * Neon Analytics Charts Module
 * Chart.js initialization and configuration for Neon CMS metrics visualization
 */

// Neon color palette
const NEON_COLORS = {
    blue: '#2847E2',
    pink: '#F75880',
    black: '#1D1930',
    white: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    gridLines: '#E5E7EB',
    background: '#F9FAFB',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444'
};

// Common Chart.js options
const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            position: 'bottom',
            labels: {
                color: NEON_COLORS.textPrimary,
                font: { size: 12, weight: '500' },
                padding: 16,
                usePointStyle: true
            }
        },
        tooltip: {
            backgroundColor: NEON_COLORS.white,
            titleColor: NEON_COLORS.textPrimary,
            bodyColor: NEON_COLORS.textSecondary,
            borderColor: NEON_COLORS.blue,
            borderWidth: 2,
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 12 },
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y.toLocaleString();
                    }
                    return label;
                }
            }
        }
    }
};

/**
 * Initialize Timeline Activity Chart (Dual-axis: bars + line)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initTimelineChart(data) {
    const ctx = document.getElementById('timeline-chart');
    if (!ctx) return null;

    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: data.timeSeriesData.labels,
            datasets: [
                {
                    label: 'Daily Volume',
                    data: data.timeSeriesData.daily,
                    backgroundColor: 'rgba(40, 71, 226, 0.6)',
                    borderColor: NEON_COLORS.blue,
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Cumulative',
                    data: data.timeSeriesData.cumulative,
                    type: 'line',
                    backgroundColor: 'rgba(247, 88, 128, 0.1)',
                    borderColor: NEON_COLORS.pink,
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            ...commonChartOptions,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Daily Volume',
                        color: NEON_COLORS.textSecondary
                    },
                    grid: {
                        color: NEON_COLORS.gridLines,
                        drawBorder: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Cumulative',
                        color: NEON_COLORS.textSecondary
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary
                    }
                }
            }
        }
    });
}

/**
 * Initialize Content Types Distribution Chart (Horizontal bars)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initTypesChart(data) {
    const ctx = document.getElementById('types-chart');
    if (!ctx) return null;

    const sortedTypes = sortAndLimitBuckets(data.types, 10);
    const gradient = generateNeonGradient(sortedTypes.length);

    console.log('Types chart data:', sortedTypes);

    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedTypes.map(t => t.key),
            datasets: [{
                label: 'Content Items',
                data: sortedTypes.map(t => t.docCount),
                backgroundColor: gradient.map(c => c.replace('rgb', 'rgba').replace(')', ', 0.7)')),
                borderColor: gradient,
                borderWidth: 2
            }]
        },
        options: {
            ...commonChartOptions,
            indexAxis: 'y',
            plugins: {
                ...commonChartOptions.plugins,
                legend: {
                    display: false
                },
                tooltip: {
                    ...commonChartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            const type = context.label;
                            const count = context.parsed.x;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((count / total) * 100).toFixed(1);
                            return `${type}: ${count.toLocaleString()} items (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: NEON_COLORS.gridLines
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Number of Items',
                        color: NEON_COLORS.textSecondary
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

/**
 * Initialize User Productivity Chart (Horizontal bars with gradient)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initUsersChart(data) {
    const ctx = document.getElementById('users-chart');
    if (!ctx) return null;

    const sortedUsers = sortAndLimitBuckets(data.users, 10);

    console.log('User chart data:', sortedUsers);

    // Find max to determine thresholds dynamically
    const maxCount = Math.max(...sortedUsers.map(u => u.docCount), 1);
    const highThreshold = maxCount * 0.5;  // Top 50%
    const mediumThreshold = maxCount * 0.25; // 25-50%

    // Color based on activity level
    const colors = sortedUsers.map(user => {
        if (user.docCount >= highThreshold) return 'rgba(40, 71, 226, 0.8)'; // High: blue
        if (user.docCount >= mediumThreshold) return 'rgba(59, 130, 246, 0.8)'; // Medium: lighter blue
        return 'rgba(147, 197, 253, 0.8)'; // Low: pale blue
    });

    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedUsers.map(u => u.key),
            datasets: [{
                label: 'Activity Count',
                data: sortedUsers.map(u => u.docCount),
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.8', '1')),
                borderWidth: 2
            }]
        },
        options: {
            ...commonChartOptions,
            indexAxis: 'y',
            plugins: {
                ...commonChartOptions.plugins,
                legend: {
                    display: false
                },
                tooltip: {
                    ...commonChartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            const username = context.label;
                            const count = context.parsed.x;
                            return `${username}: ${count.toLocaleString()} items`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: NEON_COLORS.gridLines
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Activity Count',
                        color: NEON_COLORS.textSecondary
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

/**
 * Initialize Hourly Activity Pattern Chart (Area chart)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initHourlyChart(data) {
    const ctx = document.getElementById('hourly-chart');
    if (!ctx) return null;

    const hourLabels = Array.from({length: 24}, (_, i) => `${i}:00`);

    return new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: hourLabels,
            datasets: [{
                label: 'Avg Activity',
                data: data.hourlyData,
                backgroundColor: 'rgba(40, 71, 226, 0.1)',
                borderColor: NEON_COLORS.blue,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: NEON_COLORS.blue,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            ...commonChartOptions,
            plugins: {
                ...commonChartOptions.plugins,
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: NEON_COLORS.gridLines,
                        drawBorder: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 10 }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 9 },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

/**
 * Initialize Workfolders Activity Chart (Horizontal bars)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initWorkfoldersChart(data) {
    const ctx = document.getElementById('workfolders-chart');
    if (!ctx) return null;

    const sortedFolders = sortAndLimitBuckets(data.workfolders, 8);

    // Shorten folder names for display
    const labels = sortedFolders.map(f => {
        const parts = f.key.split('/');
        return parts[parts.length - 1] || f.key;
    });

    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: sortedFolders.map(f => f.docCount),
                backgroundColor: 'rgba(40, 71, 226, 0.6)',
                borderColor: NEON_COLORS.blue,
                borderWidth: 2
            }]
        },
        options: {
            ...commonChartOptions,
            indexAxis: 'y',
            plugins: {
                ...commonChartOptions.plugins,
                legend: {
                    display: false
                },
                tooltip: {
                    ...commonChartOptions.plugins.tooltip,
                    callbacks: {
                        title: function(context) {
                            // Show full path in tooltip
                            const idx = context[0].dataIndex;
                            return sortedFolders[idx].key;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: NEON_COLORS.gridLines
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 10 }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: NEON_COLORS.textSecondary,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

/**
 * Initialize Endpoints Distribution Chart (Donut)
 * @param {Object} data - Parsed metrics data
 * @returns {Chart} Chart.js instance
 */
function initEndpointsChart(data) {
    const ctx = document.getElementById('endpoints-chart');
    if (!ctx) return null;

    if (!data.endpoints || data.endpoints.length === 0) {
        // No endpoint data, show placeholder
        return null;
    }

    return new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: data.endpoints.map(e => e.key),
            datasets: [{
                data: data.endpoints.map(e => e.docCount),
                backgroundColor: [
                    'rgba(40, 71, 226, 0.8)',  // Blue for NeonBo
                    'rgba(247, 88, 128, 0.8)'  // Pink for NeonApp
                ],
                borderWidth: 3,
                borderColor: NEON_COLORS.white
            }]
        },
        options: {
            ...commonChartOptions,
            cutout: '70%',
            plugins: {
                ...commonChartOptions.plugins,
                legend: {
                    ...commonChartOptions.plugins.legend,
                    position: 'bottom'
                },
                tooltip: {
                    ...commonChartOptions.plugins.tooltip,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Local helper to get heatmap color
 */
function getHeatmapColorLocal(value, max) {
    if (value === 0) return '#F3F4F6'; // Gray for zero

    const intensity = value / max;

    // Generate 5-step gradient
    const baseR = 40, baseG = 71, baseB = 226; // #2847E2

    const colors = [];
    for (let i = 0; i < 5; i++) {
        const int = i / 4;
        const r = Math.round(255 - (255 - baseR) * int);
        const g = Math.round(255 - (255 - baseG) * int);
        const b = Math.round(255 - (255 - baseB) * int);
        colors.push(`rgb(${r}, ${g}, ${b})`);
    }

    if (intensity < 0.2) return colors[0];
    if (intensity < 0.4) return colors[1];
    if (intensity < 0.6) return colors[2];
    if (intensity < 0.8) return colors[3];
    return colors[4];
}

/**
 * Render Calendar Heatmap (GitHub-style)
 * @param {Object} data - Parsed metrics data
 */
function renderCalendarHeatmap(data) {
    const container = document.getElementById('calendar-heatmap');
    if (!container) {
        console.warn('Heatmap container not found');
        return;
    }

    container.innerHTML = ''; // Clear existing

    if (!data.timeBuckets || data.timeBuckets.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-500">No time data available</div>';
        return;
    }

    // Group by day
    const dailyMap = new Map();
    data.timeBuckets.forEach(bucket => {
        const date = new Date(bucket.date);
        const dayKey = date.toISOString().split('T')[0];

        if (!dailyMap.has(dayKey)) {
            dailyMap.set(dayKey, { date: dayKey, docCount: 0 });
        }

        dailyMap.get(dayKey).docCount += bucket.docCount;
    });

    // Get all days in range
    const days = Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
    );

    if (days.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-500">No activity data</div>';
        return;
    }

    // Find max for color scaling
    const maxCount = Math.max(...days.map(d => d.docCount));

    console.log(`Heatmap: ${days.length} days, max count: ${maxCount}`);

    // Generate legend colors
    const legendColors = [];
    const baseR = 40, baseG = 71, baseB = 226;
    for (let i = 0; i < 5; i++) {
        const int = i / 4;
        const r = Math.round(255 - (255 - baseR) * int);
        const g = Math.round(255 - (255 - baseG) * int);
        const b = Math.round(255 - (255 - baseB) * int);
        legendColors.push(`rgb(${r}, ${g}, ${b})`);
    }

    // Get date range for subtitle
    const firstDate = new Date(days[0].date);
    const lastDate = new Date(days[days.length - 1].date);
    const dateRangeText = `${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    // Create subtitle with date range
    const subtitle = document.createElement('div');
    subtitle.className = 'text-xs text-gray-500 mb-3';
    subtitle.textContent = `Activity from ${dateRangeText} • ${days.length} days`;
    container.appendChild(subtitle);

    // Create legend
    const legend = document.createElement('div');
    legend.className = 'flex items-center justify-between mb-4 text-xs text-gray-500';
    legend.innerHTML = `
        <span>Less activity</span>
        <div class="flex gap-1">
            ${legendColors.map(color =>
                `<div style="width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></div>`
            ).join('')}
        </div>
        <span>More activity</span>
    `;
    container.appendChild(legend);

    // Create week labels wrapper
    const weekLabelsWrapper = document.createElement('div');
    weekLabelsWrapper.style.display = 'flex';
    weekLabelsWrapper.style.gap = '10px';
    weekLabelsWrapper.style.marginBottom = '8px';

    // Group days by week
    const weeks = [];
    let currentWeek = [];
    days.forEach((day, idx) => {
        const date = new Date(day.date);
        const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, etc.

        currentWeek.push(day);

        // Start new week on Sunday or at the end
        if (dayOfWeek === 0 || idx === days.length - 1) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }
    });

    // Create grid wrapper with week columns
    const gridWrapper = document.createElement('div');
    gridWrapper.style.display = 'flex';
    gridWrapper.style.gap = '8px';
    gridWrapper.style.overflowX = 'auto';
    gridWrapper.style.paddingBottom = '10px';

    weeks.forEach((week, weekIdx) => {
        // Week column container
        const weekColumn = document.createElement('div');
        weekColumn.style.display = 'flex';
        weekColumn.style.flexDirection = 'column';
        weekColumn.style.gap = '4px';

        // Week label (show first day of week)
        if (week.length > 0) {
            const firstDayOfWeek = new Date(week[0].date);
            const weekLabel = document.createElement('div');
            weekLabel.style.fontSize = '10px';
            weekLabel.style.color = '#6B7280';
            weekLabel.style.textAlign = 'center';
            weekLabel.style.marginBottom = '2px';
            weekLabel.style.fontWeight = '600';
            weekLabel.textContent = firstDayOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            weekColumn.appendChild(weekLabel);
        }

        week.forEach(day => {
            const color = getHeatmapColorLocal(day.docCount, maxCount);
            const date = new Date(day.date);
            const formatted = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = date.getDate();

            const cell = document.createElement('div');
            cell.style.backgroundColor = color;
            cell.style.width = '30px';
            cell.style.height = '30px';
            cell.style.borderRadius = '4px';
            cell.style.cursor = 'pointer';
            cell.style.transition = 'all 0.15s ease';
            cell.style.border = '1px solid rgba(0,0,0,0.1)';
            cell.style.position = 'relative';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.fontSize = '10px';
            cell.style.fontWeight = '600';
            cell.style.color = day.docCount > maxCount * 0.5 ? '#fff' : '#6B7280';

            // Show day number inside cell
            cell.textContent = dayNum;

            // Tooltip on hover
            let tooltip = null;

            cell.addEventListener('mouseenter', function(e) {
                // Remove any existing tooltip
                const existingTooltip = document.querySelector('.heatmap-tooltip');
                if (existingTooltip) existingTooltip.remove();

                // Create tooltip
                tooltip = document.createElement('div');
                tooltip.className = 'heatmap-tooltip';
                tooltip.style.position = 'fixed';
                tooltip.style.backgroundColor = '#1F2937';
                tooltip.style.color = 'white';
                tooltip.style.padding = '10px 14px';
                tooltip.style.borderRadius = '8px';
                tooltip.style.fontSize = '13px';
                tooltip.style.fontWeight = '500';
                tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                tooltip.style.zIndex = '10000';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.whiteSpace = 'nowrap';

                tooltip.innerHTML = `
                    <div style="font-weight: 700; margin-bottom: 4px; font-size: 14px;">${formatted}</div>
                    <div style="color: #93C5FD; font-size: 12px;">${weekday} • <span style="color: #60A5FA; font-weight: 600;">${day.docCount} items</span></div>
                `;

                document.body.appendChild(tooltip);

                // Position tooltip
                const rect = cell.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();

                let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                let top = rect.top - tooltipRect.height - 12;

                // Keep tooltip in viewport
                if (left < 10) left = 10;
                if (left + tooltipRect.width > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipRect.width - 10;
                }
                if (top < 10) {
                    top = rect.bottom + 12; // Show below if no space above
                }

                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';

                // Scale effect
                cell.style.transform = 'scale(1.2)';
                cell.style.boxShadow = '0 4px 12px rgba(40, 71, 226, 0.6)';
                cell.style.border = '2px solid #2847E2';
                cell.style.zIndex = '100';
            });

            cell.addEventListener('mouseleave', function() {
                if (tooltip) {
                    tooltip.remove();
                    tooltip = null;
                }
                cell.style.transform = 'scale(1)';
                cell.style.boxShadow = 'none';
                cell.style.border = '1px solid rgba(0,0,0,0.1)';
                cell.style.zIndex = 'auto';
            });

            weekColumn.appendChild(cell);
        });

        gridWrapper.appendChild(weekColumn);
    });

    container.appendChild(gridWrapper);
    console.log(`Heatmap rendered with ${days.length} cells in ${weeks.length} weeks`);
}

console.log('Neon Analytics Charts module loaded');
