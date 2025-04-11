import {
    startRecording as apiStartRecording,
    stopRecording as apiStopRecording,
    pauseTracking as apiPauseTracking,
    resumeTracking as apiResumeTracking,
    stopTracking as apiStopTracking,
    exportData as apiExportData,
    clearAllData as apiClearAllData,
    clearDataRange as apiClearDataRange,
    getHealthAssessment as apiGetHealthAssessment,
    saveUserProfile as apiSaveUserProfile
} from './api.js';

import { showError, updateRecordingStatusDisplay } from './ui.js';
import { updateApplicationState } from './main.js'; // 引入主更新函数

// let isRecording = true; // Remove local state tracking here, rely on backend via getStats
let isPaused = false; // Local state specifically for the pause/resume button text

function setupButtonListener(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.addEventListener('click', handler);
    } else {
        console.warn(`Button with ID '${buttonId}' not found.`);
    }
}

export function initializeEventListeners() {
    console.log("Initializing event listeners...");

    // --- 控制面板 (Control Panel / Top Bar) ---
    setupButtonListener('startRecord', async() => {
        try {
            await apiStartRecording();
            console.log('Start recording command sent.');
            updateRecordingStatusDisplay(true); // 立即更新UI
            updateApplicationState(); // 请求更新统计数据
        } catch (error) {
            showError("启动记录失败", error);
        }
    });

    setupButtonListener('stopRecord', async() => {
        try {
            await apiStopRecording();
            console.log('Stop recording command sent.');
            updateRecordingStatusDisplay(false); // 立即更新UI
            updateApplicationState(); // 请求更新统计数据
        } catch (error) {
            showError("停止记录失败", error);
        }
    });

    // --- 设置面板 (Settings Pane) ---

    // 导出数据按钮 (使用新的 ID: export-data-btn)
    setupButtonListener('export-data-btn', async() => {
        try {
            const result = await apiExportData('json'); // 默认导出 JSON，或添加选择器
            alert(`数据导出成功！路径: ${result}`);
            console.log('Data exported:', result);
        } catch (error) {
            showError('数据导出失败', error);
        }
    });

    // 清除所有数据按钮 (使用新的 ID: clear-data-btn)
    setupButtonListener('clear-data-btn', async() => {
        if (confirm('确定要清除所有记录数据吗？此操作不可恢复！')) {
            try {
                await apiClearAllData();
                alert('所有数据已清除！');
                updateApplicationState(); // 刷新数据
            } catch (error) {
                showError('清除数据失败', error);
            }
        }
    });

    // 清除范围数据按钮 (使用新的 ID: clear-range-btn, 需要日期输入框)
    setupButtonListener('clear-range-btn', async() => {
        const startDateElement = document.getElementById('clearDataRangeStart'); // 假设日期输入框ID
        const endDateElement = document.getElementById('clearDataRangeEnd'); // 假设日期输入框ID
        const startDate = startDateElement ? startDateElement.value : null;
        const endDate = endDateElement ? endDateElement.value : null;

        if (!startDate || !endDate) {
            alert('请选择有效的开始和结束日期。');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            alert('开始日期不能晚于结束日期。');
            return;
        }

        if (confirm(`确定要清除从 ${startDate} 到 ${endDate} 的记录吗？此操作不可逆！`)) {
            try {
                await apiClearDataRange(startDate, endDate);
                alert('选定范围内的数据已清除。');
                updateApplicationState(); // 刷新数据
            } catch (error) {
                showError('清除范围数据失败', error);
            }
        }
    });

    // AI 分析引导按钮 (使用新的 ID: ai-analysis-btn)
    setupButtonListener('ai-analysis-btn', () => {
        alert(
            `AI 分析引导：

1. 请先使用"导出数据"功能将您的键盘统计数据导出为文件（如 CSV 或 JSON）。
2. 访问我们推荐的外部 AI 分析服务（请注意查阅其隐私政策）：[外部服务链接 placeholder]
3. 将您导出的文件上传至该服务进行分析。

重要提示：导出数据和在外部网站进行分析是您的自愿行为。请确保您了解并同意外部服务的隐私政策和数据使用方式。本应用不会自动上传您的任何数据。`
        );
    });

    // 健康档案评估按钮 (使用新的 ID: health-profile-btn)
    setupButtonListener('health-profile-btn', async() => {
        const occupationInput = document.getElementById('user-occupation');
        const dailyUsageInput = document.getElementById('user-daily-usage');
        const resultArea = document.getElementById('health-assessment-result');

        if (!occupationInput || !dailyUsageInput || !resultArea) {
            console.error('Health assessment elements not found.');
            return;
        }

        const occupation = occupationInput.value;
        const dailyUsage = dailyUsageInput.value;

        if (!occupation || !dailyUsage) {
            alert('请输入您的职业类型和平均每日电脑使用时长。');
            return;
        }

        try {
            const assessment = await apiGetHealthAssessment(occupation, parseInt(dailyUsage, 10));
            resultArea.innerHTML =
                `<h4>健康风险评估提示：</h4>
                 <p>${assessment}</p>
                 <small><i>请注意：此评估仅为基于有限数据的提示，并非专业医疗建议。如有健康疑虑，请咨询医生。</i></small>`;
            console.log('Health assessment successful:', assessment);
        } catch (error) {
            resultArea.innerHTML = `<p style="color: red;">获取健康评估失败: ${error}</p>`;
            showError('获取健康评估失败', error);
        }
    });

    // 保存健康档案按钮 (旧逻辑，可能与评估按钮合并或移除，ID: saveProfile)
    // setupButtonListener('saveProfile', () => {
    //     const professionElement = document.getElementById('userProfession');
    //     const dailyUseElement = document.getElementById('userDailyUse');
    //     const profession = professionElement ? professionElement.value : null;
    //     const dailyUse = dailyUseElement ? dailyUseElement.value : null;
    //     apiSaveUserProfile(profession, dailyUse)
    //         .then(() => alert('健康档案已保存。'))
    //         .catch(error => showError("保存健康档案失败", error));
    // });

    // --- 记录控制 (位于设置面板) ---
    const toggleBtn = document.getElementById('toggle-recording-btn');
    const statusIndicator = document.getElementById('recording-status-indicator'); // Advanced controls status text

    function updateToggleButtonVisuals() {
        if (toggleBtn) {
            toggleBtn.textContent = isPaused ? '恢复记录' : '暂停记录';
            // Also visually indicate paused state in the advanced controls section
            if (statusIndicator) {
                const mainStatus = document.getElementById('statusIndicator') ? .classList.contains('recording'); // Check main status
                if (!mainStatus) {
                    statusIndicator.textContent = '已停止';
                    statusIndicator.style.color = 'red';
                    toggleBtn.disabled = true; // Disable pause/resume if stopped
                } else if (isPaused) {
                    statusIndicator.textContent = '已暂停';
                    statusIndicator.style.color = 'orange';
                    toggleBtn.disabled = false;
                } else {
                    statusIndicator.textContent = '正在记录';
                    statusIndicator.style.color = 'green';
                    toggleBtn.disabled = false;
                }
            }
        }
        // The main Start/Stop buttons and status indicators are updated by updateRecordingStatusDisplay via getStats
    }

    if (toggleBtn) {
        // Initialize based on a potential initial paused state if available
        // For now, assume not paused initially
        isPaused = false;
        updateToggleButtonVisuals();

        toggleBtn.addEventListener('click', async() => {
            const wasPaused = isPaused; // Store state before attempting the change
            try {
                if (!wasPaused) { // If it was not paused (i.e., button shows '暂停记录')
                    await apiPauseTracking();
                    alert('已暂停记录');
                    isPaused = true;
                } else { // If it was paused (i.e., button shows '恢复记录')
                    await apiResumeTracking();
                    alert('已恢复记录');
                    isPaused = false;
                }
                updateToggleButtonVisuals(); // Update button text and local status indicator
            } catch (error) {
                showError('切换记录状态失败', error);
                // Revert local state on error
                isPaused = wasPaused;
                updateToggleButtonVisuals();
            }
        });
    } else {
        console.warn("Pause/Resume toggle button ('toggle-recording-btn') not found.");
    }

    // Remove the listener for the permanent stop button
    // setupButtonListener('stop-recording-btn', async () => { ... });

    console.log("Event listeners initialized.");
}