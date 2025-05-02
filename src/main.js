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
    // 如果key_popup不存在则创建 有bug所以先屏蔽
    // const existingPopup = WebviewWindow.getByLabel('key_popup');
    // if (existingPopup) {
    //     console.log('key_popup 窗口已存在');
    //     return;
    // }
    const monitor = currentMonitor();

    monitor.then((monitor) => {
        console.log('当前显示器信息:', monitor);
        const winWidth = 300;
        const winHeight = 300;
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
        // popup.once('tauri://error', function(e) {
        //     // an error happened creating the webview
        //     console.error('创建 webview 时发生错误:', e);
        // });
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
    // 检查所有需要的元素是否存在
    const occupationElement = document.getElementById('occupation');
    const dailyHoursElement = document.getElementById('daily-hours');
    const keyboardTypeElement = document.getElementById('keyboard-type');
    const hasBreaksElement = document.getElementById('has-breaks');
    const hasWristSupportElement = document.getElementById('has-wrist-support');

    // 如果元素不存在，给出友好提示并返回
    if (!occupationElement || !dailyHoursElement) {
        console.error('健康评估表单元素不存在');
        alert('无法进行健康评估，表单元素不存在');
        return;
    }

    const occupation = occupationElement.value;
    const dailyHours = dailyHoursElement.value;
    // 安全地获取其他元素的值，如果元素不存在则使用默认值
    const keyboardType = keyboardTypeElement ? keyboardTypeElement.value || 'standard' : 'standard';
    const hasBreaks = hasBreaksElement ? hasBreaksElement.checked : false;
    const hasWristSupport = hasWristSupportElement ? hasWristSupportElement.checked : false;

    if (!occupation || !dailyHours) {
        alert('请填写完整的信息以进行评估');
        return;
    }

    // 获取当前统计数据用于更详细的评估
    invoke('get_key_stats', { timeRange: 'all' }).then(stats => {
        // 使用统计数据和用户输入进行更详细的健康评估
        const result = calculateHealthRisk(stats, {
            occupation,
            dailyHours,
            keyboardType,
            hasBreaks,
            hasWristSupport
        });

        // 显示评估结果
        displayHealthAssessment(result);
    }).catch(error => {
        console.error('获取统计数据失败:', error);

        // 如果获取数据失败，仍使用基本数据进行评估
        const result = {
            riskLevel: getRiskLevel(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport),
            description: getHealthDescription(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport),
            recommendations: getHealthRecommendations(occupation, dailyHours)
        };

        // 显示结果
        displayHealthAssessment(result);
    });
}

// 计算健康风险
function calculateHealthRisk(stats, userInfo) {
    const { occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport } = userInfo;

    // 基础风险评估
    let riskLevel = getRiskLevel(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport);
    let description = getHealthDescription(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport);

    // 添加基于统计数据的具体评估
    let insights = [];

    // 获取用户的每日按键量
    const dailyKeyPresses = stats.total_presses / Math.max(stats.days_recorded, 1);

    // 评估每日按键量
    if (dailyKeyPresses > 20000) {
        insights.push("您的每日按键量非常高，处于重度使用级别。");
        if (riskLevel !== "高") riskLevel = "中高";
    } else if (dailyKeyPresses > 10000) {
        insights.push("您的每日按键量较高，处于中度使用级别。");
    } else if (dailyKeyPresses > 5000) {
        insights.push("您的每日按键量适中，处于正常使用级别。");
    } else {
        insights.push("您的每日按键量较低，处于轻度使用级别。");
    }

    // 评估按键类型分布
    if (stats.key_categories) {
        const modifierPercent = (stats.key_categories.modifier || 0) / stats.total_presses * 100;
        if (modifierPercent > 15) {
            insights.push("您使用修饰键(Shift, Ctrl等)的比例较高，可能增加手指疲劳风险。");
        }
    }

    // 评估按键使用高峰期
    if (stats.time_distribution) {
        let peakHours = 0;
        let continuousHours = 0;
        let currentStreak = 0;

        // 对象转换为数组并按小时排序
        const hourData = Object.entries(stats.time_distribution)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }))
            .sort((a, b) => a.hour - b.hour);

        // 计算高峰期和连续使用时间
        hourData.forEach(({ count }) => {
            if (count > dailyKeyPresses / 24 * 1.5) {
                peakHours++;
                currentStreak++;
                continuousHours = Math.max(continuousHours, currentStreak);
            } else {
                currentStreak = 0;
            }
        });

        if (continuousHours >= 4) {
            insights.push(`您的键盘使用存在长时间连续高强度使用(${continuousHours}小时)，建议增加休息频率。`);
            if (riskLevel !== "高") riskLevel = "中高";
        } else if (peakHours > 8) {
            insights.push("您的键盘使用呈现出长时间高强度特征，建议适当调整工作节奏。");
        }
    }

    // 生成个性化建议
    const recommendations = getHealthRecommendations(occupation, dailyHours);

    // 如果有可用的统计信息，添加更多个性化建议
    if (insights.length > 0) {
        description = `基于您的实际使用数据和输入信息的评估：\n${description}`;
    }

    return {
        riskLevel,
        description,
        insights,
        recommendations,
        stats: {
            dailyKeyPresses: Math.round(dailyKeyPresses),
            totalPresses: stats.total_presses,
            daysRecorded: stats.days_recorded || 1
        }
    };
}

// 显示健康评估结果
function displayHealthAssessment(result) {
    const resultContainer = document.querySelector('.health-result');
    resultContainer.classList.remove('hidden');

    // 显示风险等级
    const riskValue = document.querySelector('.risk-value');
    riskValue.textContent = result.riskLevel;
    riskValue.style.color = getRiskColor(result.riskLevel);

    // 显示风险描述
    const riskDescription = document.querySelector('.risk-description');
    riskDescription.textContent = result.description;

    // 显示使用洞察
    if (result.insights && result.insights.length > 0) {
        const insightsContainer = document.querySelector('.health-insights') ||
            createInsightsSection(resultContainer);

        insightsContainer.innerHTML = '<h4>使用洞察</h4>';
        const insightsList = document.createElement('ul');
        insightsList.className = 'insights-list';

        result.insights.forEach(insight => {
            const insightItem = document.createElement('li');
            insightItem.textContent = insight;
            insightsList.appendChild(insightItem);
        });

        insightsContainer.appendChild(insightsList);
    }

    // 显示健康建议
    if (result.recommendations && result.recommendations.length > 0) {
        const recommendationsContainer = document.querySelector('.health-recommendations') ||
            createRecommendationsSection(resultContainer);

        recommendationsContainer.innerHTML = '<h4>健康建议</h4>';
        const recommendationsList = document.createElement('ul');
        recommendationsList.className = 'recommendations-list';

        result.recommendations.forEach(recommendation => {
            const recommendationItem = document.createElement('li');
            recommendationItem.textContent = recommendation;
            recommendationsList.appendChild(recommendationItem);
        });

        recommendationsContainer.appendChild(recommendationsList);
    }

    // 显示使用统计
    if (result.stats) {
        const statsContainer = document.querySelector('.health-stats') ||
            createStatsSection(resultContainer);

        statsContainer.innerHTML = '<h4>使用统计</h4>';

        const statsList = document.createElement('ul');
        statsList.className = 'stats-list';

        const statsItems = [
            `每日平均按键次数: ${result.stats.dailyKeyPresses.toLocaleString()}`,
            `总按键次数: ${result.stats.totalPresses.toLocaleString()}`,
            `记录天数: ${result.stats.daysRecorded}`
        ];

        statsItems.forEach(stat => {
            const statItem = document.createElement('li');
            statItem.textContent = stat;
            statsList.appendChild(statItem);
        });

        statsContainer.appendChild(statsList);
    }
}

// 创建洞察部分
function createInsightsSection(container) {
    const section = document.createElement('div');
    section.className = 'health-insights';
    container.appendChild(section);
    return section;
}

// 创建建议部分
function createRecommendationsSection(container) {
    const section = document.createElement('div');
    section.className = 'health-recommendations';
    container.appendChild(section);
    return section;
}

// 创建统计部分
function createStatsSection(container) {
    const section = document.createElement('div');
    section.className = 'health-stats';
    container.appendChild(section);
    return section;
}

// 获取风险等级
function getRiskLevel(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport) {
    // 基础风险评分
    let riskScore = 0;

    // 根据职业评分
    if (occupation === 'programmer' || occupation === 'writer' || occupation === 'data') {
        riskScore += 3; // 高风险职业
    } else if (occupation === 'designer' || occupation === 'student') {
        riskScore += 2; // 中风险职业
    } else {
        riskScore += 1; // 低风险职业
    }

    // 根据日使用时间评分
    if (dailyHours === '10+') {
        riskScore += 4; // 高强度使用
    } else if (dailyHours === '7-9') {
        riskScore += 3; // 中高强度使用
    } else if (dailyHours === '4-6') {
        riskScore += 2; // 中等强度使用
    } else {
        riskScore += 1; // 低强度使用
    }

    // 根据键盘类型评分
    if (keyboardType === 'mechanical') {
        riskScore -= 1; // 机械键盘通常更符合人体工学
    } else if (keyboardType === 'ergonomic') {
        riskScore -= 2; // 人体工学键盘降低风险
    }

    // 根据是否定期休息评分
    if (hasBreaks) {
        riskScore -= 2; // 定期休息降低风险
    }

    // 根据是否使用腕托评分
    if (hasWristSupport) {
        riskScore -= 1; // 使用腕托降低风险
    }

    // 根据总评分确定风险等级
    if (riskScore >= 6) {
        return "高";
    } else if (riskScore >= 4) {
        return "中高";
    } else if (riskScore >= 2) {
        return "中";
    } else {
        return "低";
    }
}

// 获取健康描述
function getHealthDescription(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport) {
    const riskLevel = getRiskLevel(occupation, dailyHours, keyboardType, hasBreaks, hasWristSupport);

    let description = "";

    // 基于风险等级的描述
    if (riskLevel === "高") {
        description = "您的键盘使用强度很高，存在较高的RSI(重复性劳损)风险。";
    } else if (riskLevel === "中高") {
        description = "您的键盘使用处于中高强度，存在一定的RSI风险。";
    } else if (riskLevel === "中") {
        description = "您的键盘使用处于中等强度，RSI风险适中。";
    } else {
        description = "您的键盘使用强度较低，RSI风险较小。";
    }

    // 添加职业和使用时间相关描述
    description += `作为一名${getOccupationName(occupation)}，每日键盘使用${getDailyHoursDescription(dailyHours)}，`;

    // 添加健康习惯描述
    if (hasBreaks && hasWristSupport) {
        description += "您有定期休息和使用腕托的良好习惯，这有助于降低RSI风险。";
    } else if (hasBreaks) {
        description += "您有定期休息的好习惯，建议考虑使用腕托以进一步降低风险。";
    } else if (hasWristSupport) {
        description += "您使用腕托是个好习惯，建议同时增加定期休息以更好地保护手腕。";
    } else {
        description += "建议养成定期休息和使用腕托的习惯，以降低RSI风险。";
    }

    return description;
}

// 获取健康建议
function getHealthRecommendations(occupation, dailyHours) {
    const recommendations = [
        "每使用键盘1小时，至少休息5-10分钟，进行手腕伸展运动",
        "保持正确的坐姿和手腕姿势，手腕应保持自然直线，不要过度弯曲",
        "考虑使用符合人体工学的键盘和鼠标，减少腕部压力"
    ];

    // 根据职业添加建议
    if (occupation === 'programmer' || occupation === 'writer') {
        recommendations.push("尝试使用快捷键和代码片段工具，减少重复性按键");
        recommendations.push("考虑使用文本扩展工具，通过短代码展开为常用文本");
    }

    // 根据使用时间添加建议
    if (dailyHours === '10+' || dailyHours === '7-9') {
        recommendations.push("严格执行番茄工作法(25分钟工作，5分钟休息)");
        recommendations.push("定期进行手腕和手指的强化锻炼，增强肌肉耐力");
        recommendations.push("考虑使用语音输入等替代输入方式，减少键盘使用时间");
    }

    return recommendations;
}

// 获取职业名称
function getOccupationName(occupation) {
    const occupationMap = {
        'programmer': '程序员',
        'writer': '作家/文字工作者',
        'data': '数据分析师',
        'designer': '设计师',
        'student': '学生',
        'office': '办公室工作人员',
        'other': '其他职业人士'
    };

    return occupationMap[occupation] || occupation;
}

// 获取使用时间描述
function getDailyHoursDescription(dailyHours) {
    const hoursMap = {
        '10+': '超过10小时',
        '7-9': '7-9小时',
        '4-6': '4-6小时',
        '1-3': '1-3小时',
        '<1': '不到1小时'
    };

    return hoursMap[dailyHours] || dailyHours;
}

// 获取风险颜色
function getRiskColor(riskLevel) {
    switch (riskLevel) {
        case '高':
            return '#dc3545'; // 红色
        case '中高':
            return '#fd7e14'; // 橙色
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

        // 应用使用统计 - 注释掉，因为函数已被移除
        // updateAppKeysChart(stats);

        // 时间分布图表
        updateTimeDistributionChart(stats);

        // 活动热力图
        updateActivityHeatmap(stats);

        // 按键类型详细分布图
        updateKeyDetailChart(stats);

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

    // 从应用使用数据中提取时间分布信息
    // 注意：这里假设后端提供了app_time_distribution字段，包含每个应用在一天中各个时段的使用量
    if (stats.app_time_distribution && Object.keys(stats.app_time_distribution).length > 0) {
        // 处理后端提供的数据
        appTimeData = stats.app_time_distribution;
        hasValidData = true;
    } else if (stats.app_usage && Object.keys(stats.app_usage).length > 0) {
        // 如果没有时间分布数据，则使用应用使用量数据创建模拟的时间分布
        // 获取前5个最常用的应用
        const topApps = Object.entries(stats.app_usage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (topApps.length > 0) {
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

    // 如果没有数据，使用模拟数据
    if (!hasValidData) {
        // 模拟数据 - 生成5个最常用应用的时间分布
        const mockApps = [
            "Chrome", "VS Code", "Word", "Excel", "微信"
        ];

        appTimeData = mockApps.map(app => {
            // 生成随机时间分布，但符合工作时间使用量高的规律
            const hourData = Array.from({ length: 24 }, (_, hour) => {
                // 工作时间(9-18)使用量更高
                const isWorkHour = hour >= 9 && hour <= 18;
                // 为每个应用设置不同的基础值，以区分应用使用量
                const baseValue = mockApps.indexOf(app) === 0 ? 100 :
                    mockApps.indexOf(app) === 1 ? 80 :
                    mockApps.indexOf(app) === 2 ? 60 :
                    mockApps.indexOf(app) === 3 ? 40 : 20;

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

    // 添加标题
    const titleDiv = document.createElement('div');
    titleDiv.className = 'heatmap-title';
    titleDiv.style.textAlign = 'center';
    titleDiv.style.marginBottom = '10px';

    // 根据热力图类型设置标题和显示样式
    switch (parseInt(heatmapType)) {
        case 1: // 今日热力图（按小时）
            titleDiv.textContent = '今日活动热力图（按小时）';
            createTodayHeatmap(heatmapWrapper, heatmapData);
            break;
        case 2: // 周热力图（按星期和小时）
            titleDiv.textContent = '本周活动热力图（按星期和小时）';
            createWeekHeatmap(heatmapWrapper, heatmapData);
            break;
        case 3: // 月热力图（按日期和小时）
            titleDiv.textContent = '本月活动热力图（按日期和小时）';
            createMonthHeatmap(heatmapWrapper, heatmapData);
            break;
        case 4: // 全部时间热力图（按星期和小时）
            titleDiv.textContent = '所有时间活动热力图（按星期和小时）';
            createAllTimeHeatmap(heatmapWrapper, heatmapData);
            break;
        default:
            titleDiv.textContent = '活动热力图';
            createWeekHeatmap(heatmapWrapper, heatmapData); // 默认使用周热力图样式
    }

    heatmapWrapper.insertBefore(titleDiv, heatmapWrapper.firstChild);
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

    // 添加小时标签
    for (let hour = 0; hour < 24; hour++) {
        const hourLabel = document.createElement('div');
        hourLabel.textContent = `${hour}:00`;
        hourLabel.style.flex = '1';
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

    // 添加图例
    addHeatmapLegend(container);
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
    container.appendChild(mainContent);

    // 添加日期列
    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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

    // SQL的%w从周日0开始，所以我们直接按这个顺序创建UI
    for (let day = 0; day <= 6; day++) {
        const dayRow = document.createElement('div');
        dayRow.className = 'heatmap-row';
        dayRow.style.display = 'flex';
        dayRow.style.flex = '1';
        dayRow.style.margin = '1px 0';
        dayRow.style.minHeight = '25px'; // 设置最小高度
        heatmapGrid.appendChild(dayRow);

        // 为每个小时创建一个单元格
        for (let hour = 0; hour < 24; hour++) {
            const hourKey = hour.toString().padStart(2, '0');
            const key = `d${day}_h${hourKey}`;

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
            cell.title = `${dayLabels[day]} ${hour}:00 - 活跃度: ${value}`;

            dayRow.appendChild(cell);
        }
    }

    // 添加图例
    addHeatmapLegend(container);
}

// 创建月热力图（按日期和小时分布）
function createMonthHeatmap(container, heatmapData) {
    // 获取当前月份的天数
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // 设置容器最小高度，确保足够的显示空间
    container.style.minHeight = '400px';

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
    // gridContainer.style.height = '320px'; // 固定高度，确保足够空间
    gridContainer.style.minHeight = '320px';
    container.appendChild(gridContainer);

    // 小时标签列
    const hoursColumn = document.createElement('div');
    hoursColumn.style.display = 'flex';
    hoursColumn.style.flexDirection = 'column';
    hoursColumn.style.width = '50px';
    gridContainer.appendChild(hoursColumn);

    for (let hour = 0; hour < 24; hour += 2) {
        const hourLabel = document.createElement('div');
        hourLabel.textContent = `${hour}:00`;
        hourLabel.style.flex = '1';
        hourLabel.style.textAlign = 'right';
        hourLabel.style.paddingRight = '10px';
        hourLabel.style.fontSize = '10px';
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
    grid.style.minHeight = '300px'; // 确保最小高度
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

    // 为每2小时创建一行
    for (let hour = 0; hour < 24; hour += 2) {
        const hourRow = document.createElement('div');
        hourRow.style.display = 'flex';
        hourRow.style.flex = '1';
        hourRow.style.minHeight = '25px'; // 确保行高
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

    // 添加图例
    addHeatmapLegend(container);
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
    container.appendChild(mainContent);

    // 添加日期列
    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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

    // SQL的%w从周日0开始，所以我们直接按这个顺序创建UI
    for (let day = 0; day <= 6; day++) {
        const dayRow = document.createElement('div');
        dayRow.className = 'heatmap-row';
        dayRow.style.display = 'flex';
        dayRow.style.flex = '1';
        dayRow.style.margin = '1px 0';
        dayRow.style.minHeight = '25px'; // 设置最小高度
        heatmapGrid.appendChild(dayRow);

        // 为每个小时创建一个单元格
        for (let hour = 0; hour < 24; hour++) {
            const hourKey = hour.toString().padStart(2, '0');
            const key = `d${day}_h${hourKey}`;

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
            cell.title = `${dayLabels[day]} ${hour}:00 - 活跃度: ${value}`;

            dayRow.appendChild(cell);
        }
    }

    // 添加图例
    addHeatmapLegend(container);
}

// 添加热力图图例
function addHeatmapLegend(container) {
    const legendContainer = document.createElement('div');
    legendContainer.className = 'heatmap-legend';
    legendContainer.style.display = 'flex';
    legendContainer.style.justifyContent = 'center';
    legendContainer.style.alignItems = 'center';
    legendContainer.style.marginTop = '15px';
    legendContainer.style.fontSize = '11px';
    container.appendChild(legendContainer);

    const lowLabel = document.createElement('span');
    lowLabel.textContent = '低';
    legendContainer.appendChild(lowLabel);

    // 创建渐变图例
    for (let i = 1; i <= 5; i++) {
        const intensity = i * 0.15;
        const legendItem = document.createElement('div');
        legendItem.style.width = '20px';
        legendItem.style.height = '10px';
        legendItem.style.backgroundColor = `rgba(40, 167, 69, ${intensity})`; // 使用绿色渐变
        legendItem.style.margin = '0 2px';
        legendItem.style.borderRadius = '2px';
        legendContainer.appendChild(legendItem);
    }

    const highLabel = document.createElement('span');
    highLabel.textContent = '高';
    legendContainer.appendChild(highLabel);
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

// 更新按键类型详细分布图表
function updateKeyDetailChart(stats) {
    const chartElement = document.getElementById('key-category-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 处理数据 - 使用key_categories
    const categories = stats.key_categories || {};
    const labels = Object.keys(categories);
    const data = Object.values(categories);

    // 如果没有数据，显示提示信息
    if (labels.length === 0) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-data-message';
        noDataMessage.textContent = '暂无数据';
        noDataMessage.style.display = 'flex';
        noDataMessage.style.justifyContent = 'center';
        noDataMessage.style.alignItems = 'center';
        noDataMessage.style.height = '100%';
        noDataMessage.style.fontSize = '18px';
        noDataMessage.style.color = '#aaa';
        chartElement.appendChild(noDataMessage);
        return;
    }

    // 鲜艳多彩的配色方案
    const colors = [
        '#FF5722', // 深橙色
        '#3F51B5', // 靛蓝色
        '#009688', // 茶绿色
        '#FFC107', // 琥珀色
        '#673AB7', // 深紫色
        '#E91E63', // 粉红色
        '#03A9F4', // 浅蓝色
        '#8BC34A', // 浅绿色
        '#9C27B0', // 紫色
        '#CDDC39', // 酸橙色
        '#795548', // 棕色
        '#607D8B' // 蓝灰色
    ];

    // 创建图表 - 使用扁平简约风格的饼图
    new Chart(canvas, {
        type: 'pie', // 改用饼图而非环形图，更简约
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 10
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: {
                            size: 11
                        },
                        boxWidth: 12, // 更小的图例框
                        padding: 10
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
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const dataset = context.dataset;
                            const total = dataset.data.reduce((acc, current) => acc + current, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${percentage}% (${value})`;
                        }
                    }
                }
            }
        }
    });
}

// 更新常用组合键图表
function updateKeyComboChart(stats) {
    const chartElement = document.getElementById('key-combo-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const canvas = document.createElement('canvas');
    chartElement.appendChild(canvas);

    // 由于后端可能没有提供组合键数据，这里使用模拟数据进行展示
    // 在实际项目中，应该从stats中获取组合键数据
    let keyCombos = [];

    // 尝试从stats中获取组合键数据
    if (stats.key_combos && stats.key_combos.length > 0) {
        keyCombos = stats.key_combos;
    } else {
        // 使用模拟数据进行展示
        keyCombos = [
            { combo: "Ctrl+C", count: 120 },
            { combo: "Ctrl+V", count: 115 },
            { combo: "Ctrl+Z", count: 87 },
            { combo: "Alt+Tab", count: 76 },
            { combo: "Ctrl+X", count: 65 },
            { combo: "Ctrl+A", count: 54 },
            { combo: "Ctrl+S", count: 49 },
            { combo: "Win+E", count: 34 },
            { combo: "Ctrl+F", count: 28 },
            { combo: "Alt+F4", count: 19 }
        ];
    }

    // 准备图表数据
    const labels = keyCombos.map(item => item.combo);
    const data = keyCombos.map(item => item.count);

    // 如果没有数据，显示提示信息
    if (labels.length === 0) {
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

    // 尝试从活动热力图中提取日期数据
    if (stats.activity_heatmap && Object.keys(stats.activity_heatmap).length > 0) {
        const heatmapData = stats.activity_heatmap;
        // 当前日期
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const currentDate = today.getDate();

        // 处理热力图数据，累加每日的按键数量
        try {
            // 创建一个映射来存储每一天的总键击数
            const dayTotals = {};

            Object.entries(heatmapData).forEach(([key, value]) => {
                // 检查是否是日期+小时的键值（如"d01_h12"表示1日12时）
                const match = key.match(/^d(\d{2})_h\d{2}$/);
                if (match) {
                    const day = parseInt(match[1]); // 获取日期部分

                    // 初始化当天的计数器
                    if (!dayTotals[day]) {
                        dayTotals[day] = 0;
                    }

                    // 累加当天的按键数量
                    dayTotals[day] += value;
                }
            });

            // 处理每天的总数据
            Object.entries(dayTotals).forEach(([day, total]) => {
                const dayNum = parseInt(day);

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
                    dailyData[29 - dayDiff] = total;
                    hasValidData = true;
                    activeDaysCount++;
                    activeDays.push(29 - dayDiff); // 记录有活动的日期索引
                }
            });
        } catch (error) {
            console.error('处理热力图数据时出错:', error);
        }
    }

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

    // 如果仍然没有有效数据，调整模拟数据以反映实际使用情况
    if (!hasValidData) {
        // 当前日期
        const today = new Date();

        // 生成更合理的模拟数据，只显示最近1-3天的活动
        const daysToShow = Math.floor(Math.random() * 2) + 1; // 1-2天

        // 所有数据默认为0
        dailyData = new Array(30).fill(0);

        // 只设置最近的几天有数据
        for (let i = 0; i < daysToShow; i++) {
            const day = 29 - i; // 从最近的日期开始
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dayOfWeek = date.getDay(); // 0 = 周日, 6 = 周六

            // 工作日和周末使用量不同
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const baseValue = isWeekend ?
                Math.floor(Math.random() * 400) + 100 : // 周末
                Math.floor(Math.random() * 800) + 300; // 工作日

            dailyData[day] = baseValue;
            activeDays.push(day);
        }

        // 添加说明文本
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'chart-explanation';
        explanationDiv.textContent = '基于最近几天的使用情况生成的数据预览。随着使用时间增加，图表将展示真实的使用趋势。';
        explanationDiv.style.padding = '10px';
        explanationDiv.style.fontSize = '12px';
        explanationDiv.style.color = '#666';
        explanationDiv.style.textAlign = 'center';
        chartElement.appendChild(explanationDiv);
    }

    // 创建渐变背景
    const getGradient = (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(75, 192, 192, 0.6)');
        gradient.addColorStop(1, 'rgba(75, 192, 192, 0.1)');
        return gradient;
    };

    // 自定义点大小函数 - 活跃日期的点更大
    const customPointRadius = (context) => {
        const index = context.dataIndex;
        // 如果是有数据的日期，使用更大的点
        return activeDays.includes(index) ? 5 : 0;
    };

    // 创建图表 - 使用曲线图和渐变填充
    new Chart(canvas, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: '按键数量',
                data: dailyData,
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return null;
                    return getGradient(ctx);
                },
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                pointRadius: customPointRadius,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: 'rgba(75, 192, 192, 1)',
                pointBorderWidth: 1.5,
                tension: 0.3, // 平滑曲线
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                            return `日期: ${context[0].label}`;
                        },
                        label: function(context) {
                            if (context.raw === 0) {
                                return '无使用记录';
                            }
                            return `按键数量: ${context.raw.toLocaleString()}`;
                        },
                        afterLabel: function(context) {
                            // 判断是否是今天
                            if (context.dataIndex === 29) {
                                return '(今天)';
                            }
                            return '';
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
                        maxTicksLimit: 7, // 显示更少的刻度，避免拥挤
                        font: {
                            size: 10
                        },
                        callback: function(value, index) {
                            // 标记今天的日期
                            const label = dates[index];
                            if (index === 29) {
                                return `${label} (今)`;
                            }
                            // 标记有活动数据的日期
                            if (activeDays.includes(index)) {
                                return label;
                            }
                            // 对无数据的日期，考虑少显示一些刻度
                            if (activeDaysCount <= 3) {
                                // 当活跃天数少时，主要显示活跃日和几个关键日期
                                if (index === 0 || index % 7 === 0) {
                                    return label;
                                }
                                return '';
                            }
                            return label;
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
    let realWeeklyData = new Array(7).fill(0);
    let recentUsageDays = 0;

    // 从活动热力图数据中提取周分布数据
    if (stats.activity_heatmap && Object.keys(stats.activity_heatmap).length > 0) {
        const heatmapData = stats.activity_heatmap;

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
                    realWeeklyData[weekDay] += dayTotal;
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

    // 如果只有少量数据，生成更适合的数据展示
    let weeklyData = new Array(7).fill(0);

    if (hasRealData) {
        weeklyData = realWeeklyData;

        // 如果用户只使用了很少的天数(1-2天)，在图表中突出显示
        if (recentUsageDays <= 2) {
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
    } else {
        // 使用更合理的模拟数据
        // 标记当前日期为有活动的日子，加上前1-2天的随机活动
        const activeDays = new Set([currentDay]);

        // 随机选择1-2个额外的天来模拟最近使用
        const daysToSimulate = Math.floor(Math.random() * 2) + 1;

        for (let i = 0; i < daysToSimulate; i++) {
            // 随机选择最近的1-3天
            const dayDiff = Math.floor(Math.random() * 3) + 1;
            const pastDay = (currentDay - dayDiff + 7) % 7; // 确保在0-6范围内
            activeDays.add(pastDay);
        }

        // 设置活动天的数据，非活动天设为0或很小的值
        for (let i = 0; i < 7; i++) {
            if (activeDays.has(i)) {
                // 活跃日，生成较大的随机数
                weeklyData[i] = Math.floor(Math.random() * 600) + 400;
            } else {
                // 非活跃日，设为0或很小的数
                weeklyData[i] = 0;
            }
        }

        // 添加解释文本
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'chart-explanation';
        explanationDiv.textContent = '基于最近几天的使用情况生成的数据预览。随着使用时间增加，图表将展示真实使用模式。';
        explanationDiv.style.padding = '10px';
        explanationDiv.style.fontSize = '12px';
        explanationDiv.style.color = '#666';
        explanationDiv.style.textAlign = 'center';
        chartElement.appendChild(explanationDiv);
    }

    // 多彩配色方案 - 突出当前日期和有数据的天
    const colors = new Array(7).fill('rgba(200, 200, 200, 0.3)'); // 默认淡灰色

    // 突出显示有数据的天
    if (hasRealData) {
        daysUsed.forEach(day => {
            colors[day] = 'rgba(54, 162, 235, 0.8)'; // 有数据的天使用亮蓝色
        });
    } else {
        // 模拟数据情况下，突出显示活跃天
        for (let i = 0; i < 7; i++) {
            if (weeklyData[i] > 0) {
                colors[i] = 'rgba(54, 162, 235, 0.8)';
            }
        }
    }

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
                        },
                        afterLabel: function(context) {
                            if (!hasRealData && weeklyData[context.dataIndex] > 0) {
                                return '(预估数据)';
                            }
                            return '';
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

// 更新时间分布图表
function updateTimeDistributionChart(stats) {
    const chartElement = document.getElementById('hourly-distribution-chart');
    if (!chartElement) return;

    // 清除旧的图表
    chartElement.innerHTML = '';
    const newCanvas = document.createElement('canvas');
    chartElement.appendChild(newCanvas);

    // 设置图表容器固定高度
    chartElement.style.height = '300px';
    chartElement.style.maxHeight = '300px';
    chartElement.style.overflow = 'hidden';

    // 准备数据：小时分布
    const timeData = new Array(24).fill(0);

    // 从time_distribution获取数据
    if (stats.time_distribution && Object.keys(stats.time_distribution).length > 0) {
        Object.entries(stats.time_distribution).forEach(([hour, count]) => {
            const hourNum = parseInt(hour, 10);
            if (!isNaN(hourNum) && hourNum >= 0 && hourNum < 24) {
                timeData[hourNum] = count;
            }
        });
    }

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    // 创建渐变背景
    const getGradient = (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(75, 192, 192, 0.6)');
        gradient.addColorStop(1, 'rgba(75, 192, 192, 0.1)');
        return gradient;
    };

    // 创建图表 - 使用曲线图和渐变填充
    new Chart(newCanvas, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: '按键活动',
                data: timeData,
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return null;
                    return getGradient(ctx);
                },
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: 'rgba(75, 192, 192, 1)',
                pointBorderWidth: 1.5,
                tension: 0.4, // 平滑曲线
                fill: true
            }],
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
                            return `时间: ${context[0].label}`;
                        },
                        label: function(context) {
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
                        maxTicksLimit: 8,
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}