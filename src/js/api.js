import { invoke } from '@tauri-apps/api/tauri';

export async function startRecording() {
    return await invoke('start_recording');
}

export async function stopRecording() {
    return await invoke('stop_recording');
}

export async function pauseTracking() {
    // 注意：根据之前的代码，后端命令可能是 pause_tracking
    // 如果后端是 start/stop 模式，则可能不需要 pause/resume
    // 这里暂时保留，如果不需要可以移除
    return await invoke('pause_tracking');
}

export async function resumeTracking() {
    // 同上，如果不需要可以移除
    return await invoke('resume_tracking');
}

export async function getStats() {
    return await invoke('get_stats');
}

export async function exportData(format = 'json') {
    // 注意：之前的代码有不同的 export 调用方式，这里整合一个
    // const result = await invoke('export_data'); // 之前的 Settings 调用
    // await invoke('export_data', { format }); // 另一个地方的调用
    // 假设后端统一为 export_data，可选 format 参数
    return await invoke('export_data', { format });
}

export async function clearAllData() {
    // 注意：之前的代码有不同的 clear 调用方式
    // await invoke('clear_all_data'); // Settings 调用
    // await invoke('clear_data', { analyzer }); // 另一个地方的调用
    // 假设后端统一为 clear_all_data
    return await invoke('clear_all_data');
}

export async function clearDataRange(startDate, endDate) {
    // 注意：之前的代码有不同的 clear range 调用方式
    // await invoke('clear_data_by_date_range', { analyzer, start, end });
    // await invoke('clear_data_range', { startDate, endDate });
    // 假设后端统一为 clear_data_range
    return await invoke('clear_data_range', { startDate, endDate });
}

export async function getHealthAssessment(occupation, dailyUsage) {
    return await invoke('get_health_assessment', { occupation, dailyUsage });
}

export async function saveUserProfile(profession, dailyUse) {
    // 注意：这里的参数名与 getHealthAssessment 不同，根据后端调整
    return await invoke('save_user_profile', { profession, dailyUse });
}

// 如果后端仍然需要传递 analyzer 对象，则需要调整
// export async function get_total_keystrokes(analyzer) { return await invoke('get_total_keystrokes', { analyzer }); }
// ... 其他需要 analyzer 的函数

// 如果有获取初始状态的命令，例如记录是否正在运行
export async function getInitialState() {
    // 假设有一个命令可以获取初始状态
    // return await invoke('get_initial_state');
    // 暂时返回一个默认值，需要后端实现
    return { is_recording: true }; // 或者 false，取决于默认行为
}