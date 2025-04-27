// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyboard;
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

// 在 AppConfig 结构体中添加新字段
#[derive(Serialize, Deserialize, Default, Debug)]
struct AppConfig {
    show_exit_confirm: bool,
    minimize_on_close: bool,  // 添加此字段
}

// 使用Mutex包装配置，以便在程序运行时修改
struct AppState {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
    keyboard_monitor: Mutex<KeyboardMonitor>,  // 添加键盘监听器
}

// 添加开始监听命令
#[tauri::command]
async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut monitor = state.keyboard_monitor.lock().unwrap();
    println!("start recording");
    if monitor.is_running() {
        monitor.resume();
        Ok(())
    } else {
        monitor.start()
    }
}

// 添加停止监听命令
#[tauri::command]
async fn stop_recording(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut monitor = state.keyboard_monitor.lock().unwrap();
    monitor.stop();
    println!("stop recording");
}

impl AppState {
    fn new(app_dir: PathBuf) -> Self {
        let config_path = app_dir.join("config.json");
        println!("配置文件路径: {:?}", config_path);
        println!("配置文件是否存在: {}", config_path.exists());
        
        let config = if config_path.exists() {
            match File::open(&config_path) {
                Ok(mut file) => {
                    let mut contents = String::new();
                    if file.read_to_string(&mut contents).is_ok() {
                        println!("读取到的配置内容: {}", contents);
                        match serde_json::from_str(&contents) {
                            Ok(config) => config,
                            Err(e) => {
                                println!("配置解析错误: {}", e);
                                AppConfig::default()
                            }
                        }
                    } else {
                        println!("读取配置文件失败");
                        AppConfig::default()
                    }
                }
                Err(e) => {
                    println!("打开配置文件失败: {}", e);
                    AppConfig::default()
                }
            }
        } else {
            println!("配置文件不存在，使用默认配置");
            AppConfig {
                show_exit_confirm: true,
                minimize_on_close: true,  // 默认值
            }
        };
        
        println!("最终使用的配置: {:?}", config);

        AppState {
            config: Mutex::new(config),
            config_path,
            keyboard_monitor: Mutex::new(KeyboardMonitor::new()),
        }
    }
    fn save_config(&self) -> Result<(), String> {
        let config = self.config.lock().unwrap();
        let json = match serde_json::to_string_pretty(&*config) {
            Ok(j) => j,
            Err(e) => return Err(format!("配置序列化失败: {}", e)),
        };

        match File::create(&self.config_path) {
            Ok(mut file) => match file.write_all(json.as_bytes()) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("写入配置文件失败: {}", e)),
            },
            Err(e) => Err(format!("创建配置文件失败: {}", e)),
        }
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
        let mut config = state.config.lock().unwrap();
        config.show_exit_confirm = show_confirm;
    }
    state.save_config()
}

// 获取当前退出确认设置
#[tauri::command]
fn get_exit_confirm_setting(app: tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let config = state.config.lock().unwrap();
    config.show_exit_confirm
}

// 添加新的命令来更新关闭行为
#[tauri::command]
fn update_close_behavior(app: tauri::AppHandle, minimize: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut config = state.config.lock().unwrap();
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
            std::fs::create_dir_all(&app_dir).expect("无法创建应用数据目录");
            let app_state = AppState::new(app_dir);
            // 启动键盘监听器
            {
                let mut monitor = app_state.keyboard_monitor.lock().unwrap();
                monitor.start().unwrap();
            }
            app.manage(app_state);

            // 创建托盘菜单
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let about = MenuItem::with_id(app, "about", "关于", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &about, &quit])?;

            // 创建托盘图标
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone()) // 使用默认图标
                .tooltip("右键显示菜单")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "about" => {
                        let _ = app.dialog().message(
                            "键盘统计\n版本: 0.1.0\n作者: Program-Rookie，抖音：AI CodingZ",
                        ).title("关于").blocking_show();
                    }
                    _ => println!("未知菜单项: {:?}", event.id),
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        // 右键点击时手动显示菜单
                        TrayIconEvent::Click { 
                            button: MouseButton::Right, 
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            // 在 Tauri 2.0 中，右键菜单会自动显示，不需要手动调用
                        }
                        // 左键点击显示窗口
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
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
        ])
        .on_window_event(|app, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let window = app.get_webview_window("main").unwrap();
                let app_handle = window.app_handle();
                
                // 获取应用状态
                let state = app_handle.state::<AppState>();
                let config = state.config.lock().unwrap();
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
