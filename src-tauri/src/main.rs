// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod keyboard;
pub mod database;
mod tray;
mod config;
mod commands;
use keyboard::KeyboardMonitor;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use config::ConfigManager;

// 使用Mutex包装配置，以便在程序运行时修改
struct AppState {
    config_manager: ConfigManager,
    keyboard_monitor: Mutex<KeyboardMonitor>,  // 添加键盘监听器
}

// 新增：获取当前录制状态
#[tauri::command]
fn get_recording_status(app: tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let config = state.config_manager.get_config();
    config.recording_enabled
}
// 添加开始监听命令
#[tauri::command]
async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut monitor = state.keyboard_monitor.lock().unwrap();
    println!("start recording");
    if monitor.is_running() {
        monitor.resume();
    } else {
        monitor.start()?;
    }
    // 持久化状态
    {
        let mut config = state.config_manager.get_config();
        config.recording_enabled = true;
    }
    state.save_config()?;
    Ok(())
}

// 添加停止监听命令
#[tauri::command]
async fn stop_recording(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut monitor = state.keyboard_monitor.lock().unwrap();
    monitor.stop();
    println!("stop recording");
    // 持久化状态
    {
        let mut config = state.config_manager.get_config();
        config.recording_enabled = false;
    }
    let _ = state.save_config();
}

impl AppState {
    fn new(app_dir: PathBuf) -> Self {
        AppState {
            config_manager: ConfigManager::new(app_dir.clone()),
            keyboard_monitor: Mutex::new(KeyboardMonitor::new(app_dir)),
        }
    }
    fn save_config(&self) -> Result<(), String> {
        self.config_manager.save_config()
    }

    fn update_config<F>(&self, update_fn: F) -> Result<(), String>
    where
        F: FnOnce(&mut config::AppConfig),
    {
        let mut config = self.config_manager.get_config();
        update_fn(&mut config);
        self.save_config()
    }
}

// 自定义退出命令
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}
// 自定义命令：隐藏窗口
#[tauri::command]
async fn hide_window(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

// 更新退出确认设置
#[tauri::command]
fn update_exit_confirm(app: tauri::AppHandle, show_confirm: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut config = state.config_manager.get_config();
        config.show_exit_confirm = show_confirm;
    }
    state.save_config()
}

// 获取当前退出确认设置
#[tauri::command]
fn get_exit_confirm_setting(app: tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let config = state.config_manager.get_config();
    config.show_exit_confirm
}

// 添加新的命令来更新关闭行为
#[tauri::command]
fn update_close_behavior(app: tauri::AppHandle, minimize: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut config = state.config_manager.get_config();
        config.minimize_on_close = minimize;
    }
    state.save_config()
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 设置应用状态
            let app_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
            println!("应用数据目录: {:?}", app_dir);
            std::fs::create_dir_all(&app_dir).expect("无法创建应用数据目录");
            let app_state = AppState::new(app_dir);
            // 根据配置决定是否启动监听器
            {
                let config = app_state.config_manager.get_config();
                let mut monitor = app_state.keyboard_monitor.lock().unwrap();
                monitor.set_app_handle(app.handle().clone());
                if config.recording_enabled {
                    monitor.start().unwrap();
                } else {
                    monitor.stop();
                }
            }
            app.manage(app_state);
            // 创建托盘图标
            tray::setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
            hide_window,
            update_exit_confirm,
            get_exit_confirm_setting,
            update_close_behavior,
            start_recording,
            stop_recording,
            get_recording_status,
        ])
        .on_window_event(|app, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let window = app.get_webview_window("main").unwrap();
                let app_handle = window.app_handle();
                
                // 获取应用状态
                let state = app_handle.state::<AppState>();
                let config = state.config_manager.get_config();
                let show_confirm = config.show_exit_confirm;
                let minimize_on_close = config.minimize_on_close;
                
                if show_confirm {
                    api.prevent_close();
                    app.emit("show-close-dialog", ()).unwrap();
                } else {
                    // 根据保存的行为决定是最小化还是退出
                    if minimize_on_close {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    // 如果 minimize_on_close 为 false，则允许窗口关闭，应用退出
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}
