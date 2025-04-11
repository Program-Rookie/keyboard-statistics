use inputbot::KeybdKey;
use std::time::{SystemTime, UNIX_EPOCH};
use windows::Win32::{
    Foundation::BOOL,
    // 删除这行：Globalization::HIMC,
    UI::{
        Input::Ime::{ImmGetConversionStatus, ImmGetContext, IME_CMODE_NATIVE, IME_CONVERSION_MODE, IME_SENTENCE_MODE},
        WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW},
    },
};

fn main() {
    KeybdKey::bind_all(|event| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        
        let hwnd = unsafe { GetForegroundWindow() };
        let mut window_title = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd, &mut window_title) };
        let full_title = String::from_utf16_lossy(&window_title[..len as usize]);
        
        // 提取应用程序名称
        let window_title = full_title.split(|c| c == '-' || c == '：' || c == ':')
            .last()
            .unwrap_or(&full_title)
            .trim()
            .to_string();
        
        let himc = unsafe { ImmGetContext(hwnd) };
        let mut conversion = IME_CONVERSION_MODE::default();
        let mut sentence = IME_SENTENCE_MODE::default();
        
        println!("按键: {:?}, 时间戳: {}, 窗口: {}", event, timestamp, window_title);
    });
    
    inputbot::handle_input_events();
}