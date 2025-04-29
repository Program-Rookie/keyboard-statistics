use rdev::{listen, Event, EventType};
use rdev::Key::*;
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
use std::collections::HashSet;

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
    pub enabled: Arc<AtomicBool>,
    app_handle: Option<AppHandle>,
    pressed_keys: Arc<std::sync::Mutex<HashSet<String>>>, // 新增
}

impl KeyboardMonitor {
    pub fn new() -> Self {
        KeyboardMonitor {
            sender: None,
            is_running: false,
            enabled: Arc::new(AtomicBool::new(true)),
            app_handle: None,
            pressed_keys: Arc::new(std::sync::Mutex::new(HashSet::new())), // 新增
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

        let app_handle = self.app_handle.clone();
        let pressed_keys = self.pressed_keys.clone(); // 新增

        thread::spawn(move || {
            if let Err(error) = listen(move |event| {
                if !enabled.load(Ordering::Relaxed) {
                    return;
                }
                match event.event_type {
                    EventType::KeyPress(key) => {
                        let key_code = key_to_string(&key);
                        let mut keys = pressed_keys.lock().unwrap();
                        let has_modifier = keys.iter().any(|k| matches!(k.as_str(), "Ctrl" | "Shift" | "Alt" | "Win"));
                        if (!has_modifier) {
                            keys.clear();
                        }
                        if !keys.insert(key_code.clone()) {
                            return;
                        }
                        let (app_name, window_title) = get_active_window_info();
                        let mut keys_vec: Vec<_> = keys.iter().cloned().collect();
                        let combo = keys_vec.join("+");
                        let event = KeyboardEvent {
                            timestamp: Local::now(),
                            key_code: combo.clone(),
                            app_name,
                            window_title,
                        };
                        println!("{:?}", event);
                        let _ = tx.send(event);

                        if let Some(handle) = &app_handle {
                            let result = handle.emit_to("key_popup", "key-pressed", KeyPressedPayload {
                                key_code: combo,
                            });
                        }
                    }
                    EventType::KeyRelease(key) => {
                        let key_code = key_to_string(&key);
                        let mut keys = pressed_keys.lock().unwrap();
                        keys.remove(&key_code);
                    }
                    _ => {}
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

fn key_to_string(key: &rdev::Key) -> String {
    let key_str = format!("{:?}", key);
    match key_str.as_str() {
        // 系统功能键
        "ControlLeft" | "ControlRight" => "Ctrl".to_string(),
        "ShiftLeft" | "ShiftRight" => "Shift".to_string(),
        "MetaLeft" | "MetaRight" => "Win".to_string(),
        "Alt" | "AltGr" => "Alt".to_string(),
        "AltGr" => "AltGr".to_string(),
        "Enter" | "Return" => "Enter".to_string(),
        "Space" => "Space".to_string(),
        "Tab" => "Tab".to_string(),
        "Backspace" => "Backspace".to_string(),
        "CapsLock" => "CapsLock".to_string(),
        "Escape" => "Esc".to_string(),

        // 导航键
        "UpArrow" => "↑".to_string(),
        "DownArrow" => "↓".to_string(),
        "LeftArrow" => "←".to_string(),
        "RightArrow" => "→".to_string(),
        "Home" => "Home".to_string(),
        "End" => "End".to_string(),
        "PageUp" => "PageUp".to_string(),
        "PageDown" => "PageDown".to_string(),
        "Insert" => "Insert".to_string(),
        "Delete" => "Delete".to_string(),

        // 锁定键
        "NumLock" => "NumLock".to_string(),
        "ScrollLock" => "ScrollLock".to_string(),
        "PrintScreen" => "PrintScreen".to_string(),
        "Pause" => "Pause".to_string(),

        // 字母键
        s if s.starts_with("Key") => s[3..].to_string(),

        // 数字键
        s if s.starts_with("Num") && s.len() == 4 => s[3..].to_string(),

        // 符号键
        "BackQuote" => "`".to_string(),
        "Minus" => "-".to_string(),
        "Equal" => "=".to_string(),
        "LeftBracket" => "[".to_string(),
        "RightBracket" => "]".to_string(),
        "Semicolon" => ";".to_string(),
        "BackSlash" => "\\".to_string(),
        "Quote" => "'".to_string(),
        "Comma" => ",".to_string(),
        "Period" => ".".to_string(),
        "Slash" => "/".to_string(),
        "Grave" => "`".to_string(),

        // 小键盘
        "Numpad0" => "0".to_string(),
        "Numpad1" => "1".to_string(),
        "Numpad2" => "2".to_string(),
        "Numpad3" => "3".to_string(),
        "Numpad4" => "4".to_string(),
        "Numpad5" => "5".to_string(),
        "Numpad6" => "6".to_string(),
        "Numpad7" => "7".to_string(),
        "Numpad8" => "8".to_string(),
        "Numpad9" => "9".to_string(),
        "KpPlus" => "+".to_string(),
        "KpMinus" => "-".to_string(),
        "KpMultiply" => "*".to_string(),
        "KpDivide" => "/".to_string(),
        "NumpadDecimal" => ".".to_string(),
        "NumpadEnter" => "Enter".to_string(),
        "Unknown(12)" => "5".to_string(), // 未知按键，可能是 "5" 键

        // 未知按键保留原始名称
        _ => key_str
    }
}