const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, currentMonitor } = window.__TAURI__.window;
const { WebviewWindow } = window.__TAURI__.webviewWindow;

// 全局变量
let currentPage = 'dashboard';
let currentTimeFilter = 'today';
let isRecording = true;
let isDarkTheme = false;
let showExitConfirm = true; // 默认显示退出确认
const appWindow = getCurrentWindow();

// 页面初始化
window.addEventListener("DOMContentLoaded", async() => {
    // 初始化导航事件
    initNavigation();

    // 初始化时间筛选器
    initTimeFilter();

    // 初始化录制状态
    await initRecordingStatus();

    // 初始化按钮事件
    initButtonEvents();

    // 初始化模态框
    initModals();

    // 初始化退出确认设置
    await initExitConfirmSetting();

    // 创建退出确认模态框
    createExitConfirmModal();

    // 监听关闭对话框事件
    const { listen } = window.__TAURI__.event;
    await listen('show-close-dialog', () => {
        console.log('收到关闭对话框事件');
        showModal('exit-confirm-modal');
    });

    // 加载模拟数据（实际项目中应从后端获取）
    loadMockData();
    // 初始化overlay窗口
    createOverlayWindow();
});

// 初始化overlay窗口
function createOverlayWindow() {
    console.log('尝试创建overlay窗口');
    const monitor = currentMonitor();
    monitor.then((monitor) => {
        console.log('当前显示器信息:', monitor);
        const winWidth = 300;
        const winHeight = monitor.size.height - 80;
        const x = 80;
        const y = monitor.size.height - winHeight - 80;
        const popup = new WebviewWindow('key_popup', {
            url: 'key_popup.html',
            transparent: true, // 设置为透明
            decorations: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: true,
            width: winWidth,
            height: winHeight,
            x: x,
            y: y,
            visible: false,
            focus: false, // 不获取焦点
            theme: 'dark',
            shadow: false,
            acceptFirstMouse: false
        });
        popup.once('tauri://created', function() {
            // webview successfully created
            console.log('webview 已成功创建');
            popup.setBackgroundColor({ r: 0, g: 0, b: 0, a: 0 });
            // 设置窗口忽略鼠标事件，允许点击穿透
            popup.setIgnoreCursorEvents(true);
        });
        popup.once('tauri://error', function(e) {
            // an error happened creating the webview
            console.error('创建 webview 时发生错误:', e);
        });
    });
}

// 初始化退出确认设置
async function initExitConfirmSetting() {
    try {
        // 从 Rust 后端获取设置
        showExitConfirm = await invoke('get_exit_confirm_setting');
    } catch (error) {
        console.error('获取退出确认设置失败:', error);
    }
}

// 更新退出确认设置
async function updateExitConfirmSetting(showConfirm) {
    try {
        await invoke('update_exit_confirm', { showConfirm });
        showExitConfirm = showConfirm;
    } catch (error) {
        console.error('更新退出确认设置失败:', error);
    }
}

// 初始化导航
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // 移除所有活动状态
            navItems.forEach(i => i.classList.remove('active'));

            // 添加当前活动状态
            item.classList.add('active');

            // 获取页面ID
            const pageId = item.getAttribute('data-page');

            // 切换页面
            switchPage(pageId);
        });
    });
}

// 新增：初始化录制状态
async function initRecordingStatus() {
    const statusIndicator = document.querySelector('.status-indicator');
    const toggleBtn = document.getElementById('toggle-recording');
    const statusText = statusIndicator.nextElementSibling;

    try {
        isRecording = await invoke('get_recording_status');
    } catch (error) {
        console.error('获取录制状态失败:', error);
        isRecording = false;
    }

    if (isRecording) {
        statusIndicator.classList.add('active');
        statusText.textContent = '正在记录';
        toggleBtn.textContent = '暂停';
    } else {
        statusIndicator.classList.remove('active');
        statusText.textContent = '已暂停';
        toggleBtn.textContent = '继续';
    }
}

// 切换页面
function switchPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // 显示当前页面
    const currentPageEl = document.getElementById(`${pageId}-page`);
    if (currentPageEl) {
        currentPageEl.classList.add('active');
        currentPage = pageId;
    }
}

// 初始化时间筛选器
function initTimeFilter() {
    const timeButtons = document.querySelectorAll('.time-btn');

    timeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有活动状态
            timeButtons.forEach(b => b.classList.remove('active'));

            // 添加当前活动状态
            btn.classList.add('active');

            // 获取时间范围
            const timeRange = btn.getAttribute('data-time');
            currentTimeFilter = timeRange;

            // 更新数据显示（实际项目中应根据时间范围从后端获取数据）
            updateDataByTimeRange(timeRange);
        });
    });
}

// 初始化按钮事件
function initButtonEvents() {
    // 记录控制按钮
    const toggleRecordingBtn = document.getElementById('toggle-recording');
    if (toggleRecordingBtn) {
        toggleRecordingBtn.addEventListener('click', toggleRecording);
    }

    // 导出数据按钮
    const exportDataBtn = document.getElementById('export-data');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            showModal('export-modal');
        });
    }

    // 删除数据按钮
    const deleteDataBtn = document.getElementById('delete-data');
    if (deleteDataBtn) {
        deleteDataBtn.addEventListener('click', () => {
            showModal('delete-modal');
        });
    }

    // 健康评估按钮
    const assessHealthBtn = document.getElementById('assess-health');
    if (assessHealthBtn) {
        assessHealthBtn.addEventListener('click', performHealthAssessment);
    }

    // AI分析按钮
    const aiAnalysisBtn = document.getElementById('ai-analysis-btn');
    if (aiAnalysisBtn) {
        aiAnalysisBtn.addEventListener('click', () => {
            showModal('ai-modal');
        });
    }

    // 主题切换按钮
    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            themeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const theme = btn.getAttribute('data-theme');
            toggleTheme(theme === 'dark');
        });
    });

    // 自启动切换
    const autostartToggle = document.getElementById('autostart-toggle');
    if (autostartToggle) {
        autostartToggle.addEventListener('change', toggleAutostart);
    }

    // 清除所有数据按钮
    const clearAllDataBtn = document.getElementById('clear-all-data');
    if (clearAllDataBtn) {
        clearAllDataBtn.addEventListener('click', () => {
            if (confirm('确定要清除所有数据吗？此操作不可撤销。')) {
                clearAllData();
            }
        });
    }

    // 删除确认复选框
    const confirmDeleteCheckbox = document.getElementById('confirm-delete-checkbox');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    if (confirmDeleteCheckbox && confirmDeleteBtn) {
        confirmDeleteCheckbox.addEventListener('change', () => {
            confirmDeleteBtn.disabled = !confirmDeleteCheckbox.checked;
        });
    }

    // 退出确认设置
    const exitConfirmToggle = document.getElementById('exit-confirm-toggle');
    if (exitConfirmToggle) {
        // 设置初始状态
        exitConfirmToggle.checked = showExitConfirm;

        // 添加事件监听
        exitConfirmToggle.addEventListener('change', (e) => {
            updateExitConfirmSetting(e.target.checked);
        });
    }
}

// 初始化模态框
function initModals() {
    // 关闭按钮
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal.id);
        });
    });

    // 取消按钮
    const cancelButtons = document.querySelectorAll('[id^="cancel-"]');
    cancelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal.id);
        });
    });

    // 确认导出按钮
    const confirmExportBtn = document.getElementById('confirm-export');
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', exportData);
    }

    // 确认删除按钮
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteData);
    }

    // 前往导出数据按钮
    const goToExportBtn = document.getElementById('go-to-export');
    if (goToExportBtn) {
        goToExportBtn.addEventListener('click', () => {
            hideModal('ai-modal');
            showModal('export-modal');
        });
    }
}

// 创建退出确认模态框
function createExitConfirmModal() {
    // 检查是否已存在
    if (document.getElementById('exit-confirm-modal')) {
        return;
    }

    const exitConfirmModal = document.createElement('div');
    exitConfirmModal.id = 'exit-confirm-modal';
    exitConfirmModal.className = 'modal';

    exitConfirmModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>关闭选项</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <p>请选择操作方式：</p>
                    <div class="checkbox-wrapper">
                        <label class="checkbox-container">
                            <input type="checkbox" id="exit-no-confirm" />
                            <span class="checkmark"></span>
                            不再提醒
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="minimize-to-tray" class="btn">最小化到托盘</button>
                    <button id="confirm-exit" class="btn primary">完全退出</button>
                </div>
            </div>
        `;

    document.body.appendChild(exitConfirmModal);
    // console.log('退出确认模态框已创建');

    // 添加事件监听
    const closeBtn = exitConfirmModal.querySelector('.close-modal');
    const minimizeBtn = exitConfirmModal.querySelector('#minimize-to-tray');
    const exitBtn = exitConfirmModal.querySelector('#confirm-exit');
    const noConfirmCheckbox = exitConfirmModal.querySelector('#exit-no-confirm');

    closeBtn.addEventListener('click', () => {
        hideModal('exit-confirm-modal');
        // 取消关闭操作
        appWindow.show();
    });

    minimizeBtn.addEventListener('click', () => {
        if (noConfirmCheckbox.checked) {
            updateExitConfirmSetting(false);
            // 保存最小化行为
            invoke('update_close_behavior', { minimize: true });
        }
        hideModal('exit-confirm-modal');
        appWindow.hide();
    });

    exitBtn.addEventListener('click', () => {
        if (noConfirmCheckbox.checked) {
            updateExitConfirmSetting(false);
            // 保存退出行为
            invoke('update_close_behavior', { minimize: false });
        }
        invoke('exit_app');
    });
}

// 显示模态框
function showModal(modalId) {
    console.log('尝试显示模态框:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

// 隐藏模态框
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    console.log('尝试隐藏模态框:', modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// 切换记录状态
async function toggleRecording() {
    const statusIndicator = document.querySelector('.status-indicator');
    const toggleBtn = document.getElementById('toggle-recording');
    const statusText = statusIndicator.nextElementSibling;

    isRecording = !isRecording;

    if (isRecording) {
        // 启动记录
        statusIndicator.classList.add('active');
        statusText.textContent = '正在记录';
        toggleBtn.textContent = '暂停';

        // 调用后端API启动记录
        try {
            console.log('尝试启动记录');
            await invoke('start_recording');
        } catch (error) {
            console.error('启动记录失败:', error);
        }
    } else {
        // 暂停记录
        statusIndicator.classList.remove('active');
        statusText.textContent = '已暂停';
        toggleBtn.textContent = '继续';

        // 调用后端API暂停记录
        try {
            await invoke('stop_recording');
        } catch (error) {
            console.error('暂停记录失败:', error);
        }
    }
}

// 执行健康评估
function performHealthAssessment() {
    const occupation = document.getElementById('occupation').value;
    const dailyHours = document.getElementById('daily-hours').value;

    if (!occupation || !dailyHours) {
        alert('请填写完整的信息以进行评估');
        return;
    }

    // 在实际项目中，这里应该调用后端API进行评估
    // 这里使用模拟数据
    const result = {
        riskLevel: getRiskLevel(occupation, dailyHours),
        description: getHealthDescription(occupation, dailyHours)
    };

    // 显示结果
    document.querySelector('.health-result').classList.remove('hidden');
    document.querySelector('.risk-value').textContent = result.riskLevel;
    document.querySelector('.risk-description').textContent = result.description;

    // 根据风险等级设置颜色
    const riskValue = document.querySelector('.risk-value');
    riskValue.style.color = getRiskColor(result.riskLevel);
}

// 获取风险等级
function getRiskLevel(occupation, dailyHours) {
    // 简单的风险评估逻辑
    if (occupation === 'programmer' && dailyHours === '10+') {
        return '高';
    } else if ((occupation === 'programmer' || occupation === 'writer') && dailyHours === '7-9') {
        return '中';
    } else if (dailyHours === '10+') {
        return '中';
    } else {
        return '低';
    }
}

// 获取健康描述
function getHealthDescription(occupation, dailyHours) {
    const riskLevel = getRiskLevel(occupation, dailyHours);

    if (riskLevel === '高') {
        return '您的键盘使用强度较高，存在较高的RSI风险。建议每小时休息10分钟，做手部伸展运动，并考虑使用人体工学键盘。';
    } else if (riskLevel === '中') {
        return '您的键盘使用处于中等强度，有一定的RSI风险。建议每小时休息5-10分钟，定期做手部伸展运动。';
    } else {
        return '根据您的使用情况，目前未发现明显健康风险。建议保持良好习惯，每小时休息5-10分钟。';
    }
}

// 获取风险颜色
function getRiskColor(riskLevel) {
    switch (riskLevel) {
        case '高':
            return '#dc3545'; // 红色
        case '中':
            return '#ffc107'; // 黄色
        case '低':
            return '#28a745'; // 绿色
        default:
            return '#28a745';
    }
}

// 导出数据
async function exportData() {
    const format = document.getElementById('export-format').value;
    const range = document.getElementById('export-range').value;
    const type = document.getElementById('export-type').value;

    // 在实际项目中，这里应该调用后端API导出数据
    try {
        await invoke('export_data', { format, range, type });
        alert('数据导出成功！');
        hideModal('export-modal');
    } catch (error) {
        console.error('导出数据失败:', error);
        alert('导出数据失败，请重试。');
    }
}

// 删除数据
async function deleteData() {
    const range = document.getElementById('delete-range').value;
    const isConfirmed = document.getElementById('confirm-delete-checkbox').checked;

    if (!isConfirmed) {
        alert('请确认您了解此操作不可撤销');
        return;
    }

    // 在实际项目中，这里应该调用后端API删除数据
    try {
        await invoke('delete_data', { range });
        alert('数据删除成功！');
        hideModal('delete-modal');

        // 重置确认复选框
        document.getElementById('confirm-delete-checkbox').checked = false;
        document.getElementById('confirm-delete').disabled = true;

        // 更新数据显示
        loadMockData();
    } catch (error) {
        console.error('删除数据失败:', error);
        alert('删除数据失败，请重试。');
    }
}

// 清除所有数据
async function clearAllData() {
    // 在实际项目中，这里应该调用后端API清除所有数据
    try {
        await invoke('clear_all_data');
        alert('所有数据已清除！');

        // 更新数据显示
        loadMockData();
    } catch (error) {
        console.error('清除数据失败:', error);
        alert('清除数据失败，请重试。');
    }
}

// 切换主题
function toggleTheme(isDark) {
    isDarkTheme = isDark;

    if (isDark) {
        document.documentElement.style.setProperty('--primary-color', '#6c8cff');
        document.documentElement.style.setProperty('--light-color', '#2d2d2d');
        document.documentElement.style.setProperty('--dark-color', '#f8f9fa');
        document.documentElement.style.setProperty('--border-color', '#444');
        document.documentElement.style.setProperty('background-color', '#1a1a1a');
        document.documentElement.style.setProperty('color', '#f0f0f0');
    } else {
        document.documentElement.style.setProperty('--primary-color', '#4a6cf7');
        document.documentElement.style.setProperty('--light-color', '#f8f9fa');
        document.documentElement.style.setProperty('--dark-color', '#343a40');
        document.documentElement.style.setProperty('--border-color', '#dee2e6');
        document.documentElement.style.setProperty('background-color', '#f6f6f6');
        document.documentElement.style.setProperty('color', '#333');
    }
}

// 切换自启动
async function toggleAutostart() {
    const isEnabled = document.getElementById('autostart-toggle').checked;

    // 在实际项目中，这里应该调用后端API设置自启动
    try {
        await invoke('set_autostart', { enabled: isEnabled });
    } catch (error) {
        console.error('设置自启动失败:', error);
        alert('设置自启动失败，请重试。');

        // 恢复原状态
        document.getElementById('autostart-toggle').checked = !isEnabled;
    }
}

// 根据时间范围更新数据
function updateDataByTimeRange(timeRange) {
    // 在实际项目中，这里应该调用后端API获取对应时间范围的数据
    // 这里使用模拟数据
    console.log(`更新时间范围: ${timeRange}`);

    // 更新统计卡片数据
    updateStatsCards(timeRange);

    // 更新图表数据
    updateCharts(timeRange);
}

// 更新统计卡片
function updateStatsCards(timeRange) {
    const statValues = document.querySelectorAll('.stat-value');
    const statTrends = document.querySelectorAll('.stat-trend');

    // 模拟数据
    let totalKeys, todayKeys, avgKpm, activeApps;

    switch (timeRange) {
        case 'today':
            totalKeys = '12,345';
            todayKeys = '1,234';
            avgKpm = '45';
            activeApps = '8';
            break;
        case 'week':
            totalKeys = '85,421';
            todayKeys = '12,203';
            avgKpm = '42';
            activeApps = '12';
            break;
        case 'month':
            totalKeys = '342,198';
            todayKeys = '11,406';
            avgKpm = '40';
            activeApps = '15';
            break;
        case 'all':
            totalKeys = '1,245,632';
            todayKeys = '10,521';
            avgKpm = '38';
            activeApps = '24';
            break;
        default:
            totalKeys = '12,345';
            todayKeys = '1,234';
            avgKpm = '45';
            activeApps = '8';
    }

    // 更新数值
    if (statValues.length >= 4) {
        statValues[0].textContent = totalKeys;
        statValues[1].textContent = todayKeys;
        statValues[2].textContent = avgKpm;
        statValues[3].textContent = activeApps;
    }

    // 更新趋势
    if (statTrends.length >= 4) {
        statTrends[0].textContent = '+5% 较昨日';
        statTrends[0].className = 'stat-trend positive';

        statTrends[1].textContent = '102 次/小时';

        statTrends[2].textContent = '-2% 较昨日';
        statTrends[2].className = 'stat-trend negative';

        statTrends[3].textContent = `${activeApps} 个应用`;
    }
}

// 更新图表
function updateCharts(timeRange) {
    // 在实际项目中，这里应该使用图表库（如Chart.js）渲染图表
    // 这里仅更新占位符文本
    const charts = document.querySelectorAll('.chart');

    charts.forEach(chart => {
        const placeholder = chart.querySelector('.placeholder-chart');
        if (placeholder) {
            placeholder.textContent = `${timeRange} 数据图表将在此显示`;
        }
    });
}

// 加载模拟数据
function loadMockData() {
    // 更新当前KPM
    document.querySelector('.kpm-value').textContent = '42';

    // 更新统计卡片
    updateStatsCards(currentTimeFilter);

    // 更新图表
    updateCharts(currentTimeFilter);

    // 设置数据路径
    const dataPathEl = document.getElementById('data-path');
    if (dataPathEl) {
        dataPathEl.textContent = 'C:\\Users\\Username\\AppData\\Roaming\\keyboard-statistics';
    }
}

// 调用后端API的辅助函数
async function callBackend(command, params = {}) {
    try {
        return await invoke(command, params);
    } catch (error) {
        console.error(`调用 ${command} 失败:`, error);
        throw error;
    }
}