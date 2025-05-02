// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod analyzer;
pub mod keyboard;
pub mod database;
pub use analyzer::{DataAnalyzer, KeyStats};
use crate::database::{init_db, insert_event, KeyboardEventRecord};
use std::path::PathBuf;
use tauri::Manager;

pub fn get_key_stats(app: tauri::AppHandle, time_range: &str) -> Result<KeyStats, String> {
    // 使用应用数据目录来获取数据库路径
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    println!("使用数据库路径: {}", db_path_str);
    
    let conn = match crate::database::init_db(db_path_str) {
        Ok(c) => c,
        Err(e) => return Err(format!("数据库连接失败: {}", e)),
    };
    
    let analyzer = DataAnalyzer::new(conn);
    match analyzer.get_stats(time_range) {
        Ok(stats) => Ok(stats),
        Err(e) => Err(format!("获取统计数据失败: {}", e)),
    }
}

pub fn get_current_kpm(app: tauri::AppHandle) -> Result<f64, String> {
    // 使用应用数据目录来获取数据库路径
    let app_dir = app.path().app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    
    let db_path = app_dir.join("keyboard_events.db");
    let db_path_str = db_path.to_str()
        .ok_or_else(|| "无法将路径转换为字符串".to_string())?;
    
    let conn = match crate::database::init_db(db_path_str) {
        Ok(c) => c,
        Err(e) => return Err(format!("数据库连接失败: {}", e)),
    };
    
    let analyzer = DataAnalyzer::new(conn);
    match analyzer.calculate_current_kpm() {
        Ok(kpm) => Ok(kpm),
        Err(e) => Err(format!("获取当前KPM失败: {}", e)),
    }
}