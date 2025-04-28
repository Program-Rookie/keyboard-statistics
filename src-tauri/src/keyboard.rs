use rdev::{listen, Event, EventType};
use std::sync::mpsc::{channel, Sender};
use std::thread;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Local};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
use windows::Win32::Foundation::{HWND, HANDLE};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardEvent {
    timestamp: DateTime<Local>,
    key_code: String,
    app_name: String,
    window_title: String,
}

pub struct KeyboardMonitor {
    sender: Option<Sender<KeyboardEvent>>,
    is_running: bool,
    pub enabled: Arc<AtomicBool>, // 新增
    app_handle: Option<AppHandle>, // 添加 AppHandle 用于发送事件
}

impl KeyboardMonitor {
    pub fn new() -> Self {
        KeyboardMonitor {
            sender: None,
            is_running: false,
            enabled: Arc::new(AtomicBool::new(true)), // 默认启用
            app_handle: None,
        }
    }
    // 设置 AppHandle
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    pub fn is_running(&self) -> bool {
        self.is_running
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.is_running {
            self.resume();
            return Ok(());
        }
        let enabled = self.enabled.clone();
        let (tx, rx) = channel();
        self.sender = Some(tx.clone());
        self.is_running = true;

        // 克隆 AppHandle 用于在线程中使用
        let app_handle = self.app_handle.clone();

        thread::spawn(move || {
            if let Err(error) = listen(move |event| {
                if !enabled.load(Ordering::Relaxed) {
                    return;
                }
                if let Event { event_type: EventType::KeyPress(key), .. } = event {
                    let (app_name, window_title) = get_active_window_info();
                    let key_code = format!("{:?}", key);
                    let event = KeyboardEvent {
                        timestamp: Local::now(),
                        key_code: key_code.clone(),
                        app_name,
                        window_title,
                    };
                    println!("{:?}", event);
                    let _ = tx.send(event);

                    // 发送事件到前端
                    if let Some(handle) = &app_handle {
                        let result = handle.emit_to("key_popup", "key-pressed", KeyPressedPayload {
                            key_code,
                        });
                    }
                }
            }) {
                println!("键盘监听错误: {:?}", error);
            }
        });

        Ok(())
    }

    pub fn stop(&mut self) {
        self.enabled.store(false, Ordering::Relaxed); // 暂停统计
    }
    pub fn resume(&mut self) {
        self.enabled.store(true, Ordering::Relaxed); // 恢复统计
    }
}

// 用于发送到前端的事件载荷
#[derive(Clone, Serialize)]
struct KeyPressedPayload {
    key_code: String,
}
fn get_active_window_info() -> (String, String) {
    unsafe {
        let hwnd = GetForegroundWindow();
        let mut title = [0u16; 512];
        let mut process_name = String::new();
        let mut window_title = String::new();

        // 获取窗口标题
        if GetWindowTextW(hwnd, &mut title) > 0 {
            window_title = String::from_utf16_lossy(&title[..title.iter().position(|&x| x == 0).unwrap_or(title.len())]);
        }

        // 获取进程名称
        let mut pid = 0u32;
        windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 {
            let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
            if let Ok(handle) = handle {
                let mut path = [0u16; 260];
                let len = GetProcessImageFileNameW(handle, &mut path) as usize;
                if len > 0 {
                    process_name = String::from_utf16_lossy(&path[..len]);
                    if let Some(file_name) = process_name.split('\\').last() {
                        process_name = file_name.to_string();
                    }
                }
            }
        }

        (process_name, window_title)
    }
}