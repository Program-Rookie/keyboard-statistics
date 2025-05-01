// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod analyzer;
pub mod keyboard;
pub mod database;
pub use analyzer::{DataAnalyzer, KeyStats};
use crate::database::{init_db, insert_event, KeyboardEventRecord};

#[tauri::command]
fn get_key_stats(time_range: &str) -> Result<KeyStats, String> {
    let db_path = "keyboard_events.db";
    let conn = match crate::database::init_db(db_path) {
        Ok(c) => c,
        Err(e) => return Err(format!("数据库连接失败: {}", e)),
    };
    
    let analyzer = DataAnalyzer::new(conn);
    match analyzer.get_stats(time_range) {
        Ok(stats) => Ok(stats),
        Err(e) => Err(format!("获取统计数据失败: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_key_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
