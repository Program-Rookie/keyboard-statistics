// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod analyzer;
pub mod keyboard;
pub mod database;
pub use analyzer::{DataAnalyzer, KeyStats};
use crate::database::{init_db, insert_event, KeyboardEventRecord};
use std::path::PathBuf;
use tauri::Manager;
use chrono::{DateTime, Local, Duration, NaiveDateTime, TimeZone, Datelike, Weekday};

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

// 获取根据最早数据记录调整后的时间范围
pub fn get_adjusted_time_range(conn: &rusqlite::Connection, time_range: &str) -> Result<(DateTime<Local>, DateTime<Local>), String> {
    let now = Local::now();
    
    // 获取最早的记录时间
    let first_event_time = match database::get_first_event_time(conn) {
        Ok(Some(time)) => time,
        Ok(None) => now - Duration::days(1), // 如果没有记录，默认为昨天
        Err(e) => return Err(format!("获取最早记录时间失败: {}", e)),
    };
    
    // 根据时间范围计算初始时间范围
    let (initial_start_time, end_time) = match time_range {
        "today" => {
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
    
    // 确保开始时间不早于最早记录时间
    let adjusted_start_time = if initial_start_time < first_event_time {
        first_event_time
    } else {
        initial_start_time
    };
    
    Ok((adjusted_start_time, end_time))
}