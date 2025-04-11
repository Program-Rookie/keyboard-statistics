import Chart from 'chart.js/auto';
import { showError } from './ui.js';

let charts = {};

const chartConfigs = {
    keyTypeDistributionChart: {
        type: 'doughnut',
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '按键类型分布'
                }
            }
        }
    },
    keyTimeDistributionChart: {
        type: 'bar',
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '按键时间分布 (小时)'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '小时'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '按键次数'
                    }
                }
            }
        }
    },
    keyWeekdayDistributionChart: {
        type: 'bar',
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '按键星期分布'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '星期'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '按键次数'
                    }
                }
            }
        }
    },
    topAppsChart: {
        type: 'bar',
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: '最活跃应用 Top 5'
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '按键次数'
                    }
                },
                y: {
                    title: {
                        display: false
                    }
                }
            }
        }
    },
    topKeysChart: {
        type: 'bar',
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: '最常用按键 Top 10'
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '按键次数'
                    }
                },
                y: {
                    title: {
                        display: false
                    }
                }
            }
        }
    },
    // 其他图表配置... 如 heatmapChart, dailyTrendChart 等
    // heatmapChart: { type: 'matrix', options: {...} },
    // dailyTrendChart: { type: 'line', options: {...} },
};

function initChart(canvasId) {
    const canvasElement = document.getElementById(canvasId);
    const ctx = canvasElement ? canvasElement.getContext('2d') : null;
    if (!ctx) {
        console.warn(`Canvas element with ID '${canvasId}' not found or context failed.`);
        return;
    }
    if (charts[canvasId]) {
        charts[canvasId].destroy(); // 销毁旧图表实例
    }
    const config = chartConfigs[canvasId];
    if (config && Object.keys(config).length > 0) {
        try {
            charts[canvasId] = new Chart(ctx, {
                type: config.type,
                data: { labels: [], datasets: [] }, // 初始为空数据
                options: config.options
            });
        } catch (error) {
            console.error(`Failed to initialize chart '${canvasId}':`, error);
            showError(`初始化图表 ${canvasId} 失败`, error);
        }
    } else {
        console.warn(`Chart config for ID '${canvasId}' not found or is empty.`);
    }
}

export function initializeAllCharts() {
    console.log("Initializing all charts...");
    Object.keys(chartConfigs).forEach(id => {
        if (document.getElementById(id)) {
            initChart(id);
        }
    });
    console.log("Chart initialization attempt complete.");
}

export function updateCharts(stats) {
    console.log("Updating charts with new stats...");
    updateChartData('keyTypeDistributionChart', stats.key_type_distribution);
    updateChartData('keyTimeDistributionChart', stats.key_time_distribution);
    updateChartData('keyWeekdayDistributionChart', stats.key_weekday_distribution);
    updateChartData('topAppsChart', stats.top_apps);
    updateChartData('topKeysChart', stats.top_keys);
    // 更新其他图表...
}

function updateChartData(chartId, data) {
    const chart = charts[chartId];
    if (!chart) {
        // console.warn(`Chart '${chartId}' not initialized or found.`);
        return; // 如果图表不存在，则不更新
    }
    if (!data) {
        console.warn(`No data provided for chart '${chartId}'. Clearing chart.`);
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
        return;
    }

    try {
        let labels, datasets;
        switch (chartId) {
            case 'keyTypeDistributionChart':
                if (typeof data !== 'object' || data === null) throw new Error('Invalid data format for keyTypeDistributionChart');
                labels = Object.keys(data);
                datasets = [{
                    label: '按键类型分布',
                    data: Object.values(data),
                    backgroundColor: [
                            'rgba(74, 144, 226, 0.7)', // Blue
                            'rgba(108, 117, 125, 0.7)', // Grey
                            'rgba(40, 167, 69, 0.7)', // Green
                            'rgba(220, 53, 69, 0.7)', // Red
                            'rgba(255, 193, 7, 0.7)', // Yellow
                            'rgba(23, 162, 184, 0.7)', // Teal
                            'rgba(52, 58, 64, 0.7)', // Dark Grey
                            'rgba(111, 66, 193, 0.7)', // Purple
                        ].slice(0, labels.length) // 只取需要的颜色数量
                }];
                break;

            case 'keyTimeDistributionChart':
                if (typeof data !== 'object' || data === null) throw new Error('Invalid data format for keyTimeDistributionChart');
                labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')); // 00, 01, ..., 23
                const timeValues = labels.map(hour => data[hour] || 0);
                datasets = [{
                    label: '按键次数 (按小时)',
                    data: timeValues,
                    backgroundColor: 'rgba(74, 144, 226, 0.5)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1
                }];
                break;

            case 'keyWeekdayDistributionChart':
                if (typeof data !== 'object' || data === null) throw new Error('Invalid data format for keyWeekdayDistributionChart');
                // 假设后端返回的数据键是 0-6 (周日到周六)
                labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                const weekdayValues = labels.map((_, index) => data[index] || 0);
                datasets = [{
                    label: '按键次数 (按星期)',
                    data: weekdayValues,
                    backgroundColor: 'rgba(40, 167, 69, 0.5)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                }];
                break;

            case 'topAppsChart':
            case 'topKeysChart':
                if (!Array.isArray(data)) throw new Error(`Invalid data format for ${chartId}`);
                // 假设后端返回 [ [name, count], [name, count], ... ]
                labels = data.map(item => item[0]);
                datasets = [{
                    label: chartId === 'topAppsChart' ? '应用按键次数' : '按键次数',
                    data: data.map(item => item[1]),
                    backgroundColor: 'rgba(255, 193, 7, 0.5)',
                    borderColor: 'rgba(255, 193, 7, 1)',
                    borderWidth: 1
                }];
                break;

                // Handle other charts
                // case 'heatmapChart': ...
                // case 'dailyTrendChart': ...

            default:
                console.warn(`Update logic not implemented for chart '${chartId}'`);
                return; // 没有对应的处理逻辑
        }

        chart.data.labels = labels;
        chart.data.datasets = datasets;
        chart.update();

    } catch (error) {
        console.error(`Failed to update chart '${chartId}':`, error);
        showError(`更新图表 ${chartId} 失败`, error);
        // 清空图表数据以避免显示错误状态
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
    }
}