import { getStats, getInitialState } from './api.js';
import { initSidebar, updateStatsDisplay, showError, initThemeSwitcher } from './ui.js';
import { initializeAllCharts, updateCharts } from './charts.js';
import { initializeEventListeners } from './listeners.js';

let updateIntervalId = null;
const UPDATE_INTERVAL = 30000; // 更新间隔，单位毫秒

// 主更新函数：获取最新数据并更新UI和图表
export async function updateApplicationState() {
    console.log('Updating application state...');
    try {
        const stats = await getStats();
        if (stats) {
            updateStatsDisplay(stats); // 更新统计卡片和记录状态
            updateCharts(stats); // 更新所有图表
        } else {
            console.warn('Received null stats from backend.');
            // 可以考虑显示一个"无数据"的状态
        }
    } catch (error) {
        showError("更新应用程序状态失败", error);
        // 停止自动更新，避免连续失败
        if (updateIntervalId) {
            clearInterval(updateIntervalId);
            updateIntervalId = null;
            console.error("Stopping periodic updates due to error.");
        }
    }
}

// 初始化应用程序
async function initializeApp() {
    console.log("Initializing application...");

    // 1. 初始化UI组件 (侧边栏, 主题等)
    initSidebar();
    initThemeSwitcher(); // 初始化主题切换器

    // 2. 初始化所有图表
    initializeAllCharts();

    // 3. 设置所有事件监听器
    initializeEventListeners();

    // 4. 获取初始状态并进行首次数据更新
    try {
        // 如果后端提供初始状态API，可以在这里调用并设置按钮状态
        // const initialState = await getInitialState();
        // updateRecordingStatusDisplay(initialState.is_recording);

        // 首次加载数据和图表
        await updateApplicationState();

        // 5. 启动定时更新
        if (updateIntervalId) clearInterval(updateIntervalId); // 清除旧的定时器（如果存在）
        updateIntervalId = setInterval(updateApplicationState, UPDATE_INTERVAL);
        console.log(`Application initialized. Periodic updates started every ${UPDATE_INTERVAL / 1000} seconds.`);

    } catch (error) {
        showError("应用程序初始化失败", error);
        // 初始化失败，可能需要显示错误页面或提示用户
    }
}

// DOM加载完成后开始初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});