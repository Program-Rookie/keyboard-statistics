const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, currentMonitor } = window.__TAURI__.window;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
// 使用require导入日志工具
import Logger from './lib/logger.js';

// 全局变量
let currentPage = 'dashboard';
let currentTimeFilter = 'today';
let isRecording = true;
let isDarkTheme = false;
let showExitConfirm = true; // 默认显示退出确认
const appWindow = getCurrentWindow();

// 安全地获取当前显示器信息的包装函数
async function safeGetCurrentMonitor() {
    try {
        const monitor = await currentMonitor();
        if (monitor && monitor.width && monitor.height) {
            return monitor;
        }
        console.warn('获取到的显示器信息不完整，使用默认值');
    } catch (error) {
        console.error('获取当前显示器信息失败:', error);
    }

    // 返回默认显示器信息
    return {
        width: 1920,
        height: 1080,
        position_x: 0,
        position_y: 0,
        name: '默认显示器',
        is_primary: true
    };
}

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

    // 初始化自启动设置
    await initAutostartSetting();

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

    // 初始化overlay窗口
    createOverlayWindow();

    // 初始化弹窗位置设置
    await initPopupPositionSetting();

    // 初始化主题设置
    initThemeSettings();
});

// 初始化overlay窗口
async function createOverlayWindow() {
    console.log('尝试创建overlay窗口');
    Logger.info(Logger.LogSource.MAIN, "尝试创建overlay窗口");

    // 获取保存的位置设置
    let popupX = null;
    let popupY = null; // 现在只使用正值
    let monitorId = null; // 默认为空，使用主显示器

    try {
        const positionJson = await invoke('get_popup_position');
        const position = JSON.parse(positionJson);
        popupX = position.x;
        popupY = position.y;
        monitorId = position.monitor_id;
        console.log('读取到的弹窗位置:', position);
    } catch (error) {
        console.error('获取弹窗位置失败，使用默认值:', error);
    }

    // 获取目标显示器信息
    let targetMonitor = null;

    try {
        // 如果指定了显示器ID，尝试获取该显示器
        if (monitorId) {
            const monitorsJson = await invoke('get_all_monitors');
            const monitors = JSON.parse(monitorsJson);
            targetMonitor = monitors.find(m => m.id === monitorId);
        }

        // 如果没有指定或没找到，使用当前显示器
        if (!targetMonitor) {
            targetMonitor = await safeGetCurrentMonitor();
        }
    } catch (error) {
        console.error('获取显示器信息失败:', error);
        // 出错时使用当前显示器
        targetMonitor = await safeGetCurrentMonitor();
    }

    if (!targetMonitor) {
        console.error('无法获取有效的显示器信息');
        // 使用默认显示器信息继续执行
        targetMonitor = {
            width: 1920,
            height: 1080,
            position_x: 0,
            position_y: 0
        };
        Logger.warning(Logger.LogSource.MAIN, "无法获取有效的显示器信息，使用默认值");
    }

    console.log('使用显示器:', targetMonitor);

    // 根据显示器尺寸动态计算窗口大小
    const idealSize = windowSizeForMonitor(targetMonitor);
    const winWidth = idealSize.width;
    const winHeight = idealSize.height;

    if (popupX == null || popupY == null) {
        popupX = 80;
        popupY = targetMonitor.height * 0.80;
    }
    // 确保位置不会超出屏幕
    const safeX = Math.max(0, Math.min(popupX, targetMonitor.width - winWidth));
    const safeY = Math.max(0, Math.min(popupY, targetMonitor.height - winHeight));

    // 计算全局坐标
    const globalX = targetMonitor.position_x + safeX;
    const globalY = targetMonitor.position_y + safeY;

    // 确保坐标是有效数值
    const validX = Number.isFinite(globalX) ? globalX : 0;
    const validY = Number.isFinite(globalY) ? globalY : 0;

    console.log(`弹窗位置: 显示器=${targetMonitor.width}×${targetMonitor.height}, 局部坐标=(x=${safeX}, y=${safeY}), 全局坐标=(x=${validX}, y=${validY})`);

    try {
        // 创建窗口
        const popup = new WebviewWindow('key_popup', {
            url: 'key_popup.html',
            transparent: true,
            decorations: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: true,
            width: winWidth,
            height: winHeight,
            x: validX, // 使用验证过的坐标
            y: validY, // 使用验证过的坐标
            visible: false,
            focus: false,
            theme: 'dark',
            shadow: false,
            acceptFirstMouse: false
        });

        popup.once('tauri://created', function() {
            console.log('webview 已成功创建');
            Logger.info(Logger.LogSource.MAIN, "webview 已成功创建");
            popup.setBackgroundColor({ r: 0, g: 0, b: 0, a: 0 });
            // 设置窗口忽略鼠标事件，允许点击穿透
            popup.setIgnoreCursorEvents(true);
        });
        popup.once('tauri://error', function(error) {
            console.error('创建webview窗口失败:', error);
            Logger.error(Logger.LogSource.MAIN, "创建webview窗口失败:" + error.payload);
        });
    } catch (error) {
        console.error('创建webview窗口失败:', error);
        Logger.error(Logger.LogSource.MAIN, "创建webview窗口失败:" + error.payload);
    }
}

// 根据显示器尺寸计算弹窗窗口大小
function windowSizeForMonitor(monitor) {
    try {
        // 获取显示器尺寸，添加默认值防止undefined
        const monitorWidth = monitor && monitor.width ? monitor.width : 1920;
        const monitorHeight = monitor && monitor.height ? monitor.height : 1080;

        // 计算弹窗窗口大小（根据显示器尺寸的比例）
        // 宽度为显示器宽度的15%，最小200px
        const width = Math.max(380, Math.round(monitorWidth * 0.15));
        const height = Math.max(386, Math.round(monitorHeight * 0.2));

        console.log(`计算弹窗尺寸: 显示器=${monitorWidth}×${monitorHeight}, 弹窗=${width}×${height}`);
        Logger.info(Logger.LogSource.MAIN, `计算弹窗尺寸: 显示器=${monitorWidth}×${monitorHeight}, 弹窗=${width}×${height}`);
        return {
            width,
            height
        };
    } catch (error) {
        console.error('计算弹窗尺寸时出错:', error);
        Logger.error(Logger.LogSource.MAIN, `计算弹窗尺寸时出错: ${error}`);
        // 返回默认尺寸
        return {
            width: 380,
            height: 386
        };
    }
}

// 根据显示器尺寸调整预览区域比例
function adjustPreviewAreaRatio(previewContainer, monitor, forceRecalculate = false) {
    if (!previewContainer || !monitor) {
        console.error('调整预览区域比例失败: 容器或显示器为空');
        return;
    }

    // 确保monitor有有效的宽高
    if (!monitor.width || !monitor.height) {
        console.error('显示器缺少有效的宽高信息');
        monitor = {
            ...monitor,
            width: monitor.width || 1920,
            height: monitor.height || 1080
        };
    }

    // 计算显示器宽高比
    const monitorRatio = monitor.height / monitor.width;

    // 获取容器宽度的策略：
    // 1. 如果forceRecalculate为true或者容器宽度很小，则重新计算宽度
    // 2. 检查父元素是否有可见宽度
    // 3. 检查settings-page的宽度
    // 4. 检查dashboard-page的宽度
    // 5. 使用一个默认值作为后备

    let containerWidth = 0;

    // 判断是否需要强制重新计算宽度（窗口大小变化时）
    if (forceRecalculate || previewContainer.offsetWidth < 10) {
        // 检查父元素宽度
        if (previewContainer.parentElement && previewContainer.parentElement.offsetWidth > 10) {
            containerWidth = previewContainer.parentElement.offsetWidth * 0.8;
        }
        // 检查设置页面宽度（因为预览容器在设置页面中）
        else {
            const settingsPage = document.getElementById('settings-page');
            if (settingsPage && settingsPage.offsetWidth > 10) {
                containerWidth = settingsPage.offsetWidth * 0.8;
            }
            // 如果都不可见，尝试使用dashboard页面宽度
            else {
                const dashboardPage = document.getElementById('dashboard-page');
                if (dashboardPage && dashboardPage.offsetWidth > 10) {
                    containerWidth = dashboardPage.offsetWidth * 0.8;
                }
                // 最后的后备选项 - 使用窗口宽度的一部分
                else {
                    containerWidth = Math.min(800, window.innerWidth * 0.6);
                    console.log('使用窗口宽度作为后备：', containerWidth);
                }
            }
        }
    } else {
        // 如果容器已有合理宽度且不需要强制重新计算，保持其宽度不变
        containerWidth = previewContainer.offsetWidth;
    }

    // 确保宽度至少有最小值
    containerWidth = Math.round(containerWidth);

    // 根据显示器比例计算高度
    const containerHeight = Math.round(containerWidth * monitorRatio);

    // 设置容器尺寸
    previewContainer.style.width = `${containerWidth}px`;
    previewContainer.style.height = `${containerHeight}px`;

    console.log(`调整预览区域: 显示器=${monitor.width}×${monitor.height}, 比例=${monitorRatio.toFixed(2)}, 预览区域=${containerWidth}×${containerHeight}`);

    return { width: containerWidth, height: containerHeight };
}

// 初始化退出确认设置
async function initExitConfirmSetting() {
    try {
        const showExitConfirm = await invoke('get_exit_confirm_setting');
        const exitConfirmToggle = document.getElementById('exit-confirm-toggle');
        if (exitConfirmToggle) {
            exitConfirmToggle.checked = showExitConfirm;
        }
    } catch (error) {
        console.error('获取退出确认设置失败:', error);
    }
}

// 初始化自启动设置
async function initAutostartSetting() {
    try {
        const autostartEnabled = await invoke('get_autostart_setting');
        const autostartToggle = document.getElementById('autostart-toggle');
        if (autostartToggle) {
            autostartToggle.checked = autostartEnabled;
        }
    } catch (error) {
        console.error('获取自启动设置失败:', error);
    }
}

// 更新退出确认设置
async function updateExitConfirmSetting(event) {
    const showConfirm = event.target.checked;

    try {
        await invoke('update_exit_confirm', { showConfirm });
    } catch (error) {
        console.error('更新退出确认设置失败:', error);
        alert('设置失败，请重试。');

        // 恢复原状态
        event.target.checked = !showConfirm;
    }
}

// 更新自启动设置
async function updateAutostartSetting(event) {
    const isEnabled = event.target.checked;

    try {
        await invoke('set_autostart', { enabled: isEnabled });
    } catch (error) {
        console.error('设置自启动失败:', error);
        alert('设置自启动失败，请重试。');

        // 恢复原状态
        event.target.checked = !isEnabled;
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

        // 控制顶部日期切换控件的显示隐藏
        const topBar = document.querySelector('.top-bar');
        if (pageId === 'healthAssessment' || pageId === 'settings') {
            // 健康评估页面隐藏顶部日期控件
            topBar.style.display = 'none';
        } else {
            // 其他页面显示顶部日期控件
            topBar.style.display = 'flex';
        }
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

    // 信息图标提示框初始化
    initInfoIcons();

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

    // 取消导出按钮
    const cancelExportBtn = document.getElementById('cancel-export');
    if (cancelExportBtn) {
        cancelExportBtn.addEventListener('click', () => {
            hideModal('export-modal');
        });
    }

    // 删除数据按钮
    const deleteBtn = document.getElementById('delete-data');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showModal('delete-modal');
        });
    }

    // 确认删除复选框
    const confirmDeleteCheckbox = document.getElementById('confirm-delete-checkbox');
    if (confirmDeleteCheckbox) {
        confirmDeleteCheckbox.addEventListener('change', function() {
            const confirmDeleteBtn = document.getElementById('confirm-delete');
            if (confirmDeleteBtn) {
                confirmDeleteBtn.disabled = !this.checked;
            }
        });
    }

    // 确认删除按钮
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteData);
    }

    // 取消删除按钮
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            hideModal('delete-modal');
        });
    }

    // 退出确认开关
    const exitConfirmToggle = document.getElementById('exit-confirm-toggle');
    if (exitConfirmToggle) {
        exitConfirmToggle.addEventListener('change', updateExitConfirmSetting);
    }

    // 自启动开关
    const autostartToggle = document.getElementById('autostart-toggle');
    if (autostartToggle) {
        autostartToggle.addEventListener('change', updateAutostartSetting);
    }

    // 打开数据文件夹按钮
    const openDataFolderBtn = document.getElementById('open-data-folder');
    if (openDataFolderBtn) {
        openDataFolderBtn.addEventListener('click', async() => {
            try {
                const dbPath = await invoke('get_database_path');
                // 获取数据库目录路径（去掉文件名）
                const folderPath = dbPath.substring(0, dbPath.lastIndexOf('\\'));
                await invoke('open_folder', { path: folderPath });
            } catch (error) {
                console.error('打开文件夹失败:', error);
                alert('无法打开文件夹，请确认应用权限。');
            }
        });
    }

    // 健康评估按钮
    const assessHealthBtn = document.getElementById('assess-health');
    if (assessHealthBtn) {
        assessHealthBtn.addEventListener('click', performHealthAssessment);
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

    const exitConfirmToggle = document.getElementById('exit-confirm-toggle');

    minimizeBtn.addEventListener('click', async() => {
        if (noConfirmCheckbox.checked) {
            // 更新退出确认设置
            await invoke('update_exit_confirm', { showConfirm: false });
            // 保存最小化行为
            await invoke('update_close_behavior', { minimize: true });
            if (exitConfirmToggle) {
                exitConfirmToggle.checked = false;
            }
        }
        hideModal('exit-confirm-modal');
        appWindow.hide();
    });

    exitBtn.addEventListener('click', async() => {
        if (noConfirmCheckbox.checked) {
            // 更新退出确认设置
            await invoke('update_exit_confirm', { showConfirm: false });
            // 保存退出行为
            await invoke('update_close_behavior', { minimize: false });
            if (exitConfirmToggle) {
                exitConfirmToggle.checked = false;
            }
        }
        await invoke('exit_app');
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
async function performHealthAssessment() {
    // 获取用户输入
    const occupationSelect = document.getElementById('occupation');
    const dailyHoursSelect = document.getElementById('daily-hours');
    const hasBreaksCheckbox = document.getElementById('has-breaks');
    const hasWristSupportCheckbox = document.getElementById('has-support');

    const occupation = occupationSelect.value;
    const dailyHours = dailyHoursSelect.value;
    const hasBreaks = hasBreaksCheckbox ? hasBreaksCheckbox.checked : false;
    const hasWristSupport = hasWristSupportCheckbox ? hasWristSupportCheckbox.checked : false;

    // 表单验证
    if (!occupation || !dailyHours) {
        alert('请填写职业类型和每日电脑使用时长');
        return;
    }

    try {
        // 显示加载状态
        const assessHealthBtn = document.getElementById('assess-health');
        const originalText = assessHealthBtn.textContent;
        assessHealthBtn.textContent = '评估中...';
        assessHealthBtn.disabled = true;

        // 保存用户健康配置
        await invoke('save_health_profile', {
            occupation,
            dailyHours,
            hasBreaks,
            hasSupport: hasWristSupport
        });

        // 获取健康风险指标 - 不再传递时间范围参数
        const metricsJson = await invoke('get_health_risk_metrics', {});

        const metrics = JSON.parse(metricsJson);
        console.log('健康风险指标:', metrics);

        // 计算健康风险
        const riskResult = calculateHealthRisk(metrics, {
            occupation,
            dailyHours,
            hasBreaks,
            hasWristSupport
        });

        // 显示结果
        displayHealthAssessment(riskResult);

        // 恢复按钮状态
        assessHealthBtn.textContent = originalText;
        assessHealthBtn.disabled = false;
    } catch (error) {
        console.error('健康评估失败:', error);
        alert('健康评估失败，请稍后再试');

        // 恢复按钮状态
        const assessHealthBtn = document.getElementById('assess-health');
        if (assessHealthBtn) {
            assessHealthBtn.textContent = '评估健康风险';
            assessHealthBtn.disabled = false;
        }
    }
}

// 计算健康风险
function calculateHealthRisk(metrics, userProfile) {
    // 定义风险阈值
    const THRESHOLD_DAILY_KEYS_HIGH = 30000; // 日均按键量高阈值
    const THRESHOLD_AVG_KPM_HIGH = 60; // 平均KPM高阈值
    const THRESHOLD_CONTINUOUS_SESSION_LONG = 60 * 60; // 长会话阈值（秒）
    const THRESHOLD_FREQUENT_LONG_SESSIONS = 2; // 频繁长会话阈值（每天）

    // 风险标志
    let riskFlags = {
        highKeyVolume: metrics.daily_avg_keys > THRESHOLD_DAILY_KEYS_HIGH,
        highKPM: metrics.avg_kpm > THRESHOLD_AVG_KPM_HIGH,
        longSessions: metrics.long_sessions_count > 0,
        frequentLongSessions: metrics.long_sessions_per_day > THRESHOLD_FREQUENT_LONG_SESSIONS
    };

    // 计算触发的风险标志数量
    const flagCount = Object.values(riskFlags).filter(flag => flag).length;

    // 基础风险评估
    let riskLevel = getRiskLevel(flagCount, userProfile);
    let description = getHealthDescription(flagCount, riskFlags, userProfile);

    // 添加洞察和建议
    let insights = generateInsights(metrics, riskFlags, userProfile);
    let recommendations = generateRecommendations(metrics, riskFlags, userProfile, riskLevel);

    return {
        riskLevel,
        description,
        insights,
        recommendations,
        metrics // 添加指标数据用于调试
    };
}

// 获取风险等级
function getRiskLevel(flagCount, userProfile) {
    const { dailyHours, hasBreaks, hasWristSupport } = userProfile;

    // 基础风险评估
    if (flagCount >= 3) {
        return '高';
    } else if (flagCount >= 1) {
        // 中等风险，但如果用户每日使用时间长，且没有休息/支持，则升级为高风险
        if (dailyHours === '10+' && !hasBreaks && !hasWristSupport) {
            return '高';
        }
        return '中';
    } else {
        // 基础低风险，但如果用户每日使用时间长且没有休息，则升级为中等风险
        if (dailyHours === '10+' && !hasBreaks) {
            return '中';
        }
        return '低';
    }
}

// 获取健康描述
function getHealthDescription(flagCount, riskFlags, userProfile) {
    const { occupation, dailyHours, hasBreaks } = userProfile;

    // 根据风险标志生成描述
    if (flagCount >= 3) {
        return `您的键盘使用模式显示多项潜在风险因素，包括${riskFlags.highKeyVolume ? '高按键量' : ''}${riskFlags.highKPM ? '、高强度打字' : ''}${riskFlags.longSessions ? '、长时间连续输入' : ''}。作为${getOccupationDescription(occupation)}，建议您重视规律休息和人体工学设置。`;
    } else if (flagCount >= 1) {
        let riskFactors = [];
        if (riskFlags.highKeyVolume) riskFactors.push('较高的按键量');
        if (riskFlags.highKPM) riskFactors.push('较高的打字速度');
        if (riskFlags.longSessions) riskFactors.push('较长的连续输入时段');
        if (riskFlags.frequentLongSessions) riskFactors.push('频繁的长时间会话');

        return `数据显示您的键盘使用存在${riskFactors.join('和')}。考虑到您${getDailyHoursDescription(dailyHours)}，建议增加短暂休息的频率，并注意打字姿势。`;
    } else {
        return `根据当前数据，您的键盘使用强度处于适度范围内。${!hasBreaks ? '但建议您仍应定期休息，' : ''}保持这种良好习惯将有助于预防潜在的健康问题。`;
    }
}

// 获取职业描述
function getOccupationDescription(occupation) {
    switch (occupation) {
        case 'programmer':
            return '程序员';
        case 'writer':
            return '作家/编辑';
        case 'office':
            return '办公室职员';
        case 'designer':
            return '设计师';
        case 'student':
            return '学生';
        default:
            return '键盘使用者';
    }
}

// 获取使用时长描述
function getDailyHoursDescription(dailyHours) {
    switch (dailyHours) {
        case '1-3':
            return '每日使用电脑1-3小时';
        case '4-6':
            return '每日中等时长使用电脑';
        case '7-9':
            return '每日较长时间使用电脑';
        case '10+':
            return '每日长时间使用电脑';
        default:
            return '日常使用电脑';
    }
}

// 生成洞察
function generateInsights(metrics, riskFlags, userProfile) {
    let insights = [];

    // 添加按键量相关洞察
    if (metrics.daily_avg_keys > 30000) {
        insights.push(`您的日均按键量（${Math.round(metrics.daily_avg_keys)}次）非常高，处于重度使用级别。`);
    } else if (metrics.daily_avg_keys > 20000) {
        insights.push(`您的日均按键量（${Math.round(metrics.daily_avg_keys)}次）较高，处于中度至重度使用级别。`);
    } else if (metrics.daily_avg_keys > 10000) {
        insights.push(`您的日均按键量（${Math.round(metrics.daily_avg_keys)}次）处于中度使用级别。`);
    } else {
        insights.push(`您的日均按键量（${Math.round(metrics.daily_avg_keys)}次）处于轻度至中度使用级别。`);
    }

    // 添加KPM相关洞察
    if (metrics.avg_kpm > 60) {
        insights.push(`您的平均打字速度（${Math.round(metrics.avg_kpm)} KPM）较快，这可能增加手指和手腕的压力。`);
    } else if (metrics.avg_kpm > 40) {
        insights.push(`您的平均打字速度（${Math.round(metrics.avg_kpm)} KPM）处于中等水平。`);
    }

    // 添加会话相关洞察
    if (metrics.long_sessions_count > 0) {
        insights.push(`在分析期间，您有${metrics.long_sessions_count}次长时间连续打字会话（超过1小时无明显休息），这可能增加重复性劳损的风险。`);
    }

    if (metrics.avg_session_duration_seconds > 1800) { // 超过30分钟
        insights.push(`您的平均连续打字时长为${Math.round(metrics.avg_session_duration_seconds/60)}分钟，建议每20-30分钟短暂休息。`);
    }

    // 根据用户配置添加洞察
    if (userProfile.dailyHours === '10+' && !userProfile.hasBreaks) {
        insights.push('长时间使用电脑而不定期休息，会显著增加颈部、肩部和手腕疲劳的风险。');
    }

    return insights;
}

// 生成建议
function generateRecommendations(metrics, riskFlags, userProfile, riskLevel) {
    let recommendations = [];

    // 基础建议
    recommendations.push('保持正确的坐姿，显示器高度与眼睛平齐，手腕保持中立位置。');

    // 添加休息相关建议
    if (!userProfile.hasBreaks || riskFlags.longSessions) {
        recommendations.push('采用20-20-20法则：每使用电脑20分钟，看20英尺（约6米）外的物体20秒，缓解眼睛疲劳。');
        recommendations.push('每小时至少休息5-10分钟，起身活动、伸展肢体或做简单眼部运动。');
    }

    // 按键量相关建议
    if (riskFlags.highKeyVolume) {
        recommendations.push('考虑使用文本扩展工具或自动化脚本，减少重复性打字任务。');
    }

    // KPM相关建议
    if (riskFlags.highKPM) {
        recommendations.push('适当放慢打字速度，注重质量而非速度，减少手指和手腕的快速重复动作。');
    }

    // 设备相关建议
    if (!userProfile.hasWristSupport) {
        recommendations.push('使用护腕垫或人体工学键盘，减轻手腕压力，保持自然放松的打字姿势。');
    }

    // 专业建议
    if (riskFlags.frequentLongSessions || riskLevel === '高') {
        recommendations.push('如果经常感到手部、手腕或颈部不适，考虑咨询职业健康专家或物理治疗师。');
    }

    // 根据职业添加特定建议
    if (userProfile.occupation === 'programmer') {
        recommendations.push('程序员特别建议：利用IDE快捷键减少重复性操作，考虑使用代码片段工具减少打字量。');
    } else if (userProfile.occupation === 'writer') {
        recommendations.push('写作人员特别建议：使用语音转文字软件交替使用，减轻连续打字的负担。');
    }

    return recommendations;
}

// 显示健康评估结果
function displayHealthAssessment(result) {
    const healthResultContainer = document.querySelector('.health-result');
    const riskValue = healthResultContainer.querySelector('.risk-value');
    const riskDescription = healthResultContainer.querySelector('.risk-description');
    const insightsList = document.getElementById('insights-list');
    const recommendationsList = document.getElementById('recommendations-list');

    // 清空之前的洞察和建议
    insightsList.innerHTML = '';
    recommendationsList.innerHTML = '';

    // 设置风险等级和颜色
    riskValue.textContent = result.riskLevel;
    riskValue.className = 'risk-value'; // 重置类名

    // 根据风险等级添加相应的类名
    if (result.riskLevel === '中') {
        riskValue.classList.add('medium');
    } else if (result.riskLevel === '高') {
        riskValue.classList.add('high');
    }

    // 设置风险描述
    riskDescription.textContent = result.description;

    // 添加洞察
    if (result.insights && result.insights.length > 0) {
        result.insights.forEach(insight => {
            const insightItem = document.createElement('div');
            insightItem.className = 'insight-item';
            insightItem.textContent = insight;
            insightsList.appendChild(insightItem);
        });
    } else {
        // 如果没有洞察，隐藏整个洞察部分
        document.querySelector('.insights-section').style.display = 'none';
    }

    // 添加建议
    if (result.recommendations && result.recommendations.length > 0) {
        result.recommendations.forEach(recommendation => {
            const recommendationItem = document.createElement('div');
            recommendationItem.className = 'recommendation-item';

            const icon = document.createElement('span');
            icon.className = 'recommendation-icon';
            icon.innerHTML = '✓';

            const text = document.createElement('div');
            text.className = 'recommendation-text';
            text.textContent = recommendation;

            recommendationItem.appendChild(icon);
            recommendationItem.appendChild(text);
            recommendationsList.appendChild(recommendationItem);
        });
    }

    // 显示结果
    healthResultContainer.classList.remove('hidden');
}

// 切换主题
function toggleTheme(theme) {
    if (theme === "xiaohongshu") {
        document.documentElement.style.setProperty('--primary-color', '#ff4f76');
        document.documentElement.style.setProperty('--light-color', '#f8f9fa');
        document.documentElement.style.setProperty('--dark-color', '#343a40');
        document.documentElement.style.setProperty('--border-color', '#dee2e6');
        document.documentElement.style.setProperty('background-color', '#f6f6f6');
        document.documentElement.style.setProperty('color', '#333');
    } else {
        // 简约风格
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
        // if (kpmValueElement) {
        //     kpmValueElement.textContent = '加载中...';
        // }
        if (totalPressesElement) {
            totalPressesElement.textContent = '加载中...';
        }

        // 保存当前时间范围选择
        currentTimeFilter = timeRange;

        try {
            // 从后端获取统计数据
            const stats = await invoke('get_key_stats', { timeRange: currentTimeFilter });
            console.log('获取到后端数据:', stats);

            // 使用实际数据更新UI
            updateStatsCards(stats);
            updateCharts(stats);

            // 更新KPM显示
            if (kpmValueElement) {
                kpmValueElement.textContent = stats.kpm.toFixed(1);
            }
        } catch (error) {
            console.error('从后端获取数据失败:', error);

            // 显示错误信息
            if (kpmValueElement) {
                kpmValueElement.textContent = '加载失败';
            }
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
        console.error('更新数据失败:', error);
    }
}

// 更新统计卡片
function updateStatsCards(stats) {
    try {
        // 获取所有统计值和趋势元素
        const statValues = document.querySelectorAll('.stat-value');
        const statTrends = document.querySelectorAll('.stat-trend');

        if (!statValues.length || !statTrends.length) return;

        // 更新总按键次数
        statValues[0].textContent = stats.total_presses.toLocaleString();

        // 总按键较上一周期的变化
        if (currentTimeFilter !== 'all' && stats.prev_total_presses > 0) {
            const totalChangePercent = ((stats.total_presses - stats.prev_total_presses) / stats.prev_total_presses * 100).toFixed(1);
            if (totalChangePercent > 0) {
                statTrends[0].textContent = `+${totalChangePercent}% 较上个周期`;
                statTrends[0].className = 'stat-trend positive';
            } else if (totalChangePercent < 0) {
                statTrends[0].textContent = `${totalChangePercent}% 较上个周期`;
                statTrends[0].className = 'stat-trend negative';
            } else {
                statTrends[0].textContent = `持平 较上个周期`;
                statTrends[0].className = 'stat-trend';
            }
        } else {
            statTrends[0].textContent = '无前一周期数据';
            statTrends[0].className = 'stat-trend';
        }

        // 更新平均KPM（使用avg_kpm字段）
        statValues[1].textContent = stats.avg_kpm.toFixed(1);

        // 平均KPM较上一周期的变化
        if (currentTimeFilter !== 'all' && stats.prev_avg_kpm > 0) {
            const kpmChangePercent = ((stats.avg_kpm - stats.prev_avg_kpm) / stats.prev_avg_kpm * 100).toFixed(1);
            if (kpmChangePercent > 0) {
                statTrends[1].textContent = `+${kpmChangePercent}% 较上个周期`;
                statTrends[1].className = 'stat-trend positive';
            } else if (kpmChangePercent < 0) {
                statTrends[1].textContent = `${kpmChangePercent}% 较上个周期`;
                statTrends[1].className = 'stat-trend negative';
            } else {
                statTrends[1].textContent = `持平 较上个周期`;
                statTrends[1].className = 'stat-trend';
            }
        } else {
            statTrends[1].textContent = '无前一周期数据';
            statTrends[1].className = 'stat-trend';
        }

        // 更新退格率
        statValues[2].textContent = stats.backspace_ratio.toFixed(1) + '%';

        // 退格率较上一周期的变化
        if (currentTimeFilter !== 'all' && stats.prev_backspace_ratio > 0) {
            const backspaceChangePercent = ((stats.backspace_ratio - stats.prev_backspace_ratio) / stats.prev_backspace_ratio * 100).toFixed(1);
            if (backspaceChangePercent > 0) {
                statTrends[2].textContent = `+${backspaceChangePercent}% 较上个周期`;
                statTrends[2].className = 'stat-trend negative'; // 退格率上升通常是负面的
            } else if (backspaceChangePercent < 0) {
                statTrends[2].textContent = `${backspaceChangePercent}% 较上个周期`;
                statTrends[2].className = 'stat-trend positive'; // 退格率下降通常是正面的
            } else {
                statTrends[2].textContent = `持平 较上个周期`;
                statTrends[2].className = 'stat-trend';
            }
        } else {
            statTrends[2].textContent = '删除键占总按键比例';
            statTrends[2].className = 'stat-trend';
        }

        // 更新活跃应用数量
        statValues[3].textContent = Object.keys(stats.app_usage).length;
        statTrends[3].textContent = `${Object.keys(stats.app_usage).length} 个应用`;
    } catch (error) {
        console.error('更新统计卡片失败:', error);
    }
}

// 更新图表
function updateCharts(stats) {
    try {
        // KPM趋势图
        updateKpmTrendChart(stats);

        // 键盘类型分布
        updateKeyTypeChart(stats);

        // 常用按键图表
        updateTopKeysChart(stats);

        // 应用使用统计 - 恢复应用按键数量排行图表的更新
        updateAppKeysChart(stats);

        // 活动热力图
        updateActivityHeatmap(stats);

        // 常用组合键图表
        updateKeyComboChart(stats);

        // 每日活动图表
        updateDailyActivityChart(stats);

        // 周活动分布图表
        updateWeeklyDistributionChart(stats);

        // 应用使用时间分布图表
        updateAppTimeChart(stats);

        console.log('所有图表更新完成');
    } catch (error) {
        console.error('更新图表时出错:', error);
    }
}

// 更新按键类型分布图表
function updateKeyTypeChart(stats) {
    const chartElement = document.getElementById('key-type-chart');
    if (!chartElement) return;

    chartElement.innerHTML = '';

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
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 准备数据
    const mostUsedKeys = stats.most_used_keys || [];
    const keys = mostUsedKeys.map(item => item[0]);
    const counts = mostUsedKeys.map(item => item[1]);

    // 如果没有数据，显示提示信息
    if (keys.length === 0) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无按键数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 使用多彩色调 - 不同色相的鲜艳颜色
    const colors = [
        '#4CAF50', // 绿色
        '#2196F3', // 蓝色
        '#F44336', // 红色
        '#FF9800', // 橙色
        '#9C27B0', // 紫色
        '#00BCD4', // 青色
        '#FFEB3B', // 黄色
        '#795548', // 棕色
        '#607D8B', // 蓝灰色
        '#E91E63' // 粉红色
    ];

    // 创建图表 - 使用紧凑布局的水平条形图
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [{
                label: '使用次数',
                data: counts,
                backgroundColor: colors,
                borderWidth: 0, // 移除边框使外观更简约
                borderRadius: 4, // 圆角边框增加现代感
                maxBarThickness: 18 // 限制条形图的最大厚度，使其更紧凑
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // 水平条形图
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 5,
                    bottom: 5
                }
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 12
                    },
                    callbacks: {
                        label: function(context) {
                            return `使用次数: ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        font: {
                            size: 11 // 稍小的字体
                        }
                    }
                },
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)', // 更淡的网格线
                    },
                    ticks: {
                        font: {
                            size: 10 // 小字体
                        }
                    }
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
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 设置图表容器固定高度
    chartElement.style.height = '300px';
    chartElement.style.maxHeight = '300px';
    chartElement.style.overflow = 'hidden';

    // 准备数据
    let appTimeData = [];
    let hasValidData = false;

    // 从后端的app_time_distribution获取数据
    if (stats.app_time_distribution && stats.app_time_distribution.length > 0) {
        // 使用后端直接提供的数据
        appTimeData = stats.app_time_distribution;
        hasValidData = true;
    }
    // 如果后端没有提供时间分布数据，则使用应用使用量数据创建模拟的时间分布
    else if (stats.app_usage && Object.keys(stats.app_usage).length > 0) {
        // 获取前5个最常用的应用
        const topApps = Object.entries(stats.app_usage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (topApps.length > 0) {
            console.log('使用应用使用量数据创建模拟的时间分布', topApps);

            // 创建每个应用在24小时内的分布数据
            appTimeData = topApps.map(([app, count]) => {
                // 为每个应用创建24小时的分布数据
                const hourData = Array.from({ length: 24 }, (_, hour) => {
                    // 工作时间(9-18)使用量更高
                    const isWorkHour = hour >= 9 && hour <= 18;
                    const baseValue = Math.max(1, count / 24); // 确保至少有1，避免为0
                    const multiplier = isWorkHour ? 1.5 : 0.5;
                    // 添加一些随机波动
                    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2
                    return Math.round(baseValue * multiplier * randomFactor);
                });

                return {
                    label: app,
                    data: hourData
                };
            });

            hasValidData = true;
        }
    }

    // 如果没有数据，显示提示信息
    if (!hasValidData) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无应用使用时间分布数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 生成小时标签
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    // 为每个应用生成不同的颜色
    const colors = [
        'rgba(54, 162, 235, 0.8)', // 蓝色
        'rgba(255, 99, 132, 0.8)', // 红色
        'rgba(75, 192, 192, 0.8)', // 绿色
        'rgba(255, 159, 64, 0.8)', // 橙色
        'rgba(153, 102, 255, 0.8)', // 紫色
        'rgba(255, 205, 86, 0.8)', // 黄色
        'rgba(201, 203, 207, 0.8)' // 灰色
    ];

    // 准备数据集
    const datasets = appTimeData.map((app, index) => ({
        label: app.label,
        data: app.data,
        backgroundColor: colors[index % colors.length],
        borderColor: colors[index % colors.length].replace('0.8', '1'),
        borderWidth: 1,
        borderRadius: 4,
        categoryPercentage: 0.7,
        barPercentage: 0.8
    }));

    console.log('应用时间分布数据集:', datasets);

    // 创建图表
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: hours,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        title: function(context) {
                            return `时间: ${context[0].label}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 8,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
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

    // 生成最近24小时的活动数据
    const labels = [];
    const data = [];

    // 使用实际时间分布数据
    const timeDistribution = stats.time_distribution || {};
    const hours = Object.keys(timeDistribution).sort();

    // 如果有数据，使用实际数据的小时
    if (hours.length > 0) {
        for (const hour of hours) {
            const hourInt = parseInt(hour);
            if (!isNaN(hourInt)) {
                labels.push(`${hour}:00`);
                data.push(timeDistribution[hour]);
            }
        }
    } else {
        // 如果没有数据，显示空图表
        for (let i = 0; i < 24; i++) {
            const hour = i.toString().padStart(2, '0');
            labels.push(`${hour}:00`);
            data.push(0);
        }
    }

    // 创建图表
    new Chart(newCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '实时KPM趋势',
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
                        maxTicksLimit: Math.min(labels.length, 12),
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

    // 获取热力图数据
    const heatmapData = stats.activity_heatmap || {};
    const heatmapType = heatmapData.type || 2; // 默认为周热力图

    // 创建热力图容器
    const heatmapWrapper = document.createElement('div');
    heatmapWrapper.className = 'heatmap-wrapper';
    heatmapWrapper.style.display = 'flex';
    heatmapWrapper.style.flexDirection = 'column';
    heatmapWrapper.style.width = '100%';
    heatmapWrapper.style.height = '100%';
    chartElement.appendChild(heatmapWrapper);

    // 根据热力图类型设置显示样式
    switch (parseInt(heatmapType)) {
        case 1: // 今日热力图（按小时）
            createTodayHeatmap(heatmapWrapper, heatmapData);
            break;
        case 2: // 周热力图（按星期和小时）
            createWeekHeatmap(heatmapWrapper, heatmapData);
            break;
        case 3: // 月热力图（按日期和小时）
            createMonthHeatmap(heatmapWrapper, heatmapData);
            break;
        case 4: // 全部时间热力图（按星期和小时）
            createAllTimeHeatmap(heatmapWrapper, heatmapData);
            break;
        default:
            createWeekHeatmap(heatmapWrapper, heatmapData); // 默认使用周热力图样式
    }

}

// 创建今日热力图（按小时）
function createTodayHeatmap(container, heatmapData) {
    // 创建小时刻度行
    const hourRow = document.createElement('div');
    hourRow.className = 'heatmap-hour-labels';
    hourRow.style.display = 'flex';
    hourRow.style.marginBottom = '5px';
    hourRow.style.fontSize = '10px';
    hourRow.style.paddingLeft = '10px';
    container.appendChild(hourRow);

    // 添加小时标签 - 每3小时一个刻度
    for (let hour = 1; hour < 24; hour += 3) {
        const hourLabel = document.createElement('div');
        hourLabel.textContent = `${hour}:00`;
        // 需要span占据3小时的宽度
        hourLabel.style.flex = '3';
        hourLabel.style.textAlign = 'center';
        hourRow.appendChild(hourLabel);
    }

    // 创建热力图条
    const heatBar = document.createElement('div');
    heatBar.className = 'heatmap-bar';
    heatBar.style.display = 'flex';
    heatBar.style.height = '35px'; // 加大高度
    heatBar.style.marginTop = '10px';
    heatBar.style.marginBottom = '20px';
    container.appendChild(heatBar);

    // 找出最大值用于计算颜色强度
    let maxValue = 0;
    Object.entries(heatmapData).forEach(([key, value]) => {
        if (key.startsWith('h_') && value > maxValue) {
            maxValue = value;
        }
    });

    // 确保maxValue不为0，避免除以零
    maxValue = maxValue || 1;

    // 为每个小时创建一个单元格
    for (let hour = 0; hour < 24; hour++) {
        const hourKey = `h_${hour.toString().padStart(2, '0')}`;
        const value = heatmapData[hourKey] || 0;

        // 计算颜色强度 (0.1-0.9)
        const intensity = value > 0 ? Math.min(0.9, Math.max(0.1, value / maxValue)) : 0.05;

        // 创建一个单元格
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.style.flex = '1';
        cell.style.margin = '0 1px';
        cell.style.backgroundColor = `rgba(40, 167, 69, ${intensity})`; // 使用绿色渐变
        cell.style.borderRadius = '2px';
        cell.title = `${hour}:00 - 活跃度: ${value}`;

        heatBar.appendChild(cell);
    }
}

// 创建周热力图（按星期和小时）
function createWeekHeatmap(container, heatmapData) {
    // 添加标题行
    const headerRow = document.createElement('div');
    headerRow.className = 'heatmap-header';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-around';
    headerRow.style.marginBottom = '10px';
    headerRow.style.fontSize = '10px';
    headerRow.style.paddingLeft = '50px'; // 为左侧的日期标签留出空间
    container.appendChild(headerRow);

    // 添加小时标签 - 确保对齐
    for (let hour = 1; hour < 24; hour += 3) {
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
    container.appendChild(mainContent);

    // 添加日期列 - 从周一开始
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
    heatmapGrid.style.height = '100%'; // 确保网格占满容器高度
    mainContent.appendChild(heatmapGrid);

    // 找出最大值用于计算颜色强度
    let maxValue = 0;
    Object.entries(heatmapData).forEach(([key, value]) => {
        if (key.startsWith('d') && !isNaN(parseInt(key.charAt(1))) && value > maxValue) {
            maxValue = value;
        }
    });

    // 确保maxValue不为0，避免除以零
    maxValue = maxValue || 1;

    // SQL的%w从周日0开始，我们转换为从周一1开始
    // 映射: SQL的0(周日)->我们的6, SQL的1(周一)->我们的0, SQL的2(周二)->我们的1, ...
    const sqlToDayMap = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

    // 创建7行，从周一到周日
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayRow = document.createElement('div');
        dayRow.className = 'heatmap-row';
        dayRow.style.display = 'flex';
        dayRow.style.flex = '1';
        dayRow.style.margin = '1px 0';
        dayRow.style.minHeight = '25px'; // 设置最小高度
        heatmapGrid.appendChild(dayRow);

        // 将我们的dayIndex映射回SQL的日期索引
        // 映射: 0(周一)->SQL的1, 1(周二)->SQL的2, ..., 6(周日)->SQL的0
        const sqlDayIndex = dayIndex === 6 ? 0 : dayIndex + 1;

        // 为每个小时创建一个单元格
        for (let hour = 0; hour < 24; hour++) {
            const hourKey = hour.toString().padStart(2, '0');
            const key = `d${sqlDayIndex}_h${hourKey}`;

            // 获取活动值
            const value = heatmapData[key] || 0;

            // 计算颜色强度 (0.1-0.9)
            const intensity = value > 0 ? Math.min(0.9, Math.max(0.1, value / maxValue)) : 0.05;

            // 创建一个单元格
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.flex = '1';
            cell.style.margin = '0 1px';
            cell.style.backgroundColor = `rgba(40, 167, 69, ${intensity})`; // 使用绿色渐变
            cell.style.borderRadius = '2px';
            cell.title = `${dayLabels[dayIndex]} ${hour}:00 - 活跃度: ${value}`;

            dayRow.appendChild(cell);
        }
    }
}

// 创建月热力图（按日期和小时分布）
function createMonthHeatmap(container, heatmapData) {
    // 获取当前月份的天数
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // 设置容器最小高度，确保足够的显示空间
    container.style.minHeight = '500px';

    // 创建日期标签行
    const daysRow = document.createElement('div');
    daysRow.style.display = 'flex';
    daysRow.style.marginBottom = '15px';
    daysRow.style.marginTop = '10px';
    container.appendChild(daysRow);

    // 添加空白单元格（为小时标签留出位置）
    const emptyCell = document.createElement('div');
    emptyCell.style.width = '50px';
    daysRow.appendChild(emptyCell);

    // 添加日期标签
    const dayLabelsContainer = document.createElement('div');
    dayLabelsContainer.style.display = 'flex';
    dayLabelsContainer.style.flex = '1';
    dayLabelsContainer.style.overflowX = 'auto';
    dayLabelsContainer.style.paddingBottom = '5px';
    daysRow.appendChild(dayLabelsContainer);

    // 添加日期单元格
    for (let i = 1; i <= daysInMonth; i++) {
        const dayLabel = document.createElement('div');
        dayLabel.textContent = i;
        dayLabel.style.flex = '1';
        dayLabel.style.minWidth = '20px';
        dayLabel.style.textAlign = 'center';
        dayLabel.style.fontSize = '10px';
        dayLabelsContainer.appendChild(dayLabel);
    }

    // 主内容区域
    const gridContainer = document.createElement('div');
    gridContainer.style.display = 'flex';
    gridContainer.style.flex = '1';
    gridContainer.style.minHeight = '450px';
    container.appendChild(gridContainer);

    // 小时标签列
    const hoursColumn = document.createElement('div');
    hoursColumn.style.display = 'flex';
    hoursColumn.style.flexDirection = 'column';
    hoursColumn.style.width = '50px';
    gridContainer.appendChild(hoursColumn);

    // 每小时显示一个标签（而不是每2小时）
    for (let hour = 0; hour < 24; hour++) {
        const hourLabel = document.createElement('div');
        hourLabel.textContent = `${hour}:00`;
        hourLabel.style.flex = '1';
        hourLabel.style.textAlign = 'right';
        hourLabel.style.paddingRight = '10px';
        hourLabel.style.fontSize = '9px'; // 字体稍微缩小，因为标签更多了
        hourLabel.style.display = 'flex';
        hourLabel.style.alignItems = 'center';
        hourLabel.style.justifyContent = 'flex-end';
        hoursColumn.appendChild(hourLabel);
    }

    // 热力图网格
    const gridWrapper = document.createElement('div');
    gridWrapper.style.flex = '1';
    gridWrapper.style.overflowX = 'auto';
    gridWrapper.style.height = '100%'; // 确保网格高度填满
    gridContainer.appendChild(gridWrapper);

    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.height = '100%';
    grid.style.minHeight = '450px'; // 确保最小高度
    gridWrapper.appendChild(grid);

    // 找出最大值用于计算颜色强度
    let maxValue = 0;
    Object.entries(heatmapData).forEach(([key, value]) => {
        if (key.startsWith('d') && !isNaN(parseInt(key.charAt(1))) && value > maxValue) {
            maxValue = value;
        }
    });

    // 确保maxValue不为0，避免除以零
    maxValue = maxValue || 1;

    // 为每小时创建一行（而不是每2小时）
    for (let hour = 0; hour < 24; hour++) {
        const hourRow = document.createElement('div');
        hourRow.style.display = 'flex';
        hourRow.style.flex = '1';
        hourRow.style.minHeight = '16px'; // 减小行高以适应更多行
        grid.appendChild(hourRow);

        // 为每一天创建一个单元格
        for (let day = 1; day <= daysInMonth; day++) {
            const dayPadded = day.toString().padStart(2, '0');
            const hourPadded = hour.toString().padStart(2, '0');

            // 修正键名格式，确保与后端返回的格式一致
            const key = `d${dayPadded}_h${hourPadded}`;

            // 获取活动值，如果没有数据则为0
            let value = 0;
            for (const [dataKey, dataValue] of Object.entries(heatmapData)) {
                // 忽略type键
                if (dataKey === 'type') continue;

                // 检查键名是否匹配日期和小时
                if (dataKey === key) {
                    value = dataValue;
                    break;
                }
            }

            // 计算颜色强度 (0.1-0.9)
            const intensity = value > 0 ? Math.min(0.9, Math.max(0.1, value / maxValue)) : 0.05;

            // 创建一个单元格
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.flex = '1';
            cell.style.minWidth = '20px';
            cell.style.margin = '1px';
            cell.style.backgroundColor = `rgba(40, 167, 69, ${intensity})`; // 使用绿色渐变
            cell.style.borderRadius = '2px';
            cell.title = `${day}日 ${hour}:00 - 活跃度: ${value}`;

            hourRow.appendChild(cell);
        }
    }
}

// 创建所有时间热力图（按星期和小时的汇总）
function createAllTimeHeatmap(container, heatmapData) {
    // 添加标题行
    const headerRow = document.createElement('div');
    headerRow.className = 'heatmap-header';
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-around';
    headerRow.style.marginBottom = '10px';
    headerRow.style.fontSize = '10px';
    headerRow.style.paddingLeft = '50px'; // 为左侧的日期标签留出空间
    container.appendChild(headerRow);

    // 添加小时标签
    for (let hour = 1; hour < 24; hour += 3) {
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
    container.appendChild(mainContent);

    // 添加日期列 - 从周一开始
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
    heatmapGrid.style.height = '100%'; // 确保网格占满容器高度
    mainContent.appendChild(heatmapGrid);

    // 找出最大值用于计算颜色强度
    let maxValue = 0;
    Object.entries(heatmapData).forEach(([key, value]) => {
        if (key.startsWith('d') && !isNaN(parseInt(key.charAt(1))) && value > maxValue) {
            maxValue = value;
        }
    });

    // 确保maxValue不为0，避免除以零
    maxValue = maxValue || 1;

    // SQL的%w从周日0开始，我们转换为从周一1开始
    // 映射: SQL的0(周日)->我们的6, SQL的1(周一)->我们的0, SQL的2(周二)->我们的1, ...
    const sqlToDayMap = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

    // 创建7行，从周一到周日
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const dayRow = document.createElement('div');
        dayRow.className = 'heatmap-row';
        dayRow.style.display = 'flex';
        dayRow.style.flex = '1';
        dayRow.style.margin = '1px 0';
        dayRow.style.minHeight = '25px'; // 设置最小高度
        heatmapGrid.appendChild(dayRow);

        // 将我们的dayIndex映射回SQL的日期索引
        // 映射: 0(周一)->SQL的1, 1(周二)->SQL的2, ..., 6(周日)->SQL的0
        const sqlDayIndex = dayIndex === 6 ? 0 : dayIndex + 1;

        // 为每个小时创建一个单元格
        for (let hour = 0; hour < 24; hour++) {
            const hourKey = hour.toString().padStart(2, '0');
            const key = `d${sqlDayIndex}_h${hourKey}`;

            // 获取活动值
            const value = heatmapData[key] || 0;

            // 计算颜色强度 (0.1-0.9)
            const intensity = value > 0 ? Math.min(0.9, Math.max(0.1, value / maxValue)) : 0.05;

            // 创建一个单元格
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.flex = '1';
            cell.style.margin = '0 1px';
            cell.style.backgroundColor = `rgba(40, 167, 69, ${intensity})`; // 使用绿色渐变
            cell.style.borderRadius = '2px';
            cell.title = `${dayLabels[dayIndex]} ${hour}:00 - 活跃度: ${value}`;

            dayRow.appendChild(cell);
        }
    }
}

// 初始化信息图标提示框
function initInfoIcons() {
    // 创建提示框元素
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);

    // 获取所有信息图标
    const infoIcons = document.querySelectorAll('.info-icon');

    infoIcons.forEach(icon => {
        // 鼠标悬停显示提示框
        icon.addEventListener('mouseenter', (e) => {
            const info = e.target.getAttribute('data-info');
            if (!info) return;

            tooltip.textContent = info;
            tooltip.classList.add('show');

            // 计算位置
            const rect = e.target.getBoundingClientRect();
            const tooltipHeight = tooltip.offsetHeight;
            const tooltipWidth = tooltip.offsetWidth;

            tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltipWidth / 2)}px`;
            tooltip.style.top = `${rect.bottom + 10}px`;
        });

        // 鼠标离开隐藏提示框
        icon.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });

        // 点击也显示提示
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const info = e.target.getAttribute('data-info');
            if (!info) return;

            // 如果已显示则隐藏，否则显示
            if (tooltip.classList.contains('show')) {
                tooltip.classList.remove('show');
            } else {
                tooltip.textContent = info;
                tooltip.classList.add('show');

                // 计算位置
                const rect = e.target.getBoundingClientRect();
                const tooltipHeight = tooltip.offsetHeight;
                const tooltipWidth = tooltip.offsetWidth;

                tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltipWidth / 2)}px`;
                tooltip.style.top = `${rect.bottom + 10}px`;
            }
        });
    });

    // 点击其他地方隐藏提示框
    document.addEventListener('click', () => {
        tooltip.classList.remove('show');
    });
}

// 加载数据
async function loadData() {
    try {
        // 设置初始KPM值，避免长时间显示"计算中..."
        const kpmValueElement = document.querySelector('.kpm-value');
        // if (kpmValueElement) {
        //     kpmValueElement.textContent = '加载中...';
        // }

        try {
            // 从后端获取统计数据
            console.log('正在从后端获取数据，当前时间范围:', currentTimeFilter);
            const stats = await invoke('get_key_stats', { timeRange: currentTimeFilter });
            console.log('获取到后端数据:', stats);

            // 使用实际数据更新UI
            updateStatsCards(stats);
            updateCharts(stats);

            // 更新KPM显示
            if (kpmValueElement) {
                kpmValueElement.textContent = stats.kpm.toFixed(1);
            }
        } catch (error) {
            console.error('从后端获取数据失败:', error);

            // 显示错误信息
            if (kpmValueElement) {
                kpmValueElement.textContent = '加载失败';
            }
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

// 设置自动刷新
function setupAutoRefresh() {
    // 每5秒更新一次KPM值
    setInterval(async() => {
        try {
            const kpmValueElement = document.querySelector('.kpm-value');
            if (!kpmValueElement || !isRecording) return;

            try {
                // 尝试从后端获取统计数据，只更新KPM值
                const kpm = await invoke('get_current_kpm');
                console.log("query kpm :", kpm);
                if (kpm) {
                    // 更新实时KPM值
                    kpmValueElement.textContent = Math.round(kpm);
                }
            } catch (error) {
                console.warn('自动刷新KPM失败:', error);
            }
        } catch (error) {
            console.error('自动刷新出错:', error);
        }
    }, 5000); // 5秒
}

// 更新常用组合键图表
function updateKeyComboChart(stats) {
    const chartElement = document.getElementById('key-combo-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 尝试从stats中获取组合键数据
    let keyCombos = [];
    let hasData = false;

    // 仅在stats中有key_combos数据时才显示数据
    if (stats.key_combos && stats.key_combos.length > 0) {
        keyCombos = stats.key_combos;
        hasData = true;
    }

    // 如果没有数据，显示提示信息
    if (!hasData || keyCombos.length === 0) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无组合键数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // console.log("key_combos:", stats.key_combos)
    // 准备图表数据
    const labels = keyCombos.map(item => item.combo);
    const data = keyCombos.map(item => item.count);

    // 多彩的配色方案
    const colors = [
        '#2196F3', // 蓝色
        '#FF9800', // 橙色
        '#4CAF50', // 绿色
        '#F44336', // 红色
        '#9C27B0', // 紫色
        '#00BCD4', // 青色
        '#FFEB3B', // 黄色
        '#795548', // 棕色
        '#9E9E9E', // 灰色
        '#607D8B' // 蓝灰色
    ];

    // 创建图表 - 更简约紧凑的水平条形图
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '使用次数',
                data: data,
                backgroundColor: colors,
                borderRadius: 4, // 圆角条形
                borderWidth: 0, // 无边框更简约
                maxBarThickness: 16 // 限制条形图厚度使布局更紧凑
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // 水平条形图
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 5,
                    bottom: 5
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)', // 更淡的网格线
                    },
                    ticks: {
                        font: {
                            size: 10 // 更小的字体
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        label: function(context) {
                            return `使用次数: ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });
}

// 更新每日活动图表
function updateDailyActivityChart(stats) {
    const chartElement = document.getElementById('daily-activity-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 设置图表容器固定高度
    chartElement.style.height = '300px';
    chartElement.style.maxHeight = '300px';
    chartElement.style.overflow = 'hidden';

    // 获取当前日期和过去30天的日期范围
    const getDates = () => {
        const dates = [];
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            dates.push(dateStr);
        }
        return dates;
    };

    // 准备数据
    const dates = getDates();

    // 从activity_heatmap数据中提取每日数据
    let dailyData = new Array(30).fill(0);
    let hasValidData = false;
    let activeDaysCount = 0;
    let activeDays = [];

    // 获取当前日期信息
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentDate = today.getDate();

    // 尝试从活动热力图中提取日期数据
    if (stats.activity_heatmap && Object.keys(stats.activity_heatmap).length > 0) {
        const heatmapData = stats.activity_heatmap;

        try {
            // 创建一个映射来存储每一天的总键击数
            const dayTotals = {};

            // 遍历热力图数据，累加每日的按键数量
            Object.entries(heatmapData).forEach(([key, value]) => {
                // 跳过type键
                if (key === 'type') return;

                // 检查是否是日期+小时的键值（如"d01_h12"表示1日12时）
                const match = key.match(/^d(\d{2})_h\d{2}$/);
                if (match) {
                    const day = parseInt(match[1]); // 获取日期部分
                    if (isNaN(day)) return;

                    // 初始化当天的计数器
                    if (!dayTotals[day]) {
                        dayTotals[day] = 0;
                    }

                    // 累加当天的按键数量
                    dayTotals[day] += value;
                }
            });

            console.log('每日总数据:', dayTotals);

            // 处理每天的总数据
            Object.entries(dayTotals).forEach(([day, total]) => {
                const dayNum = parseInt(day);
                if (isNaN(dayNum)) return;

                // 创建日期对象（假设当前月份）
                let keyDate = new Date(currentYear, currentMonth, dayNum);

                // 如果日期大于当前日期，可能是上个月的数据
                if (dayNum > currentDate) {
                    keyDate = new Date(currentYear, currentMonth - 1, dayNum);
                }

                // 计算与今天的天数差
                const dayDiff = Math.floor((today - keyDate) / (1000 * 60 * 60 * 24));

                // 只处理过去30天内的数据
                if (dayDiff >= 0 && dayDiff < 30) {
                    const index = 29 - dayDiff;
                    dailyData[index] = total;
                    hasValidData = true;
                    activeDaysCount++;
                    activeDays.push(index); // 记录有活动的日期索引
                }
            });
        } catch (error) {
            console.error('处理热力图数据时出错:', error);
        }
    }

    console.log('每日活动数据:', dailyData);
    console.log('活跃天数:', activeDaysCount, '活跃日期索引:', activeDays);

    // 添加说明文本，如果刚开始使用
    if (hasValidData && activeDaysCount <= 3) {
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'chart-explanation';
        explanationDiv.textContent = `显示过去30天中${activeDaysCount}天的使用数据。随着使用时间增加，图表将更加完整。`;
        explanationDiv.style.padding = '10px';
        explanationDiv.style.fontSize = '12px';
        explanationDiv.style.color = '#666';
        explanationDiv.style.textAlign = 'center';
        chartElement.appendChild(explanationDiv);
    }

    // 如果没有有效数据，显示提示信息
    if (!hasValidData) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无历史使用数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 创建渐变颜色
    const getGradient = (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(75, 192, 192, 0.6)');
        gradient.addColorStop(1, 'rgba(75, 192, 192, 0.1)');
        return gradient;
    };

    // 动态点大小
    const customPointRadius = (context) => {
        const index = context.dataIndex;
        // 检查该日期是否有活动
        if (dailyData[index] === 0) {
            return 0; // 没有活动的日期不显示点
        }
        return activeDays.includes(index) ? 4 : 0; // 只在有活动的日期显示点
    };

    // 创建图表
    new Chart(canvas, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: '日活动量',
                data: dailyData,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return null;
                    return getGradient(ctx);
                },
                borderWidth: 2,
                pointRadius: customPointRadius,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: 'rgba(75, 192, 192, 1)',
                pointBorderWidth: 1.5,
                tension: 0.4, // 平滑曲线
                fill: true
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
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        title: function(context) {
                            return `日期: ${context[0].label}`;
                        },
                        label: function(context) {
                            if (context.raw === 0) {
                                return '无活动记录';
                            }
                            return `按键数量: ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 10,
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// 更新周分布图表
function updateWeeklyDistributionChart(stats) {
    const chartElement = document.getElementById('weekly-distribution-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 设置图表容器固定高度
    chartElement.style.height = '300px';
    chartElement.style.maxHeight = '300px';
    chartElement.style.overflow = 'hidden';

    // 准备数据
    const daysOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let hasRealData = false;

    // 获取当前日期信息
    const today = new Date();
    const currentDay = today.getDay(); // 0是周日，6是周六
    const daysUsed = []; // 记录有使用数据的天

    // 创建一个新的数组来保存真实使用的天数
    let weeklyData = new Array(7).fill(0);
    let recentUsageDays = 0;

    // 从活动热力图数据中提取周分布数据
    if (stats.activity_heatmap && Object.keys(stats.activity_heatmap).length > 0) {
        const heatmapData = stats.activity_heatmap;

        // 获取热力图类型，2或4表示是按星期的热力图数据
        const heatmapType = heatmapData.type ? parseInt(heatmapData.type) : 0;

        if (heatmapType === 2 || heatmapType === 4) {
            // 直接从按星期分组的热力图数据中提取
            try {
                // 遍历热力图数据
                Object.entries(heatmapData).forEach(([key, value]) => {
                    if (key === 'type') return; // 跳过类型字段

                    // 匹配形如 d0_h12 的键（周日12时）
                    const match = key.match(/^d([0-6])_h\d{2}$/);
                    if (match) {
                        const dayOfWeek = parseInt(match[1]); // 获取星期几(0-6)
                        if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
                            weeklyData[dayOfWeek] += value;
                            if (!daysUsed.includes(dayOfWeek)) {
                                daysUsed.push(dayOfWeek);
                                recentUsageDays++;
                            }
                            hasRealData = true;
                        }
                    }
                });
            } catch (error) {
                console.error('处理按星期热力图数据时出错:', error);
            }
        } else {
            // 累计每天的按键数据
            try {
                // 提取近7天的数据
                for (let i = 0; i < 7; i++) {
                    // 计算过去i天的日期
                    const pastDate = new Date(today);
                    pastDate.setDate(today.getDate() - i);
                    const pastDay = pastDate.getDate(); // 日期
                    const pastMonth = pastDate.getMonth() + 1; // 月份(0-11)+1

                    // 检查这一天是否有数据
                    let dayTotal = 0;

                    // 统计当天所有小时的数据
                    for (let hour = 0; hour < 24; hour++) {
                        // 格式化成 d01_h12 形式的键
                        const dayKey = `d${String(pastDay).padStart(2, '0')}`;
                        const hourKey = `h${String(hour).padStart(2, '0')}`;
                        const key = `${dayKey}_${hourKey}`;

                        if (heatmapData[key]) {
                            dayTotal += heatmapData[key];
                        }
                    }

                    if (dayTotal > 0) {
                        // 这一天有数据
                        const weekDay = pastDate.getDay(); // 获取星期几(0-6)
                        weeklyData[weekDay] += dayTotal;
                        if (!daysUsed.includes(weekDay)) {
                            daysUsed.push(weekDay);
                            recentUsageDays++;
                        }
                        hasRealData = true;
                    }
                }
            } catch (error) {
                console.error('处理周分布数据时出错:', error);
            }
        }
    }

    console.log('周活动数据:', weeklyData);
    console.log('活跃天数:', recentUsageDays, '活跃日期:', daysUsed);

    // 如果只有少量数据，添加提示说明
    if (hasRealData && recentUsageDays <= 2) {
        // 添加解释文本
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'chart-explanation';
        explanationDiv.textContent = `仅显示近期${recentUsageDays}天的使用数据。随着使用时间增加，图表将更加完整。`;
        explanationDiv.style.padding = '10px';
        explanationDiv.style.fontSize = '12px';
        explanationDiv.style.color = '#666';
        explanationDiv.style.textAlign = 'center';
        chartElement.appendChild(explanationDiv);
    }

    // 如果没有数据，显示提示信息
    if (!hasRealData) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无周使用数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 多彩配色方案 - 突出当前日期和有数据的天
    const colors = new Array(7).fill('rgba(200, 200, 200, 0.3)'); // 默认淡灰色

    // 突出显示有数据的天
    daysUsed.forEach(day => {
        colors[day] = 'rgba(54, 162, 235, 0.8)'; // 有数据的天使用亮蓝色
    });

    // 当前天特别突出
    colors[currentDay] = 'rgba(255, 99, 132, 0.8)'; // 当前天使用红色

    // 创建图表 - 简约现代的柱状图
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: daysOfWeek,
            datasets: [{
                label: '按键活动',
                data: weeklyData,
                backgroundColor: colors,
                borderRadius: 6, // 圆角更明显
                borderWidth: 0,
                maxBarThickness: 50 // 控制条形的最大厚度
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 20, // 为说明文字留出空间
                    bottom: 10
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        title: function(context) {
                            const label = context[0].label;
                            // 判断是否为当前日期
                            const isToday = daysOfWeek[currentDay] === label;
                            return `${label}${isToday ? ' (今天)' : ''}`;
                        },
                        label: function(context) {
                            if (context.raw === 0) {
                                return '无使用记录';
                            }
                            return `按键数量: ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 11
                        },
                        callback: function(value, index) {
                            const label = daysOfWeek[index];
                            // 在当天的标签上添加标记
                            return index === currentDay ? `${label} ●` : label;
                        }
                    }
                }
            }
        }
    });
}

// 应用按键数量排行图表
function updateAppKeysChart(stats) {
    const chartElement = document.getElementById('app-keys-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 准备数据
    const appUsage = stats.app_usage || {};
    const apps = Object.keys(appUsage);

    // 按按键数量排序
    apps.sort((a, b) => appUsage[b] - appUsage[a]);

    // 取前10个应用
    const topApps = apps.slice(0, 10);
    const counts = topApps.map(app => appUsage[app]);

    // 如果没有数据，显示提示信息
    if (topApps.length === 0) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无应用数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 使用渐变色彩
    const colors = [
        '#4a6cf7', // 主色调
        '#5a76f8',
        '#6a80f9',
        '#7a8afa',
        '#8a94fb',
        '#9a9efc',
        '#aaa8fd',
        '#bab2fe',
        '#cabcff',
        '#dac6ff'
    ];

    // 创建图表 - 使用水平条形图
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: topApps,
            datasets: [{
                label: '按键次数',
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 4,
                maxBarThickness: 16 // 减小条形高度使其更紧凑
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // 水平条形图
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 0, // 减少上下间距
                    bottom: 0
                }
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleFont: {
                        size: 12
                    },
                    bodyFont: {
                        size: 12
                    },
                    callbacks: {
                        label: function(context) {
                            return `按键次数: ${context.raw.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        font: {
                            size: 10 // 减小字体大小
                        },
                        callback: function(value, index) {
                            const appName = this.getLabelForValue(value);
                            // 限制应用名长度，避免溢出
                            if (appName.length > 15) {
                                return appName.substring(0, 13) + '...';
                            }
                            return appName;
                        }
                    }
                },
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                    },
                    ticks: {
                        font: {
                            size: 10
                        },
                        // 减少刻度数量，使图表更紧凑
                        maxTicksLimit: 6
                    }
                },
            },
        },
    });
}

// 导出数据函数
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

        // 创建成功消息对话框，包含可点击的文件路径链接
        hideModal('export-modal');

        // 创建自定义成功对话框
        const successModal = document.createElement('div');
        successModal.id = 'export-success-modal';
        successModal.className = 'modal';
        successModal.style.display = 'flex';

        successModal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>导出成功</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <p>数据导出成功！</p>
                    <p>文件已保存到：</p>
                    <div style="margin: 15px 0; padding: 10px; background-color: #f8f9fa; border-radius: 4px; word-break: break-all;">
                        <a href="#" id="export-file-path" style="color: var(--primary-color); text-decoration: underline;">${result}</a>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="open-export-folder" class="primary-btn">打开文件夹</button>
                    <button id="close-success-modal" class="secondary-btn">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(successModal);

        // 添加事件监听
        const closeBtn = successModal.querySelector('.close-modal');
        const closeModalBtn = document.getElementById('close-success-modal');
        const openFolderBtn = document.getElementById('open-export-folder');
        const filePathLink = document.getElementById('export-file-path');

        // 关闭按钮事件
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(successModal);
        });

        closeModalBtn.addEventListener('click', () => {
            document.body.removeChild(successModal);
        });

        // 打开文件夹事件
        openFolderBtn.addEventListener('click', async() => {
            try {
                // 获取文件所在的文件夹路径
                const folderPath = result.substring(0, result.lastIndexOf('\\'));
                await invoke('open_folder', { path: folderPath });
                document.body.removeChild(successModal);
            } catch (error) {
                console.error('打开文件夹失败:', error);
                alert('无法打开文件夹，请确认应用权限');
            }
        });

        // 文件路径链接点击事件
        filePathLink.addEventListener('click', async(e) => {
            e.preventDefault();
            try {
                // 获取文件所在的文件夹路径
                const folderPath = result.substring(0, result.lastIndexOf('\\'));
                await invoke('open_folder', { path: folderPath });
                document.body.removeChild(successModal);
            } catch (error) {
                console.error('打开文件夹失败:', error);
                alert('无法打开文件夹，请确认应用权限');
            }
        });
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

// 删除数据函数
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

// 加载健康配置
async function loadHealthProfile() {
    try {
        const profileJson = await invoke('get_health_profile');
        if (profileJson) {
            const profile = JSON.parse(profileJson);

            // 填充表单
            const occupationSelect = document.getElementById('occupation');
            const dailyHoursSelect = document.getElementById('daily-hours');
            const hasBreaksCheckbox = document.getElementById('has-breaks');
            const hasSupportCheckbox = document.getElementById('has-support');

            if (occupationSelect && profile.occupation) {
                occupationSelect.value = profile.occupation;
            }

            if (dailyHoursSelect && profile.daily_hours) {
                dailyHoursSelect.value = profile.daily_hours;
            }

            if (hasBreaksCheckbox && profile.has_breaks !== undefined) {
                hasBreaksCheckbox.checked = profile.has_breaks;
            }

            if (hasSupportCheckbox && profile.has_support !== undefined) {
                hasSupportCheckbox.checked = profile.has_support;
            }
        }
    } catch (error) {
        console.error('加载健康配置失败:', error);
    }
}

// 初始化弹窗位置设置
async function initPopupPositionSetting() {
    // 获取拖拽元素和信息显示元素
    const dragHandle = document.getElementById('popup-preview-handle');
    const positionInfo = document.getElementById('popup-position-info');
    const resetButton = document.getElementById('reset-popup-position');
    const previewContainer = document.querySelector('.popup-preview-container');
    const previewArea = document.getElementById('popup-preview-area');
    const monitorSelect = document.getElementById('monitor-select');
    const previewSizeInfo = document.getElementById('preview-size-info');

    if (!dragHandle || !positionInfo || !resetButton || !previewArea) return;

    // 存储所有显示器信息
    let monitors = [];
    let selectedMonitor = null;

    // 获取并填充显示器列表
    try {
        const monitorsJson = await invoke('get_all_monitors');
        monitors = JSON.parse(monitorsJson);
        // console.log('获取到的显示器信息:', monitors);

        // 清空并填充显示器下拉列表
        if (monitorSelect) {
            monitorSelect.innerHTML = '';

            // 添加"主显示器"选项
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '主显示器 (自动选择)';
            monitorSelect.appendChild(defaultOption);

            // 添加所有显示器
            monitors.forEach(monitor => {
                const option = document.createElement('option');
                option.value = monitor.id;
                option.textContent = `${monitor.name} (${monitor.width}×${monitor.height})`;
                if (monitor.is_primary) {
                    option.textContent += ' - 主显示器';
                }
                monitorSelect.appendChild(option);
            });
        }

    } catch (error) {
        console.error('获取显示器信息失败:', error);
    }

    // 获取当前保存的位置
    try {
        const positionJson = await invoke('get_popup_position');
        const position = JSON.parse(positionJson);
        // 设置显示器选择
        if (monitorSelect) {
            // 如果选择了特定显示器，更新当前显示器信息
            selectedMonitor = position.monitor_id ?
                monitors.find(m => m.id === position.monitor_id) :
                monitors.find(m => m.is_primary) || monitors[0];
            if (selectedMonitor) {
                monitorSelect.value = selectedMonitor.id;
                adjustPreviewAreaRatio(previewContainer, selectedMonitor);
            }
        }
        // 初始化拖拽手柄位置
        // console.log(selectedMonitor)
        updatePreviewPosition(dragHandle, position.x, position.y, previewContainer, selectedMonitor);
        // 更新位置信息显示
        updatePositionInfo(positionInfo, position.x, position.y);
    } catch (error) {
        console.error('获取弹窗位置失败:', error);
        // 使用默认位置
        selectedMonitor = monitors.find(m => m.is_primary) || monitors[0];
        const height = selectedMonitor.height * 0.80;
        updatePreviewPosition(dragHandle, 80, height, previewContainer, selectedMonitor);
        updatePositionInfo(positionInfo, 80, height);
    }

    // 实现拖拽功能
    implementDragging(dragHandle, positionInfo, previewContainer, monitorSelect, monitors);

    // 监听显示器选择变化
    if (monitorSelect) {
        monitorSelect.addEventListener('change', async() => {
            // 获取选中的显示器信息
            const selectedId = monitorSelect.value;
            selectedMonitor = selectedId ?
                monitors.find(m => m.id === selectedId) :
                monitors.find(m => m.is_primary) || monitors[0];

            if (selectedMonitor) {
                // 调整预览区域比例
                adjustPreviewAreaRatio(previewContainer, selectedMonitor);

                // 获取当前位置
                const style = window.getComputedStyle(dragHandle);
                const x = parseInt(style.left);
                const y = parseInt(style.top);
                const realPos = calculateRealLocation(x, y, previewContainer, selectedMonitor);
                // console.log(`修改显示器${realPos.realX}-${realPos.realY}`);

                // 保存新的显示器设置和位置
                try {
                    await invoke('set_popup_position', {
                        x: realPos.realX,
                        y: realPos.realY,
                        monitorId: selectedMonitor.id
                    });

                    console.log(`已更新弹窗位置到显示器: ${monitorSelect.value || '主显示器'}`);
                } catch (error) {
                    console.error('保存弹窗位置失败:', error);
                    alert('保存显示器设置失败: ' + error);
                }
            }
        });
    }

    // 重置按钮功能
    resetButton.addEventListener('click', async() => {

        // 重置显示器选择
        let primaryMonitor = monitors.find(m => m.is_primary) || monitors[0];
        if (monitorSelect) {
            // 调整预览区域比例为主显示器
            primaryMonitor = monitors.find(m => m.id === monitorSelect.value) || primaryMonitor;
            if (primaryMonitor) {
                adjustPreviewAreaRatio(previewContainer, primaryMonitor);
            }
        }
        const defaultX = 80;
        const defaultY = primaryMonitor.height * 0.80;

        // 更新预览
        updatePreviewPosition(dragHandle, defaultX, defaultY, previewContainer, primaryMonitor);
        updatePositionInfo(positionInfo, defaultX, defaultY);

        // 保存到后端
        try {
            await invoke('set_popup_position', {
                x: defaultX,
                y: defaultY,
                monitorId: primaryMonitor.id
            });
            console.log('重置弹窗位置成功');
        } catch (error) {
            console.error('重置弹窗位置失败:', error);
            alert('重置位置失败，请重试');
        }
    });

    // 添加窗口大小变化监听器来自适应调整预览容器大小
    window.addEventListener('resize', () => {
        if (selectedMonitor && previewContainer) {
            // 保存当前拖拽手柄的相对位置（相对于容器的百分比）
            const style = window.getComputedStyle(dragHandle);
            const currentX = parseInt(style.left);
            const currentY = parseInt(style.top);
            const containerWidth = previewContainer.offsetWidth;
            const containerHeight = previewContainer.offsetHeight;
            console.log(`resize当前拖拽手柄: ${currentX}, ${currentY}, ${containerWidth}, ${containerHeight}`);

            // 计算相对位置（百分比）
            const relativeX = currentX / containerWidth;
            const relativeY = currentY / containerHeight;

            // 设置forceRecalculate为true，强制重新计算容器宽度
            const newDimensions = adjustPreviewAreaRatio(previewContainer, selectedMonitor, true);

            // 根据新尺寸和相对位置，重新计算拖拽手柄的绝对位置
            if (newDimensions) {
                const newX = Math.round(relativeX * newDimensions.width);
                const newY = Math.round(relativeY * newDimensions.height);
                console.log(`resize新拖拽手柄: ${newX}, ${newY}, ${newDimensions.width}, ${newDimensions.height}`);

                // 更新拖拽手柄位置
                dragHandle.style.left = `${newX}px`;
                dragHandle.style.top = `${newY}px`;
                updatePositionInfo(positionInfo, newX, newY);
            }
        }
    });
}

// 更新预览位置
function updatePreviewPosition(element, x, y, container, monitor) {
    if (!element || !container || !monitor) return;
    const relPos = calculateRelativeLocation(x, y, container, monitor);
    // 更新位置
    element.style.left = `${relPos.x}px`;
    element.style.top = `${relPos.y}px`;
    element.style.bottom = 'auto'; // 清除底部定位
}

// 更新位置信息显示
function updatePositionInfo(element, x, y) {
    if (element) {
        element.textContent = `位置: X=${x}, Y=${y}`;
    }
}

// 实现拖拽功能
function implementDragging(element, infoElement, container, monitorSelect, monitors) {
    let isDragging = false;
    let offsetX, offsetY;

    // 获取鼠标按下时的初始位置
    element.addEventListener('mousedown', (e) => {
        isDragging = true;
        element.classList.add('dragging');

        // 计算鼠标与元素边缘的偏移量
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        // 防止文本选择等默认行为干扰拖动
        e.preventDefault();
    });

    // 鼠标移动时更新位置
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        // 计算相对于容器的位置
        let newX = e.clientX - containerRect.left - offsetX;
        let newY = e.clientY - containerRect.top - offsetY;

        // 防止拖出边界
        const maxX = containerRect.width - elementRect.width;
        const maxY = containerRect.height - elementRect.height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        // console.log(newX, newY);
        // 更新预览位置
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        element.style.bottom = 'auto'; // 清除底部定位
        const selectedMonitor = monitors.find(m => m.id === monitorSelect.value) || monitors[0];
        const realPos = calculateRealLocation(newX, newY, container, selectedMonitor);
        // console.log(realPos);

        // 更新位置信息显示
        updatePositionInfo(infoElement, realPos.realX, realPos.realY);
    });

    // 鼠标释放时保存位置
    document.addEventListener('mouseup', async() => {
        if (!isDragging) return;

        isDragging = false;
        element.classList.remove('dragging');

        // 获取最终位置
        const style = window.getComputedStyle(element);
        const x = parseInt(style.left);
        const y = parseInt(style.top);
        const selectedMonitor = monitors.find(m => m.id === monitorSelect.value) || monitors[0];
        const realPos = calculateRealLocation(x, y, container, selectedMonitor);
        console.log(`${x}-${y}-${realPos}`);

        // 保存位置到后端
        try {
            await invoke('set_popup_position', {
                x: realPos.realX,
                y: realPos.realY,
                monitorId: selectedMonitor.id
            });
        } catch (error) {
            console.error('保存弹窗位置失败:', error);
            alert(`保存弹窗位置失败: ${error}`);
        }
    });

    // 鼠标离开窗口时也结束拖拽
    document.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('dragging');
        }
    });
}

function calculateRealLocation(x, y, container, monitor) {
    // 添加参数验证
    if (!container || !monitor) {
        console.error('容器或显示器未定义');
        return { realX: 80, realY: 600 }; // 返回默认值
    }

    // 确保有效参数
    const validX = Number.isFinite(x) ? x : 0;
    const validY = Number.isFinite(y) ? y : 0;
    const monitorWidth = monitor.width || 1920;
    const monitorHeight = monitor.height || 1080;

    // 根据x，y的相对popup-preview-container高度宽度百分比以及monitor的宽高计算实际的x,y坐标
    const height = container.offsetHeight || 1;
    const width = container.offsetWidth || 1;
    const realX = Math.round(validX * monitorWidth * 1.0 / width);
    const realY = Math.round(validY * monitorHeight * 1.0 / height);

    // console.log(`${realX}-${realY}`);
    return { realX, realY };
}

function calculateRelativeLocation(realX, realY, container, monitor) {
    // 根据真实坐标计算在popup-preview-container中的位置
    if (!container || !monitor) {
        console.error('容器或显示器未定义');
        return { x: 0, y: 0 };
    }

    // 确保有效数值
    const validRealX = Number.isFinite(realX) ? realX : 0;
    const validRealY = Number.isFinite(realY) ? realY : 0;
    const monitorWidth = monitor.width || 1920;
    const monitorHeight = monitor.height || 1080;

    // 获取容器的尺寸
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // 如果容器尺寸无效，使用宽度的80%（与CSS中设置一致）和监视器比例计算高度
    let width = containerWidth;
    let height = containerHeight;

    if (width <= 0 || height <= 0) {
        console.log('容器尺寸无效，使用计算值');
        // 获取settings-page或dashboard-page的宽度
        const settingsPage = document.getElementById('settings-page');
        const dashboardPage = document.getElementById('dashboard-page');
        let pageWidth = 0;

        if (settingsPage && settingsPage.offsetWidth > 0) {
            pageWidth = settingsPage.offsetWidth;
        } else if (dashboardPage && dashboardPage.offsetWidth > 0) {
            pageWidth = dashboardPage.offsetWidth;
        } else {
            // 使用窗口宽度的80%作为备选
            pageWidth = window.innerWidth * 0.8;
        }

        // 计算容器宽度（页面宽度的80%）
        width = pageWidth * 0.8;
        // 根据显示器宽高比计算高度
        const monitorRatio = monitorHeight / monitorWidth;
        height = width * monitorRatio;
    }

    // 计算相对位置
    const x = Math.round(validRealX * width / monitorWidth);
    const y = Math.round(validRealY * height / monitorHeight);

    // console.log(`计算相对位置: 真实坐标=(${validRealX}, ${validRealY}), 容器尺寸=${width}×${height}, 相对坐标=(${x}, ${y})`);

    return { x, y };
}

// 初始化主题设置
function initThemeSettings() {
    const themeButtons = document.querySelectorAll('.theme-btn');

    // 从localStorage获取主题设置，默认为simple
    const savedTheme = localStorage.getItem('app-theme') || 'simple';

    // 应用已保存的主题
    toggleTheme(savedTheme);

    // 更新按钮状态
    themeButtons.forEach(btn => {
        const btnTheme = btn.getAttribute('data-theme');
        if (btnTheme === savedTheme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 添加点击事件
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有按钮的active状态
            themeButtons.forEach(b => b.classList.remove('active'));
            // 添加当前按钮的active状态
            btn.classList.add('active');

            // 获取主题并应用
            const theme = btn.getAttribute('data-theme');
            toggleTheme(theme);

            // 保存选择
            localStorage.setItem('app-theme', theme);
        });
    });
}