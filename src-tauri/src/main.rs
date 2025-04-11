// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyboard;
mod database;
mod analyzer;

use std::sync::Mutex;
use tauri::State;
use keyboard::{KeyboardListener, KeyEvent};
use database::Database;
use analyzer::Analyzer;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct KeyTypeCount {
    key_type: String,
    count: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct KeyCount {
    key_code: i32,
    count: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppCount {
    application: String,
    count: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HourCount {
    hour: i32,
    count: i64,
}

struct AppState {
    db: Mutex<Database>,
    is_recording: Mutex<bool>,
    keyboard_listener: Mutex<KeyboardListener>,
    analyzer: Mutex<Analyzer>,
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
    
    // 保存当前记录的按键事件
    let events = keyboard_listener.get_events();
    if !events.is_empty() {
        let db = state.db.lock().unwrap();
        if let Err(e) = db.save_key_events(&events, None) {
            return Err(format!("保存按键事件失败: {}", e));
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn get_key_events(state: State<'_, AppState>) -> Result<Vec<KeyEvent>, String> {
    let keyboard_listener = state.keyboard_listener.lock().unwrap();
    Ok(keyboard_listener.get_events())
}

#[tauri::command]
async fn get_total_keystrokes(state: State<'_, AppState>) -> Result<i64, String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.get_total_keystrokes().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_today_keystrokes(state: State<'_, AppState>) -> Result<i64, String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.get_today_keystrokes().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_this_week_keystrokes(state: State<'_, AppState>) -> Result<i64, String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.get_this_week_keystrokes().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_this_month_keystrokes(state: State<'_, AppState>) -> Result<i64, String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.get_this_month_keystrokes().map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_top_keys(state: State<'_, AppState>, limit: i64) -> Result<Vec<KeyCount>, String> {
    let analyzer = state.analyzer.lock().unwrap();
    let key_counts = analyzer.get_top_keys(limit).map_err(|e| e.to_string())?;
    
    Ok(key_counts.into_iter()
        .map(|(key_code, count)| KeyCount { key_code, count })
        .collect())
}

#[tauri::command]
async fn get_key_types(state: State<'_, AppState>) -> Result<Vec<KeyTypeCount>, String> {
    let analyzer = state.analyzer.lock().unwrap();
    let key_types = analyzer.analyze_key_types().map_err(|e| e.to_string())?;
    
    Ok(key_types.into_iter()
        .map(|(key_type, count)| KeyTypeCount { key_type, count })
        .collect())
}

#[tauri::command]
async fn get_top_applications(state: State<'_, AppState>, limit: i64) -> Result<Vec<AppCount>, String> {
    let analyzer = state.analyzer.lock().unwrap();
    let app_counts = analyzer.get_top_applications(limit).map_err(|e| e.to_string())?;
    
    Ok(app_counts.into_iter()
        .map(|(application, count)| AppCount { application, count })
        .collect())
}

#[tauri::command]
async fn get_keystrokes_by_hour(state: State<'_, AppState>) -> Result<Vec<HourCount>, String> {
    let analyzer = state.analyzer.lock().unwrap();
    let hour_counts = analyzer.get_keystrokes_by_hour().map_err(|e| e.to_string())?;
    
    Ok(hour_counts.into_iter()
        .map(|(hour, count)| HourCount { hour, count })
        .collect())
}

#[tauri::command]
async fn export_data(state: State<'_, AppState>, format: String) -> Result<String, String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.export_data(&format).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_data(state: State<'_, AppState>) -> Result<(), String> {
    let analyzer = state.analyzer.lock().unwrap();
    analyzer.clear_data().map_err(|e| e.to_string())
}

#[tauri::command]
async fn assess_health_risk(state: State<'_, AppState>, daily_hours: f64) -> Result<String, String> {
    let analyzer = state.analyzer.lock().unwrap();
    Ok(analyzer.assess_health_risk(daily_hours))
}

fn main() {
    let app_dir = tauri::api::path::app_data_dir(&tauri::Config::default()).unwrap();
    let db_path = app_dir.join("keyboard_stats.db");
    
    let db = Database::new(&db_path).expect("Failed to open database");
    let analyzer = Analyzer::new(db.clone());
    
    let app_state = AppState {
        db: Mutex::new(db),
        is_recording: Mutex::new(false),
        keyboard_listener: Mutex::new(KeyboardListener::new()),
        analyzer: Mutex::new(analyzer),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_key_events,
            get_total_keystrokes,
            get_today_keystrokes,
            get_this_week_keystrokes,
            get_this_month_keystrokes,
            get_top_keys,
            get_key_types,
            get_top_applications,
            get_keystrokes_by_hour,
            export_data,
            clear_data,
            assess_health_risk
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
