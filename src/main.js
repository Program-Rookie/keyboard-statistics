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

    // 加载数据（从后端获取）
    await loadData();

    // 设置定时刷新KPM数据
    setupAutoRefresh();

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
    const exportBtn = document.getElementById('export-data');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            showModal('export-modal');
        });
    }

    // 确认导出按钮
    const confirmExportBtn = document.getElementById('confirm-export');
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', exportData);
    }

    // 删除数据按钮
    const deleteBtn = document.getElementById('delete-data');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showModal('delete-modal');
        });
    }

    // 确认删除按钮
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteData);
    }

    // 确认删除复选框
    const confirmDeleteCheckbox = document.getElementById('confirm-delete-checkbox');
    if (confirmDeleteCheckbox) {
        confirmDeleteCheckbox.addEventListener('change', (e) => {
            if (confirmDeleteBtn) {
                confirmDeleteBtn.disabled = !e.target.checked;
            }
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
            // 移除所有活动状态
            themeButtons.forEach(b => b.classList.remove('active'));

            // 添加当前活动状态
            btn.classList.add('active');

            // 获取主题
            const theme = btn.getAttribute('data-theme');

            // 切换主题
            toggleTheme(theme === 'dark');
        });
    });

    // 自启动切换
    const autostartToggle = document.getElementById('autostart-toggle');
    if (autostartToggle) {
        autostartToggle.addEventListener('change', toggleAutostart);
    }

    // 退出确认切换
    const exitConfirmToggle = document.getElementById('exit-confirm-toggle');
    if (exitConfirmToggle) {
        exitConfirmToggle.addEventListener('change', (e) => {
            updateExitConfirmSetting(e.target.checked);
        });
    }

    // 打开数据文件夹按钮
    const openDataFolderBtn = document.getElementById('open-data-folder');
    if (openDataFolderBtn) {
        openDataFolderBtn.addEventListener('click', async() => {
            try {
                const path = await invoke('get_database_path');
                if (path) {
                    // 获取数据库目录路径（去掉文件名）
                    const folderPath = path.substring(0, path.lastIndexOf('\\'));
                    // 使用系统默认的文件管理器打开该目录
                    await invoke('open_folder', { path: folderPath });
                }
            } catch (error) {
                console.error('打开数据文件夹失败:', error);
                alert('无法打开数据文件夹，请确认应用权限');
            }
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

    try {
        // 显示加载中状态
        const confirmExportBtn = document.getElementById('confirm-export');
        const originalText = confirmExportBtn.textContent;
        confirmExportBtn.textContent = '导出中...';
        confirmExportBtn.disabled = true;

        // 调用后端API导出数据
        const result = await invoke('export_data', { format, range, typeStr: type });

        // 恢复按钮状态
        confirmExportBtn.textContent = originalText;
        confirmExportBtn.disabled = false;

        // 显示成功消息
        alert(`数据导出成功！\n文件已保存到: ${result}`);
        hideModal('export-modal');
    } catch (error) {
        console.error('导出数据失败:', error);
        alert(`导出数据失败: ${error}`);

        // 恢复按钮状态
        const confirmExportBtn = document.getElementById('confirm-export');
        if (confirmExportBtn) {
            confirmExportBtn.textContent = '导出';
            confirmExportBtn.disabled = false;
        }
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

    try {
        // 显示加载中状态
        const confirmDeleteBtn = document.getElementById('confirm-delete');
        const originalText = confirmDeleteBtn.textContent;
        confirmDeleteBtn.textContent = '删除中...';
        confirmDeleteBtn.disabled = true;

        // 调用后端API删除数据
        const result = await invoke('delete_data', { range });

        // 恢复按钮状态
        confirmDeleteBtn.textContent = originalText;
        confirmDeleteBtn.disabled = true; // 保持禁用状态，直到用户再次勾选确认框

        // 显示成功消息
        alert(result);
        hideModal('delete-modal');

        // 重置确认复选框
        document.getElementById('confirm-delete-checkbox').checked = false;

        // 更新数据显示
        loadData();
    } catch (error) {
        console.error('删除数据失败:', error);
        alert(`删除数据失败: ${error}`);

        // 恢复按钮状态
        const confirmDeleteBtn = document.getElementById('confirm-delete');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.textContent = '删除';
            confirmDeleteBtn.disabled = false;
        }
    }
}

// 清除所有数据
async function clearAllData() {
    // 再次确认
    if (!confirm('确定要清除所有数据吗？此操作不可撤销。')) {
        return;
    }

    try {
        // 调用后端API清除所有数据
        const result = await invoke('clear_all_data');
        alert(result);

        // 更新数据显示
        loadData();
    } catch (error) {
        console.error('清除数据失败:', error);
        alert(`清除数据失败: ${error}`);
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
async function updateDataByTimeRange(timeRange) {
    try {
        // 显示加载指示器
        const kpmValueElement = document.querySelector('.kpm-value');
        const totalPressesElement = document.querySelector('.total-presses-value');

        // 检查元素是否存在
        if (kpmValueElement) {
            kpmValueElement.textContent = '加载中...';
        }
        if (totalPressesElement) {
            totalPressesElement.textContent = '加载中...';
        }

        // 保存当前时间范围选择
        currentTimeFilter = timeRange;

        // 使用与loadData函数相同的模拟数据
        const mockStats = {
            total_presses: 12500,
            kpm: 68.5,
            most_used_keys: [
                ["A", 1250],
                ["E", 980],
                ["Space", 850],
                ["T", 740],
                ["O", 720],
                ["I", 690],
                ["N", 570],
                ["S", 560],
                ["R", 540],
                ["L", 490]
            ],
            key_categories: {
                "字母键": 7800,
                "空格键": 1500,
                "数字键": 920,
                "修饰键": 850,
                "符号键": 780,
                "功能键": 350,
                "导航键": 300
            },
            app_usage: {
                "VSCode": 3500,
                "Chrome": 2800,
                "Word": 1500,
                "Outlook": 1200,
                "PowerPoint": 900,
                "Excel": 850,
                "Teams": 650,
                "Explorer": 400,
                "其他应用": 700
            },
            time_distribution: {
                "09": 850,
                "10": 1200,
                "11": 1350,
                "12": 650,
                "13": 500,
                "14": 1100,
                "15": 1300,
                "16": 1450,
                "17": 1200,
                "18": 750,
                "19": 500,
                "20": 850,
                "21": 800
            }
        };

        let stats;
        try {
            // 尝试从后端获取统计数据
            stats = await invoke('get_key_stats', { timeRange });
        } catch (error) {
            console.warn('后端API调用失败，使用模拟数据:', error);
            stats = mockStats; // 如果后端API不可用，使用模拟数据
        }

        // 更新统计卡片
        updateStatsCards(stats);

        // 更新图表
        updateCharts(stats);
    } catch (error) {
        console.error('更新数据失败:', error);
        // 同样检查元素是否存在
        const kpmValueElement = document.querySelector('.kpm-value');
        const totalPressesElement = document.querySelector('.total-presses-value');

        if (kpmValueElement) {
            kpmValueElement.textContent = '更新失败';
        }
        if (totalPressesElement) {
            totalPressesElement.textContent = '更新失败';
        }
    }
}

// 更新统计卡片
function updateStatsCards(stats) {
    try {
        const statValues = document.querySelectorAll('.stat-value');
        const statTrends = document.querySelectorAll('.stat-trend');

        // 使用后端数据
        if (statValues.length >= 4) {
            try {
                statValues[0].textContent = stats.total_presses.toLocaleString();
                statValues[1].textContent = stats.total_presses.toLocaleString(); // 今日按键与总按键相同，后续可修改
                statValues[2].textContent = stats.kpm.toFixed(1);
                statValues[3].textContent = Object.keys(stats.app_usage).length;
            } catch (error) {
                console.warn('更新统计卡片数值失败:', error);
            }
        }

        // 更新趋势（目前无法获取趋势数据，保留静态内容）
        if (statTrends.length >= 4) {
            try {
                statTrends[0].textContent = '当前统计';
                statTrends[0].className = 'stat-trend';

                statTrends[1].textContent = `${Math.round(stats.kpm * 60)} 次/小时`;

                statTrends[2].textContent = '实时数据';
                statTrends[2].className = 'stat-trend';

                statTrends[3].textContent = `${Object.keys(stats.app_usage).length} 个应用`;
            } catch (error) {
                console.warn('更新统计卡片趋势失败:', error);
            }
        }
    } catch (error) {
        console.error('更新统计卡片整体失败:', error);
    }
}

// 更新图表
function updateCharts(stats) {
    try {
        // 更新按键类型分布图表
        updateKeyTypeChart(stats);

        // 更新最常用按键图表
        updateTopKeysChart(stats);

        // 更新应用使用时间分布图表
        updateAppTimeChart(stats);

        // 更新时间分布图表
        updateTimeDistributionChart(stats);

        // 更新KPM趋势图
        updateKpmTrendChart(stats);

        // 更新活动热力图
        updateActivityHeatmap(stats);
    } catch (error) {
        console.error('更新图表失败:', error);
    }
}

// 更新按键类型分布图表
function updateKeyTypeChart(stats) {
    const chartElement = document.getElementById('key-type-chart');
    if (!chartElement) return;

    // 清除旧的图表
    const canvas = chartElement.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
    const newCanvas = document.createElement('canvas');
    chartElement.appendChild(newCanvas);

    // 处理数据
    const categories = stats.key_categories;
    const labels = Object.keys(categories);
    const data = Object.values(categories);

    // 创建图表
    new Chart(newCanvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#4a6cf7', '#6c8cff', '#94a3ff', '#b6bcff',
                    '#d8d5ff', '#f092ff', '#ff71a3', '#ff6b6b'
                ],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                }
            }
        }
    });
}

// 更新最常用按键图表
function updateTopKeysChart(stats) {
    const chartElement = document.getElementById('top-keys-chart');
    if (!chartElement) return;

    // 清除旧的图表
    const canvas = chartElement.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
    const newCanvas = document.createElement('canvas');
    chartElement.appendChild(newCanvas);

    // 准备数据
    const keys = stats.most_used_keys.map(item => item[0]);
    const counts = stats.most_used_keys.map(item => item[1]);

    // 创建图表
    new Chart(newCanvas, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [{
                label: '使用次数',
                data: counts,
                backgroundColor: '#4a6cf7',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
                x: {
                    grid: {
                        display: false,
                    },
                },
            },
        },
    });
}

// 更新应用使用时间分布图表
function updateAppTimeChart(stats) {
    const chartElement = document.getElementById('app-time-chart');
    if (!chartElement) return;

    // 清除旧的图表
    const canvas = chartElement.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
    const newCanvas = document.createElement('canvas');
    chartElement.appendChild(newCanvas);

    // 准备数据：应用使用时间分布
    const appUsage = stats.app_usage;
    const apps = Object.keys(appUsage).slice(0, 10); // 只显示前10个应用
    const usageData = apps.map(app => appUsage[app]);

    // 创建图表
    new Chart(newCanvas, {
        type: 'bar',
        data: {
            labels: apps,
            datasets: [{
                label: '按键次数',
                data: usageData,
                backgroundColor: '#4a6cf7',
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                    },
                },
            },
        },
    });
}

// 更新时间分布图表
function updateTimeDistributionChart(stats) {
    const chartElement = document.getElementById('hourly-distribution-chart');
    if (!chartElement) return;

    // 清除旧的图表
    const canvas = chartElement.querySelector('canvas');
    if (canvas) {
        canvas.remove();
    }
    const newCanvas = document.createElement('canvas');
    chartElement.appendChild(newCanvas);

    // 准备数据：小时分布
    const timeData = new Array(24).fill(0);
    Object.entries(stats.time_distribution).forEach(([hour, count]) => {
        const hourNum = parseInt(hour, 10);
        if (!isNaN(hourNum) && hourNum >= 0 && hourNum < 24) {
            timeData[hourNum] = count;
        }
    });

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    // 创建图表
    new Chart(newCanvas, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: '按键活动',
                data: timeData,
                backgroundColor: 'rgba(74, 108, 247, 0.2)',
                borderColor: '#4a6cf7',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        maxTicksLimit: 12,
                    },
                },
            },
        },
    });
}

// 更新KPM趋势图
function updateKpmTrendChart(stats) {
    const chartElement = document.getElementById('kpm-trend-chart');
    if (!chartElement) return;

    // 清除旧的图表和任何占位内容
    chartElement.innerHTML = '';

    const newCanvas = document.createElement('canvas');
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    chartElement.appendChild(newCanvas);

    // 生成最近24小时的数据
    const labels = [];
    const data = [];
    const now = new Date();
    const timeDistribution = stats.time_distribution || {};

    // 使用时间分布数据生成趋势图数据
    for (let i = 0; i < 24; i++) {
        const hour = (now.getHours() - 24 + i + 24) % 24;
        labels.push(`${hour}:00`);

        // 如果有当前小时的数据，使用它，否则生成随机数据
        const hourKey = hour.toString().padStart(2, '0');
        const value = timeDistribution[hourKey] || Math.floor(Math.random() * stats.kpm * 2);
        data.push(value);
    }

    // 创建图表
    new Chart(newCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'KPM趋势',
                data: data,
                backgroundColor: 'rgba(74, 108, 247, 0.2)',
                borderColor: '#4a6cf7',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `按键数: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    }
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        maxTicksLimit: 6,
                    }
                }
            }
        }
    });
}

// 更新活动热力图
function updateActivityHeatmap(stats) {
    const chartElement = document.getElementById('activity-heatmap');
    if (!chartElement) return;

    // 清除旧的内容
    chartElement.innerHTML = '';

    // 创建热力图容器
    const heatmapWrapper = document.createElement('div');
    heatmapWrapper.className = 'heatmap-wrapper';
    heatmapWrapper.style.display = 'flex';
    heatmapWrapper.style.flexDirection = 'column';
    heatmapWrapper.style.width = '100%';
    heatmapWrapper.style.height = '100%';
    chartElement.appendChild(heatmapWrapper);

    // 添加标题行
    const headerRow = document.createElement('div');
    headerRow.className = 'heatmap-header';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-around';
    headerRow.style.marginBottom = '10px';
    headerRow.style.fontSize = '10px';
    headerRow.style.paddingLeft = '50px'; // 为左侧的日期标签留出空间
    heatmapWrapper.appendChild(headerRow);

    // 添加小时标签
    for (let hour = 0; hour < 24; hour += 3) {
        const hourLabel = document.createElement('div');
        hourLabel.textContent = `${hour}:00`;
        hourLabel.style.flexBasis = '12.5%';
        hourLabel.style.textAlign = 'center';
        headerRow.appendChild(hourLabel);
    }

    // 主体内容容器
    const mainContent = document.createElement('div');
    mainContent.style.display = 'flex';
    mainContent.style.flex = '1';
    heatmapWrapper.appendChild(mainContent);

    // 添加日期列
    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const dayContainer = document.createElement('div');
    dayContainer.className = 'heatmap-day-labels';
    dayContainer.style.display = 'flex';
    dayContainer.style.flexDirection = 'column';
    dayContainer.style.justifyContent = 'space-around';
    dayContainer.style.width = '50px';
    mainContent.appendChild(dayContainer);

    dayLabels.forEach(day => {
        const dayLabel = document.createElement('div');
        dayLabel.textContent = day;
        dayLabel.style.textAlign = 'right';
        dayLabel.style.paddingRight = '10px';
        dayLabel.style.fontSize = '12px';
        dayContainer.appendChild(dayLabel);
    });

    // 创建热力图表格
    const heatmapGrid = document.createElement('div');
    heatmapGrid.className = 'heatmap-grid';
    heatmapGrid.style.display = 'flex';
    heatmapGrid.style.flex = '1';
    heatmapGrid.style.flexDirection = 'column';
    mainContent.appendChild(heatmapGrid);

    // 生成热力图数据
    const timeDistribution = stats.time_distribution || {};

    // 为每一天创建一行
    for (let day = 0; day < 7; day++) {
        const dayRow = document.createElement('div');
        dayRow.className = 'heatmap-row';
        dayRow.style.display = 'flex';
        dayRow.style.flex = '1';
        dayRow.style.margin = '1px 0';
        heatmapGrid.appendChild(dayRow);

        // 为每个小时创建一个单元格
        for (let hour = 0; hour < 24; hour++) {
            const hourKey = hour.toString().padStart(2, '0');

            // 如果有当前小时的数据，使用它，否则生成随机数据
            const baseValue = timeDistribution[hourKey] || 0;
            const randomFactor = Math.random() * 0.5 + 0.5; // 0.5-1.0之间的随机数
            const value = Math.max(0, Math.floor(baseValue * randomFactor));

            // 计算颜色强度 (0.1-0.8)
            const intensity = Math.min(0.8, Math.max(0.1, value / 1000));

            // 创建一个单元格
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.flex = '1';
            cell.style.margin = '0 1px';
            cell.style.backgroundColor = `rgba(74, 108, 247, ${intensity})`;
            cell.style.borderRadius = '2px';
            cell.title = `${dayLabels[day]} ${hour}:00 - 活跃度: ${value}`;

            dayRow.appendChild(cell);
        }
    }
}

// 加载数据（替换原有的loadMockData）
async function loadData() {
    try {
        // 设置初始KPM值，避免长时间显示"计算中..."
        const kpmValueElement = document.querySelector('.kpm-value');
        if (kpmValueElement) {
            kpmValueElement.textContent = '0.0';
        }

        // 模拟数据（当后端API不可用时使用）
        const mockStats = {
            total_presses: 12500,
            kpm: 68.5,
            most_used_keys: [
                ["A", 1250],
                ["E", 980],
                ["Space", 850],
                ["T", 740],
                ["O", 720],
                ["I", 690],
                ["N", 570],
                ["S", 560],
                ["R", 540],
                ["L", 490]
            ],
            key_categories: {
                "字母键": 7800,
                "空格键": 1500,
                "数字键": 920,
                "修饰键": 850,
                "符号键": 780,
                "功能键": 350,
                "导航键": 300
            },
            app_usage: {
                "VSCode": 3500,
                "Chrome": 2800,
                "Word": 1500,
                "Outlook": 1200,
                "PowerPoint": 900,
                "Excel": 850,
                "Teams": 650,
                "Explorer": 400,
                "其他应用": 700
            },
            time_distribution: {
                "09": 850,
                "10": 1200,
                "11": 1350,
                "12": 650,
                "13": 500,
                "14": 1100,
                "15": 1300,
                "16": 1450,
                "17": 1200,
                "18": 750,
                "19": 500,
                "20": 850,
                "21": 800
            }
        };

        // 先用模拟数据更新UI，确保页面响应速度
        updateStatsCards(mockStats);
        updateCharts(mockStats);

        // 然后尝试从后端获取真实数据
        let stats;
        try {
            console.log('正在从后端获取数据，当前时间范围:', currentTimeFilter);
            stats = await invoke('get_key_stats', { timeRange: currentTimeFilter });
            console.log('获取到后端数据:', stats);

            // 使用真实数据更新UI
            updateStatsCards(stats);
            updateCharts(stats);
        } catch (error) {
            console.warn('从后端获取数据失败，使用模拟数据:', error);
            // 如果后端数据不可用，保留模拟数据展示
        }

        // 获取并显示数据库路径
        try {
            const dbPath = await invoke('get_database_path');
            const dataPathElement = document.getElementById('data-path');
            if (dataPathElement && dbPath) {
                // 获取数据库目录路径（去掉文件名）
                const folderPath = dbPath.substring(0, dbPath.lastIndexOf('\\'));
                dataPathElement.textContent = folderPath;
            }
        } catch (error) {
            console.warn('获取数据库路径失败:', error);
            // 如果获取失败，显示默认路径
            const dataPathElement = document.getElementById('data-path');
            if (dataPathElement) {
                dataPathElement.textContent = '无法获取数据库路径';
            }
        }
    } catch (error) {
        console.error('加载数据失败:', error);
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

// 设置自动刷新
function setupAutoRefresh() {
    // 每30秒更新一次KPM值
    setInterval(async() => {
        try {
            const kpmValueElement = document.querySelector('.kpm-value');
            if (!kpmValueElement) return;

            // 如果当前不是"加载中..."状态，则显示刷新图标或其他指示
            if (kpmValueElement.textContent !== '计算中...') {
                const originalText = kpmValueElement.textContent;
                kpmValueElement.innerHTML = `<span title="正在刷新KPM...">↻ ${originalText}</span>`;
            }

            try {
                // 尝试从后端获取统计数据，只更新KPM值
                const stats = await invoke('get_key_stats', { timeRange: currentTimeFilter });
                if (stats && typeof stats.kpm === 'number') {
                    kpmValueElement.textContent = stats.kpm.toFixed(1);

                    // 同时更新统计卡片中的KPM
                    const statValues = document.querySelectorAll('.stat-value');
                    if (statValues.length >= 3) {
                        statValues[2].textContent = stats.kpm.toFixed(1);
                    }
                }
            } catch (error) {
                console.warn('自动刷新KPM失败:', error);
            }
        } catch (error) {
            console.error('自动刷新出错:', error);
        }
    }, 30000); // 30秒
}