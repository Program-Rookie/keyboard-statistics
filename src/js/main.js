const { invoke } = window.__TAURI__.tauri;
import { appWindow } from '@tauri-apps/api/window';
import Chart from 'chart.js/auto';

let isRecording = false;
let charts = {};
let updateInterval;

// DOM 元素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModal');
const exportFormatSelect = document.getElementById('exportFormat');
const clearAllBtn = document.getElementById('clearAll');
const clearRangeBtn = document.getElementById('clearRange');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');

// 统计卡片
const totalKeystrokesCard = document.getElementById('totalKeystrokes');
const todayKeystrokesCard = document.getElementById('todayKeystrokes');
const weekKeystrokesCard = document.getElementById('weekKeystrokes');
const monthKeystrokesCard = document.getElementById('monthKeystrokes');
const healthRiskCard = document.getElementById('healthRisk');

// 图表容器
const keyDistributionChart = document.getElementById('keyDistributionChart');
const keyTypesChart = document.getElementById('keyTypesChart');
const timeDistributionChart = document.getElementById('timeDistributionChart');
const weekdayDistributionChart = document.getElementById('weekdayDistributionChart');
const topAppsChart = document.getElementById('topAppsChart');
const topKeysChart = document.getElementById('topKeysChart');

// 事件监听器
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
settingsBtn.addEventListener('click', () => settingsModal.style.display = 'block');
closeModalBtn.addEventListener('click', () => settingsModal.style.display = 'none');
clearAllBtn.addEventListener('click', clearAllData);
clearRangeBtn.addEventListener('click', clearDataByRange);

// 初始化图表
function initCharts() {
    const chartConfigs = {
        keyTypesChart: {
            type: 'pie',
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
        timeDistributionChart: {
            type: 'line',
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: '时间分布'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        },
        weekdayDistributionChart: {
            type: 'bar',
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: '星期分布'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        },
        topAppsChart: {
            type: 'bar',
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: '最常用应用'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        },
        topKeysChart: {
            type: 'bar',
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: '最常用按键'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
};

Object.entries(chartConfigs).forEach(([id, config]) => {
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: config.type,
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#4a90e2',
                    '#6c757d',
                    '#28a745',
                    '#dc3545',
                    '#ffc107'
                ]
            }]
        },
        options: config.options
    });
});


// 更新统计数据
async function updateStats() {
    try {
        const analyzer = await invoke('get_analyzer');
        const total = await invoke('get_total_keystrokes', { analyzer });
        const today = await invoke('get_today_keystrokes', { analyzer });
        const week = await invoke('get_this_week_keystrokes', { analyzer });
        const month = await invoke('get_this_month_keystrokes', { analyzer });
        const health = await invoke('assess_health_risk', { analyzer });

        totalKeystrokesCard.textContent = total.toLocaleString();
        todayKeystrokesCard.textContent = today.toLocaleString();
        weekKeystrokesCard.textContent = week.toLocaleString();
        monthKeystrokesCard.textContent = month.toLocaleString();
        healthRiskCard.textContent = health;
    } catch (error) {
        console.error('更新统计数据失败:', error);
    }
}

// 更新图表数据
async function updateCharts() {
    try {
        const analyzer = await invoke('get_analyzer');

        // 更新按键类型分布
        const keyTypes = await invoke('analyze_key_types', { analyzer });
        charts.keyTypesChart.data.labels = Object.keys(keyTypes);
        charts.keyTypesChart.data.datasets[0].data = Object.values(keyTypes);
        charts.keyTypesChart.update();

        // 更新时间分布
        const hourlyData = await invoke('get_keystrokes_by_hour', { analyzer });
        charts.timeDistributionChart.data.labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
        charts.timeDistributionChart.data.datasets[0].data = hourlyData;
        charts.timeDistributionChart.update();

        // 更新星期分布
        const weekdayData = await invoke('get_keystrokes_by_weekday', { analyzer });
        charts.weekdayDistributionChart.data.labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        charts.weekdayDistributionChart.data.datasets[0].data = weekdayData;
        charts.weekdayDistributionChart.update();

        // 更新最常用应用
        const topApps = await invoke('get_top_applications', { analyzer, limit: 10 });
        charts.topAppsChart.data.labels = topApps.map(app => app.name);
        charts.topAppsChart.data.datasets[0].data = topApps.map(app => app.count);
        charts.topAppsChart.update();

        // 更新最常用按键
        const topKeys = await invoke('get_top_keys', { analyzer, limit: 10 });
        charts.topKeysChart.data.labels = topKeys.map(key => key.key);
        charts.topKeysChart.data.datasets[0].data = topKeys.map(key => key.count);
        charts.topKeysChart.update();
    } catch (error) {
        console.error('更新图表数据失败:', error);
    }
}

// 开始记录
async function startRecording() {
    try {
        await invoke('start_recording');
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } catch (error) {
        console.error('开始记录失败:', error);
    }
}

// 停止记录
async function stopRecording() {
    try {
        await invoke('stop_recording');
        isRecording = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        updateStats();
        updateCharts();
    } catch (error) {
        console.error('停止记录失败:', error);
    }
}

// 导出数据
async function exportData() {
    try {
        const format = document.getElementById('exportFormat').value;
        await invoke('export_data', { format });
        alert('数据导出成功！');
    } catch (error) {
        console.error('导出数据失败:', error);
        alert('导出数据失败：' + error);
    }
}

// 清除所有数据
async function clearAllData() {
    if (confirm('确定要清除所有数据吗？此操作不可恢复。')) {
        try {
            const analyzer = await invoke('get_analyzer');
            await invoke('clear_data', { analyzer });
            await updateStats();
            await updateCharts();
        } catch (error) {
            console.error('Failed to clear data:', error);
        }
    }
}

// 清除指定日期范围的数据
async function clearDataByRange() {
    const start = new Date(startDate.value);
    const end = new Date(endDate.value);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        alert('请选择有效的日期范围');
        return;
    }

    if (confirm('确定要清除选定日期范围的数据吗？此操作不可恢复。')) {
        try {
            const analyzer = await invoke('get_analyzer');
            await invoke('clear_data_by_date_range', {
                analyzer,
                start: start.toISOString(),
                end: end.toISOString()
            });
            await updateStats();
            await updateCharts();
        } catch (error) {
            console.error('Failed to clear data by range:', error);
        }
    }
}

// 显示设置模态框
function showSettings() {
    document.getElementById('settingsModal').classList.add('show');
}

// 隐藏设置模态框
function hideSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

// 初始化事件监听器
function initEventListeners() {
    document.getElementById('startBtn').addEventListener('click', startRecording);
    document.getElementById('stopBtn').addEventListener('click', stopRecording);
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('closeSettings').addEventListener('click', hideSettings);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    document.getElementById('clearRangeBtn').addEventListener('click', clearDataByRange);
}

// 初始化应用
async function init() {
    initCharts();
    initEventListeners();
    await updateStats();
    await updateCharts();

    // 定期更新数据
    setInterval(updateStats, 5000);
    setInterval(updateCharts, 30000);
}

// 启动应用
init().catch(console.error);

document.addEventListener('DOMContentLoaded', () => {
    const startRecordBtn = document.getElementById('startRecord');
    const stopRecordBtn = document.getElementById('stopRecord');

    const statusIndicatorElement = document.getElementById('statusIndicator');
    const statusIndicator = statusIndicatorElement ? statusIndicatorElement.querySelector('.status-text') : null;
    const recordingStatusCard = document.getElementById('recordingStatus');

    const navLinks = document.querySelectorAll('.sidebar .nav-link');
    const contentPanes = document.querySelectorAll('.main-content .content-pane');

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = link.getAttribute('data-target');
            const targetPane = document.getElementById(targetId);

            navLinks.forEach(l => l.classList.remove('active'));
            contentPanes.forEach(p => p.classList.remove('active'));

            link.classList.add('active');
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });

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
        heatmapChart: {
            // Config needed
        },
        dailyTrendChart: {
            // Config needed
        },
        appKeysChart: {
            // Config needed
        }
    };

    function initChart(canvasId) {
        const canvasElement = document.getElementById(canvasId);
        const ctx = canvasElement ? canvasElement.getContext('2d') : null;
        if (!ctx) {
            console.warn(`Canvas element with ID '${canvasId}' not found or context failed.`);
            return;
        }
        if (charts[canvasId]) {
            charts[canvasId].destroy();
        }
        const config = chartConfigs[canvasId];
        if (config && Object.keys(config).length > 0) {
            charts[canvasId] = new Chart(ctx, {
                type: config.type,
                data: { labels: [], datasets: [] },
                options: config.options
            });
        } else {
            console.warn(`Chart config for ID '${canvasId}' not found or is empty.`);
        }
    }

    function initializeAllCharts() {
        Object.keys(chartConfigs).forEach(id => {
            if (document.getElementById(id)) {
                initChart(id);
            }
        });
    }

    async function updateStats() {
        try {
            const stats = await invoke('get_stats');
            document.getElementById('totalKeysToday').textContent = stats.total_keys_today || 0;
            document.getElementById('totalKeysWeek').textContent = stats.total_keys_week || 0;
            document.getElementById('totalKeysMonth').textContent = stats.total_keys_month || 0;
            document.getElementById('totalKeysAll').textContent = stats.total_keys_all || 0;
            document.getElementById('currentKPM').textContent = stats.current_kpm || 0;

            const isRecording = stats.is_recording;
            if (recordingStatusCard) {
                recordingStatusCard.textContent = isRecording ? '记录中' : '已停止';
            }
            if (statusIndicator) {
                statusIndicator.textContent = isRecording ? '记录中' : '已停止';
            }
            if (startRecordBtn) startRecordBtn.disabled = isRecording;
            if (stopRecordBtn) stopRecordBtn.disabled = !isRecording;

            updateChartData('keyTypeDistributionChart', stats.key_type_distribution);
            updateChartData('keyTimeDistributionChart', stats.key_time_distribution);
            updateChartData('keyWeekdayDistributionChart', stats.key_weekday_distribution);
            updateChartData('topAppsChart', stats.top_apps);
            updateChartData('topKeysChart', stats.top_keys);
        } catch (error) {
            console.error("Failed to update stats:", error);
            showError("更新统计数据失败", error);
        }
    }

    function updateChartData(chartId, data) {
        const chart = charts[chartId];
        if (!chart) {
            console.warn(`Chart '${chartId}' not initialized or not visible.`);
            return;
        }
        if (!data) {
            console.warn(`No data provided for chart '${chartId}'. Clearing chart.`);
            chart.data.labels = [];
            chart.data.datasets = [];
            chart.update();
            return;
        }

        try {
            if (chartId === 'keyTypeDistributionChart' || chartId === 'keyWeekdayDistributionChart') {
                if (typeof data !== 'object' || data === null) throw new Error('Invalid data format for pie/doughnut/bar');
                chart.data.labels = Object.keys(data);
                let labelText = '数据';
                const config = chartConfigs[chartId];
                if (config && config.options && config.options.plugins && config.options.plugins.title && config.options.plugins.title.text) {
                    labelText = config.options.plugins.title.text;
                }
                chart.data.datasets = [{
                    label: labelText,
                    data: Object.values(data),
                    backgroundColor: [
                        'rgba(74, 144, 226, 0.7)',
                        'rgba(108, 117, 125, 0.7)',
                        'rgba(40, 167, 69, 0.7)',
                        'rgba(220, 53, 69, 0.7)',
                        'rgba(255, 193, 7, 0.7)',
                        'rgba(23, 162, 184, 0.7)',
                        'rgba(52, 58, 64, 0.7)'
                    ]
                }];
            } else if (chartId === 'keyTimeDistributionChart') {
                if (typeof data !== 'object' || data === null) throw new Error('Invalid data format for time distribution');
                const labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
                const values = labels.map(hour => data[hour] || 0);
                chart.data.labels = labels;
                chart.data.datasets = [{
                    label: '按键次数',
                    data: values,
                    backgroundColor: 'rgba(74, 144, 226, 0.5)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1
                }];
            } else if (chartId === 'topAppsChart' || chartId === 'topKeysChart') {
                if (!Array.isArray(data)) throw new Error('Invalid data format for top list');
                chart.data.labels = data.map(item => item[0]);
                chart.data.datasets = [{
                    label: '按键次数',
                    data: data.map(item => item[1]),
                    backgroundColor: 'rgba(74, 144, 226, 0.5)',
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1
                }];
            }
            chart.update();
        } catch (error) {
            console.error(`Failed to update chart '${chartId}':`, error);
            showError(`更新图表 ${chartId} 失败`, error);
        }
    }

    if (startRecordBtn) {
        startRecordBtn.addEventListener('click', async() => {
            try {
                await invoke('start_recording');
                console.log('Start recording command sent.');
                await updateStats();
            } catch (error) {
                console.error("Failed to start recording:", error);
                showError("启动记录失败", error);
            }
        });
    }

    if (stopRecordBtn) {
        stopRecordBtn.addEventListener('click', async() => {
            try {
                await invoke('stop_recording');
                console.log('Stop recording command sent.');
                await updateStats();
            } catch (error) {
                console.error("Failed to stop recording:", error);
                showError("停止记录失败", error);
            }
        });
    }

    const exportBtn = document.getElementById('exportData');
    const clearAllBtn = document.getElementById('clearAllData');
    const clearRangeBtn = document.getElementById('clearDataRange');
    const saveProfileBtn = document.getElementById('saveProfile');

    if (exportBtn) {
        exportBtn.addEventListener('click', async() => {
            const exportFormatElement = document.getElementById('exportFormat');
            const format = (exportFormatElement ? exportFormatElement.value : null) || 'json';
            try {
                const result = await invoke('export_data', { format });
                alert(`数据已导出到: ${result}`);
            } catch (error) {
                console.error("Failed to export data:", error);
                showError("导出数据失败", error);
            }
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async() => {
            if (confirm('确定要清除所有记录吗？此操作不可逆！')) {
                try {
                    await invoke('clear_all_data');
                    alert('所有数据已清除。');
                    await updateStats();
                } catch (error) {
                    console.error("Failed to clear all data:", error);
                    showError("清除所有数据失败", error);
                }
            }
        });
    }

    if (clearRangeBtn) {
        clearRangeBtn.addEventListener('click', async() => {
            const startDateElement = document.getElementById('clearDataRangeStart');
            const startDate = startDateElement ? startDateElement.value : null;
            const endDateElement = document.getElementById('clearDataRangeEnd');
            const endDate = endDateElement ? endDateElement.value : null;
            if (!startDate || !endDate) {
                alert('请选择要清除数据的开始和结束日期。');
                return;
            }
            if (new Date(startDate) > new Date(endDate)) {
                alert('开始日期不能晚于结束日期。');
                return;
            }
            if (confirm(`确定要清除从 ${startDate} 到 ${endDate} 的所有记录吗？此操作不可逆！`)) {
                try {
                    await invoke('clear_data_range', { startDate, endDate });
                    alert('选定范围内的数据已清除。');
                    await updateStats();
                } catch (error) {
                    console.error("Failed to clear data range:", error);
                    showError("清除范围数据失败", error);
                }
            }
        });
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            const professionElement = document.getElementById('userProfession');
            const profession = professionElement ? professionElement.value : null;
            const dailyUseElement = document.getElementById('userDailyUse');
            const dailyUse = dailyUseElement ? dailyUseElement.value : null;
            console.log(`Saving profile: Profession=${profession}, DailyUse=${dailyUse}`);
            invoke('save_user_profile', { profession, dailyUse })
                .then(() => alert('健康档案已保存。'))
                .catch(error => {
                    console.error("Failed to save profile:", error);
                    showError("保存健康档案失败", error);
                });
        });
    }

    function showError(message, error) {
        console.error(message, error);
        alert(`错误: ${message}\n${error instanceof Error ? error.message : String(error)}`);
    }

    console.log("DOM loaded. Initializing application...");
    initializeAllCharts();
    updateStats();

    setInterval(updateStats, 30000);
    console.log("Initialization complete. Periodic updates started.");
});