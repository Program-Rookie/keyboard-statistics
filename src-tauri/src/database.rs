use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Local};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardEventRecord {
    pub timestamp: DateTime<Local>,
    pub key_code: String,
    pub app_name: String,
    pub window_title: String,
}
use std::fs::{OpenOptions};
use std::io::{Write, BufWriter};

pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS keyboard_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            key_code TEXT NOT NULL,
            app_name TEXT NOT NULL,
            window_title TEXT NOT NULL
        )",
        [],
    )?;
    Ok(conn)
}

pub fn insert_event(conn: &Connection, event: &KeyboardEventRecord) -> Result<()> {
    conn.execute(
        "INSERT INTO keyboard_events (timestamp, key_code, app_name, window_title) VALUES (?1, ?2, ?3, ?4)",
        params![
            event.timestamp.to_rfc3339(),
            event.key_code,
            event.app_name,
            event.window_title
        ],
    )?;
    println!("Event inserted successfully!");
    Ok(())
}