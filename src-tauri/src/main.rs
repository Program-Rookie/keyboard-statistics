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
use serde_json;

// 定义get_key_stats函数
#[tauri::command]
fn get_key_stats(app: tauri::AppHandle, time_range: &str) -> Result<KeyStats, String> {
    keyboard_statistics_lib::get_key_stats(app, time_range)
}

// 添加获取当前KPM命令
#[tauri::command]
fn get_current_kpm(app: tauri::AppHandle) -> Result<f64, String> {
    keyboard_statistics_lib::get_current_kpm(app)
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
    
    // 使用辅助函数获取调整后的时间范围
    let (start_time, end_time) = keyboard_statistics_lib::get_adjusted_time_range(&conn, range)?;
    
    // 导出数据
    // 根据类型导出不同的数据
    let content = match type_str {
        "summary" => {
            // 导出统计摘要
            match format {
                "json" => database::export_summary_as_json(&conn, start_time, end_time)
                    .map_err(|e| format!("导出JSON摘要数据失败: {}", e))?,
                "csv" => database::export_summary_as_csv(&conn, start_time, end_time)
                    .map_err(|e| format!("导出CSV摘要数据失败: {}", e))?,
                _ => return Err("不支持的导出格式".to_string()),
            }
        },
        "raw" => {
            // 导出原始按键数据
            match format {
                "json" => database::export_data_as_json(&conn, start_time, end_time)
                    .map_err(|e| format!("导出JSON原始数据失败: {}", e))?,
                "csv" => database::export_data_as_csv(&conn, start_time, end_time)
                    .map_err(|e| format!("导出CSV原始数据失败: {}", e))?,
                _ => return Err("不支持的导出格式".to_string()),
            }
        },
        _ => return Err("不支持的数据类型".to_string()),
    };
    
    // 构造文件名
    let now = Local::now();
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
    
    // 使用辅助函数获取调整后的时间范围
    let (start_time, end_time) = keyboard_statistics_lib::get_adjusted_time_range(&conn, range)?;
    
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

// 获取健康评估指标
#[tauri::command]
async fn get_health_risk_metrics(app: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    let conn = database::init_db(db_path_str)
        .map_err(|e| format!("数据库连接失败: {}", e))?;
    
    // 获取用户首次按键时间
    let first_event_time = database::get_first_event_time(&conn)
        .map_err(|e| format!("获取首次按键时间失败: {}", e))?;
    
    // 如果没有任何按键记录，使用一个默认的起始时间（30天前）
    let start_time = match first_event_time {
        Some(time) => time,
        None => Local::now() - Duration::days(30)
    };
    
    let end_time = Local::now();
    
    // 计算健康风险指标
    let metrics = database::calculate_health_risk_metrics(&conn, start_time, end_time)
        .map_err(|e| format!("计算健康风险指标失败: {}", e))?;
    
    // 将指标转换为JSON字符串
    let json = serde_json::to_string(&metrics)
        .map_err(|e| format!("序列化指标失败: {}", e))?;
    
    Ok(json)
}

// 保存用户健康配置
#[tauri::command]
async fn save_health_profile(
    app: tauri::AppHandle, 
    occupation: &str, 
    daily_hours: &str, 
    has_breaks: bool, 
    has_support: bool
) -> Result<(), String> {
    let config_path = app.path().app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {}", e))?
        .join("health_profile.json");
    
    // 创建配置对象
    let mut profile = serde_json::Map::new();
    profile.insert("occupation".to_string(), serde_json::Value::String(occupation.to_string()));
    profile.insert("daily_hours".to_string(), serde_json::Value::String(daily_hours.to_string()));
    profile.insert("has_breaks".to_string(), serde_json::Value::Bool(has_breaks));
    profile.insert("has_support".to_string(), serde_json::Value::Bool(has_support));
    profile.insert("updated_at".to_string(), serde_json::Value::String(Local::now().to_rfc3339()));
    
    // 将配置写入文件
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(profile))
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    std::fs::write(&config_path, json)
        .map_err(|e| format!("保存配置文件失败: {}", e))?;
    
    Ok(())
}

// 获取用户健康配置
#[tauri::command]
async fn get_health_profile(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = app.path().app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {}", e))?
        .join("health_profile.json");
    
    // 检查文件是否存在
    if !config_path.exists() {
        // 返回空对象
        return Ok(r#"{"occupation":"","daily_hours":"","has_breaks":false,"has_support":false}"#.to_string());
    }
    
    // 读取配置文件
    let json = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    Ok(json)
}

// 添加开机自启动设置
#[tauri::command]
async fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut config = state.config_manager.get_config();
        config.autostart_enabled = enabled;
    }
    state.save_config()?;
    
    // 在系统中实际设置自启动
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let app_path = std::env::current_exe()
            .map_err(|e| format!("获取应用路径失败: {}", e))?;
        
        let app_path_str = app_path.to_string_lossy().to_string();
        
        if enabled {
            // 创建启动项
            Command::new("reg")
                .args(["add", "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", 
                       "/v", "KeyboardStatistics", "/t", "REG_SZ", "/d", &app_path_str, "/f"])
                .output()
                .map_err(|e| format!("设置自启动失败: {}", e))?;
        } else {
            // 删除启动项
            Command::new("reg")
                .args(["delete", "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", 
                       "/v", "KeyboardStatistics", "/f"])
                .output()
                .map_err(|e| format!("取消自启动失败: {}", e))?;
        }
    }
    
    Ok(())
}

// 获取自启动设置状态
#[tauri::command]
fn get_autostart_setting(app: tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    let config = state.config_manager.get_config();
    config.autostart_enabled
}

// 获取弹窗位置
#[tauri::command]
fn get_popup_position(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let config = state.config_manager.get_config();
    
    // 将位置信息序列化为JSON字符串
    let position_json = serde_json::to_string(&config.popup_position)
        .map_err(|e| format!("序列化弹窗位置失败: {}", e))?;
    
    Ok(position_json)
}

// 获取所有显示器信息
#[tauri::command]
async fn get_all_monitors(app: tauri::AppHandle) -> Result<String, String> {
    let window = app.get_webview_window("main").ok_or("无法获取主窗口")?;
    
    // 获取所有显示器
    let monitors = window.available_monitors()
        .map_err(|e| format!("获取显示器信息失败: {}", e))?;
    
    // 构建显示器信息数组
    let monitor_info: Vec<serde_json::Value> = monitors.iter().enumerate().map(|(index, monitor)| {
        let size = monitor.size();
        let position = monitor.position();
        
        // 使用索引作为ID, 不再使用name()方法
        let id = format!("monitor_{}", index);
        let name = format!("显示器 {}", index + 1);
        
        let is_primary = monitor.position().x == 0 && monitor.position().y == 0; // 假设坐标为0,0的为主显示器
        
        serde_json::json!({
            "id": id,
            "name": name,
            "width": size.width,
            "height": size.height,
            "position_x": position.x,
            "position_y": position.y,
            "is_primary": is_primary
        })
    }).collect();
    
    // 序列化为JSON字符串
    let json = serde_json::to_string(&monitor_info)
        .map_err(|e| format!("序列化显示器信息失败: {}", e))?;
    
    Ok(json)
}

// 设置弹窗位置
#[tauri::command]
fn set_popup_position(app: tauri::AppHandle, x: i32, y: i32, monitor_id: Option<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut config = state.config_manager.get_config();
        config.popup_position.x = x;
        config.popup_position.y = y;
        config.popup_position.monitor_id = monitor_id.clone();
    }
    
    // 保存配置
    state.save_config()?;
    
    // 获取弹窗窗口并更新位置
    if let Some(window) = app.get_webview_window("key_popup") {
        // 如果指定了显示器ID，尝试获取该显示器
        let monitor = if let Some(ref id) = monitor_id {  // 使用ref关键字避免移动值
            // 获取所有可用显示器
            let monitors = window.available_monitors()
                .map_err(|e| format!("获取显示器信息失败: {}", e))?;
            
            // 查找匹配的显示器（根据ID前缀查找）
            let monitor_index = id.strip_prefix("monitor_")
                .and_then(|index_str| index_str.parse::<usize>().ok())
                .and_then(|index| if index < monitors.len() { Some(index) } else { None });
            
            if let Some(index) = monitor_index {
                // 找到了匹配的显示器
                monitors.get(index).cloned()
            } else {
                // 没有找到匹配的显示器，使用当前显示器
                window.current_monitor()
                    .map_err(|e| format!("获取当前显示器失败: {}", e))?
            }
        } else {
            // 没有指定显示器ID，使用当前显示器
            window.current_monitor()
                .map_err(|e| format!("获取显示器信息失败: {}", e))?
        };
        
        // 确保找到了显示器
        let monitor = monitor.expect("无法获取显示器");
        
        let monitor_size = monitor.size();
        println!("显示器尺寸: 宽度={}, 高度={}", monitor_size.width, monitor_size.height);
        
        let window_size = window.inner_size()
            .map_err(|e| format!("获取窗口尺寸失败: {}", e))?;
        println!("窗口尺寸: 宽度={}, 高度={}", window_size.width, window_size.height);
        
        // 按照实际坐标计算，现在所有坐标都为正值
        println!("使用的坐标: x={}, y={}", x, y);
        
        // 确保位置不会超出屏幕边界
        let safe_x = i32::max(0, i32::min(x, monitor_size.width as i32 - window_size.width as i32));
        let safe_y = i32::max(0, i32::min(y, monitor_size.height as i32 - window_size.height as i32));
        
        // 获取显示器位置
        let monitor_pos = monitor.position();
        
        // 计算全局安全坐标
        let global_safe_x = monitor_pos.x + safe_x;
        let global_safe_y = monitor_pos.y + safe_y;
        
        println!("设置窗口位置: 显示器={}, 局部坐标=(x={}, y={}), 全局坐标=(x={}, y={})", 
                id_or_default(monitor_id.as_deref()), safe_x, safe_y, global_safe_x, global_safe_y);
        
        // 更新窗口位置(使用全局坐标)
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { 
            x: global_safe_x, 
            y: global_safe_y 
        }))
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    }
    
    Ok(())
}

// 辅助函数，安全处理显示器ID显示
fn id_or_default(id: Option<&str>) -> &str {
    id.unwrap_or("主显示器")
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
            get_current_kpm,
            export_data,
            delete_data,
            clear_all_data,
            get_database_path,
            open_folder,
            get_health_risk_metrics,
            save_health_profile,
            get_health_profile,
            set_autostart,
            get_autostart_setting,
            get_popup_position,
            get_all_monitors,
            set_popup_position,
        ])
        .on_window_event(|app, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let window = app.get_webview_window("main").unwrap();
                let app_handle = window.app_handle();
                
                // 获取应用状态
                let state = app_handle.state::<AppState>();
                let config = state.config_manager.get_config();
                let show_confirm = config.show_exit_confirm;
                println!("{:?}", show_confirm);
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
