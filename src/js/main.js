import { invoke } from '@tauri-apps/api/tauri';
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