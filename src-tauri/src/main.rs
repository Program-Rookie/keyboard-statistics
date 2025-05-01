// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod keyboard;
pub mod database;
mod tray;
mod config;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::PathBuf;
use std::sync::Mutex;
use std::fs::File;
use std::io::Write;
use keyboard_statistics_lib::analyzer::KeyStats;
use chrono::{Local, Duration, TimeZone};
use tauri::{WindowEvent, Manager};
use crate::keyboard::KeyboardMonitor;
use crate::config::ConfigManager;
use tauri_plugin_dialog::DialogExt;
use tauri::Emitter;

// 定义get_key_stats函数
#[tauri::command]
fn get_key_stats(app: tauri::AppHandle, time_range: &str) -> Result<KeyStats, String> {
    keyboard_statistics_lib::get_key_stats(app, time_range)
}

// 添加导出数据命令
#[tauri::command]
async fn export_data(app: tauri::AppHandle, format: &str, range: &str, type_str: &str) -> Result<String, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    let conn = database::init_db(db_path_str)
        .map_err(|e| format!("数据库连接失败: {}", e))?;
    
    // 计算时间范围
    let now = Local::now();
    let (start_time, end_time) = match range {
        "today" => {
            // 获取今天凌晨零点
            let today = now.date_naive().and_hms_opt(0, 0, 0)
                .unwrap_or_else(|| now.naive_local());
            let start = Local.from_local_datetime(&today).single()
                .unwrap_or(now);
            (start, now)
        },
        "week" => (now - Duration::days(7), now),
        "month" => (now - Duration::days(30), now),
        "all" => (now - Duration::days(365), now),
        _ => return Err("无效的时间范围".to_string()),
    };
    
    // 导出数据
    let content = match format {
        "json" => database::export_data_as_json(&conn, start_time, end_time)
            .map_err(|e| format!("导出JSON数据失败: {}", e))?,
        "csv" => database::export_data_as_csv(&conn, start_time, end_time)
            .map_err(|e| format!("导出CSV数据失败: {}", e))?,
        _ => return Err("不支持的导出格式".to_string()),
    };
    
    // 构造文件名
    let timestamp = now.format("%Y%m%d%H%M%S").to_string();
    let file_ext = if format == "json" { "json" } else { "csv" };
    let file_name = format!("keyboard_stats_{}_{}_{}.{}", type_str, range, timestamp, file_ext);
    
    // 保存到文件
    let save_path = app_dir.join(&file_name);
    let mut file = File::create(&save_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("写入文件失败: {}", e))?;
    
    Ok(save_path.to_string_lossy().to_string())
}

// 添加删除数据命令
#[tauri::command]
async fn delete_data(app: tauri::AppHandle, range: &str) -> Result<String, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    let mut conn = database::init_db(db_path_str)
        .map_err(|e| format!("数据库连接失败: {}", e))?;
    
    // 计算时间范围
    let now = Local::now();
    let (start_time, end_time) = match range {
        "today" => {
            // 获取今天凌晨零点
            let today = now.date_naive().and_hms_opt(0, 0, 0)
                .unwrap_or_else(|| now.naive_local());
            let start = Local.from_local_datetime(&today).single()
                .unwrap_or(now);
            (start, now)
        },
        "week" => (now - Duration::days(7), now),
        "month" => (now - Duration::days(30), now),
        "all" => (now - Duration::days(365), now), // 一年表示全部
        _ => return Err("无效的时间范围".to_string()),
    };
    
    // 执行删除
    let deleted_count = database::delete_data_by_time_range(&mut conn, start_time, end_time)
        .map_err(|e| format!("删除数据失败: {}", e))?;
    
    Ok(format!("成功删除 {} 条记录", deleted_count))
}

// 添加清除全部数据命令
#[tauri::command]
async fn clear_all_data(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    let mut conn = database::init_db(db_path_str)
        .map_err(|e| format!("数据库连接失败: {}", e))?;
    
    database::clear_all_data(&mut conn)
        .map_err(|e| format!("清除所有数据失败: {}", e))?;
    
    Ok("所有数据已清除".to_string())
}

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

// 添加获取数据库路径命令
#[tauri::command]
fn get_database_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    Ok(db_path_str.to_string())
}

// 添加打开文件夹命令
#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    use std::process::Command;
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args([path])
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args([path])
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .args([path])
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }
    
    Ok(())
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
            get_key_stats,
            export_data,
            delete_data,
            clear_all_data,
            get_database_path,
            open_folder,
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
