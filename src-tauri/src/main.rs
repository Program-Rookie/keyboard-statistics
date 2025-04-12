// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

#[derive(Serialize, Deserialize, Default)]
struct AppConfig {
    show_exit_confirm: bool,
}

// 使用Mutex包装配置，以便在程序运行时修改
struct AppState {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
}

impl AppState {
    fn new(app_dir: PathBuf) -> Self {
        let config_path = app_dir.join("config.json");
        let config = if config_path.exists() {
            match File::open(&config_path) {
                Ok(mut file) => {
                    let mut contents = String::new();
                    if file.read_to_string(&mut contents).is_ok() {
                        match serde_json::from_str(&contents) {
                            Ok(config) => config,
                            Err(_) => AppConfig::default(),
                        }
                    } else {
                        AppConfig::default()
                    }
                }
                Err(_) => AppConfig::default(),
            }
        } else {
            // 默认第一次启动时显示退出确认
            AppConfig {
                show_exit_confirm: true,
            }
        };

        AppState {
            config: Mutex::new(config),
            config_path,
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 设置应用状态
            let app_dir = app.path().app_data_dir().expect("无法获取应用数据目录");
            std::fs::create_dir_all(&app_dir).expect("无法创建应用数据目录");
            let app_state = AppState::new(app_dir);
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
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        id: _,       // 添加 id 字段
                        position: _, // 添加 position 字段
                        rect: _,     // 添加 rect 字段
                    } = event
                    {
                        // 左键点击切换窗口可见性
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = match window.is_visible().unwrap() {
                                true => window.hide(),
                                false => window.show(),
                            };
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
            update_exit_confirm,
            get_exit_confirm_setting
        ])
        .on_window_event(|app, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let window = app.get_webview_window("main").unwrap();
                let app_handle = window.app_handle();
                
                // 获取应用状态
                let state = app_handle.state::<AppState>();
                let show_confirm = state.config.lock().unwrap().show_exit_confirm;
                
                if show_confirm {
                    // 阻止窗口立即关闭
                    api.prevent_close();
                    
                    // 显示确认对话框
                    let dialog = app_handle.dialog()
                        .message("确定要退出应用吗？")
                        .title("退出确认")
                        .buttons(MessageDialogButtons::YesNo);
                        
                    let result = dialog.blocking_show();
                    if result {
                        // 用户选择是，退出应用
                        window.close().unwrap();
                    }
                    
                    // 在前端处理"不再提醒"选项，通过调用update_exit_confirm命令来更新设置
                } else {
                    // 如果设置为不显示确认，直接关闭
                    window.close().unwrap();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}
