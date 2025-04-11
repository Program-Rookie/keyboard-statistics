// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::State;
use rusqlite::{Connection, Result};
use std::path::PathBuf;
use chrono::Local;

struct AppState {
    db: Mutex<Connection>,
    is_recording: Mutex<bool>,
}

#[tauri::command]
async fn start_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    *is_recording = true;
    Ok(())
}

#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    *is_recording = false;
    Ok(())
}

#[tauri::command]
async fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    // TODO: 实现数据导出逻辑
    Ok("数据导出成功".to_string())
}

fn main() {
    let app_dir = tauri::api::path::app_dir(&tauri::Config::default()).unwrap();
    let db_path = app_dir.join("keyboard_stats.db");
    
    let conn = Connection::open(db_path).expect("Failed to open database");
    
    // 创建表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS keystrokes (
            id INTEGER PRIMARY KEY,
            key_code INTEGER NOT NULL,
            timestamp DATETIME NOT NULL,
            application TEXT
        )",
        [],
    ).expect("Failed to create table");

    let app_state = AppState {
        db: Mutex::new(conn),
        is_recording: Mutex::new(false),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            export_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
