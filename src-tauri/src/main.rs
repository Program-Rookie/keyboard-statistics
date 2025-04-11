// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyboard;

use std::sync::Mutex;
use tauri::State;
use rusqlite::{Connection, Result};
use keyboard::{KeyboardListener, KeyEvent};

struct AppState {
    db: Mutex<Connection>,
    is_recording: Mutex<bool>,
    keyboard_listener: Mutex<KeyboardListener>,
}

#[tauri::command]
async fn start_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    *is_recording = true;
    
    let keyboard_listener = state.keyboard_listener.lock().unwrap();
    keyboard_listener.start();
    
    Ok(())
}

#[tauri::command]
async fn stop_recording(state: State<'_, AppState>) -> Result<(), String> {
    let mut is_recording = state.is_recording.lock().unwrap();
    *is_recording = false;
    
    let keyboard_listener = state.keyboard_listener.lock().unwrap();
    keyboard_listener.stop();
    
    Ok(())
}

#[tauri::command]
async fn get_key_events(state: State<'_, AppState>) -> Result<Vec<KeyEvent>, String> {
    let keyboard_listener = state.keyboard_listener.lock().unwrap();
    Ok(keyboard_listener.get_events())
}

#[tauri::command]
async fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    let _db = state.db.lock().unwrap();
    // TODO: 实现数据导出逻辑
    Ok("数据导出成功".to_string())
}

fn main() {
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default()).unwrap();
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
        keyboard_listener: Mutex::new(KeyboardListener::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_key_events,
            export_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
