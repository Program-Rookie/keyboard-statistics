use inputbot::KeybdKey;
use std::time::{SystemTime, UNIX_EPOCH};
use windows::Win32::{
    Foundation::HWND,
    UI::{
        Input::Ime::{ImmGetConversionStatus, ImmGetDefaultIMEWnd, IME_CMODE_NATIVE},
        WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW}
    }
};

fn main() {
    KeybdKey::bind_all(|event| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        
        let hwnd = unsafe { GetForegroundWindow() };
        let mut window_title = [0u16; 512];
        let len = unsafe { GetWindowTextW(hwnd, window_title.as_mut_ptr(), window_title.len() as i32) };
        let window_title = String::from_utf16_lossy(&window_title[..len as usize]);
        
        let himc = unsafe { ImmGetDefaultIMEWnd(hwnd) };
        let mut conversion = 0;
        let mut sentence = 0;
        let is_chinese_input = unsafe { ImmGetConversionStatus(himc, &mut conversion, &mut sentence) }.is_ok() && (conversion & IME_CMODE_NATIVE) != 0;
        
        println!("按键: {:?}, 时间戳: {}, 窗口: {}, 中文输入: {}", event, timestamp, window_title, is_chinese_input);
    });
    
    inputbot::handle_input_events();
}