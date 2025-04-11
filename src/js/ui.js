import { startRecording as apiStartRecording, stopRecording as apiStopRecording } from './api.js';

// --- 状态变量 ---
let isRecording = false; // 初始状态将从后端获取

// --- DOM 元素缓存 ---
const sidebarLinks = document.querySelectorAll('.sidebar .nav-link');
const contentPanes = document.querySelectorAll('.main-content .content-pane');
const statusIndicatorElement = document.getElementById('statusIndicator');
const statusIndicatorText = statusIndicatorElement ? statusIndicatorElement.querySelector('.status-text') : null;
const recordingStatusCard = document.getElementById('recordingStatus');
const startRecordBtn = document.getElementById('startRecord'); // 假设这是启动按钮
const stopRecordBtn = document.getElementById('stopRecord'); // 假设这是停止按钮

// --- 侧边栏和面板 --- 
export function initSidebar() {
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = link.getAttribute('data-target');
            activatePanel(targetId);
        });
    });
    // 激活默认面板（例如概览）
    if (sidebarLinks.length > 0) {
        const defaultTarget = sidebarLinks[0].getAttribute('data-target');
        activatePanel(defaultTarget);
    }
}

export function activatePanel(targetId) {
    sidebarLinks.forEach(l => {
        if (l.getAttribute('data-target') === targetId) {
            l.classList.add('active');
        } else {
            l.classList.remove('active');
        }
    });
    contentPanes.forEach(p => {
        if (p.id === targetId) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

// --- 统计数据更新 ---
export function updateStatsDisplay(stats) {
    document.getElementById('totalKeysToday').textContent = stats.total_keys_today || 0;
    document.getElementById('totalKeysWeek').textContent = stats.total_keys_week || 0;
    document.getElementById('totalKeysMonth').textContent = stats.total_keys_month || 0;
    document.getElementById('totalKeysAll').textContent = stats.total_keys_all || 0;
    document.getElementById('currentKPM').textContent = stats.current_kpm || 0;
    // 更新记录状态显示
    updateRecordingStatusDisplay(stats.is_recording);
}

// --- 记录状态更新 ---
export function updateRecordingStatusDisplay(newIsRecordingState) {
    isRecording = newIsRecordingState;
    if (recordingStatusCard) {
        recordingStatusCard.textContent = isRecording ? '记录中' : '已停止';
        // 可以添加样式变化
        recordingStatusCard.className = isRecording ? 'status-card recording' : 'status-card stopped';
    }
    if (statusIndicatorText) {
        statusIndicatorText.textContent = isRecording ? '记录中' : '已停止';
        // 可以添加样式变化
        statusIndicatorElement.className = isRecording ? 'status-indicator recording' : 'status-indicator stopped';
    }
    // 更新按钮状态
    if (startRecordBtn) startRecordBtn.disabled = isRecording;
    if (stopRecordBtn) stopRecordBtn.disabled = !isRecording;
}

// --- 错误处理 ---
export function showError(message, error) {
    console.error(message, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    alert(`错误: ${message}\n${errorMessage}`);
    // 可以在UI上显示更友好的错误信息
    const errorDisplay = document.getElementById('error-display');
    if (errorDisplay) {
        errorDisplay.textContent = `操作失败: ${message} (${errorMessage})`;
        errorDisplay.style.display = 'block'; // 显示错误区域
        // 可能需要设置一个定时器来隐藏错误信息
        setTimeout(() => { errorDisplay.style.display = 'none'; }, 5000);
    }
}

// --- 主题切换 (稍后实现) ---
export function initThemeSwitcher() {
    const themeToggle = document.getElementById('theme-toggle'); // 假设有一个切换按钮
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }
    // 初始化时应用保存的主题或默认主题
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

export function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    // 更新切换按钮状态 (如果需要)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
    console.log(`Theme set to ${theme}`);
}