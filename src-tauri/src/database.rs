use rusqlite::{Connection, Result, params};
use std::path::Path;
use std::sync::{Mutex, Arc};
use chrono::{DateTime, Local};
use crate::keyboard::KeyEvent;
use serde_json;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // 创建表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS keystrokes (
                id INTEGER PRIMARY KEY,
                key_code INTEGER NOT NULL,
                timestamp DATETIME NOT NULL,
                application TEXT
            )",
            [],
        )?;
        
        Ok(Database {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
    
    pub fn get_connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
    
    pub fn save_key_event(&self, event: &KeyEvent, application: Option<&str>) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO keystrokes (key_code, timestamp, application) VALUES (?1, ?2, ?3)",
            params![
                event.key_code,
                event.timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
                application,
            ],
        )?;
        Ok(())
    }
    
    pub fn save_key_events(&self, events: &[KeyEvent], application: Option<&str>) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        
        for event in events {
            tx.execute(
                "INSERT INTO keystrokes (key_code, timestamp, application) VALUES (?1, ?2, ?3)",
                params![
                    event.key_code,
                    event.timestamp.format("%Y-%m-%d %H:%M:%S").to_string(),
                    application,
                ],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    }
    
    pub fn get_total_keystrokes(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM keystrokes",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    pub fn get_keystrokes_by_date(&self, date: &DateTime<Local>) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let date_str = date.format("%Y-%m-%d").to_string();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM keystrokes WHERE date(timestamp) = ?1",
            params![date_str],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    pub fn get_keystrokes_by_key(&self, key_code: i32) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM keystrokes WHERE key_code = ?1",
            params![key_code],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    pub fn get_top_keys(&self, limit: i64) -> Result<Vec<(i32, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT key_code, COUNT(*) as count 
             FROM keystrokes 
             GROUP BY key_code 
             ORDER BY count DESC 
             LIMIT ?1"
        )?;
        
        let key_counts = stmt.query_map([limit], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
        
        let mut result = Vec::new();
        for key_count in key_counts {
            result.push(key_count?);
        }
        
        Ok(result)
    }
    
    pub fn get_keystrokes_by_application(&self, application: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM keystrokes WHERE application = ?1",
            params![application],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    pub fn get_top_applications(&self, limit: i64) -> Result<Vec<(String, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT application, COUNT(*) as count 
             FROM keystrokes 
             WHERE application IS NOT NULL
             GROUP BY application 
             ORDER BY count DESC 
             LIMIT ?1"
        )?;
        
        let app_counts = stmt.query_map([limit], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
        
        let mut result = Vec::new();
        for app_count in app_counts {
            result.push(app_count?);
        }
        
        Ok(result)
    }
    
    pub fn get_keystrokes_by_hour(&self) -> Result<Vec<(i32, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count 
             FROM keystrokes 
             GROUP BY hour 
             ORDER BY hour"
        )?;
        
        let hour_counts = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
        
        let mut result = Vec::new();
        for hour_count in hour_counts {
            result.push(hour_count?);
        }
        
        Ok(result)
    }
    
    pub fn export_data(&self, format: &str) -> Result<String> {
        match format {
            "json" => self.export_json(),
            "csv" => self.export_csv(),
            _ => Err(rusqlite::Error::InvalidParameterName("Unsupported format".to_string())),
        }
    }
    
    fn export_json(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT key_code, timestamp, application FROM keystrokes ORDER BY timestamp"
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "key_code": row.get::<_, i32>(0)?,
                "timestamp": row.get::<_, String>(1)?,
                "application": row.get::<_, Option<String>>(2)?,
            }))
        })?;
        
        let mut data = Vec::new();
        for row in rows {
            data.push(row?);
        }
        
        serde_json::to_string_pretty(&data).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))
    }
    
    fn export_csv(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT key_code, timestamp, application FROM keystrokes ORDER BY timestamp"
        )?;
        
        let mut csv = String::from("key_code,timestamp,application\n");
        
        let rows = stmt.query_map([], |row| {
            let key_code: i32 = row.get(0)?;
            let timestamp: String = row.get(1)?;
            let application: Option<String> = row.get(2)?;
            
            let app_str = application.unwrap_or_default();
            Ok(format!("{},{},{}\n", key_code, timestamp, app_str))
        })?;
        
        for row in rows {
            csv.push_str(&row?);
        }
        
        Ok(csv)
    }
    
    pub fn clear_data(&self) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM keystrokes", [])?;
        Ok(())
    }
    
    pub fn clear_data_by_date_range(&self, start_date: &DateTime<Local>, end_date: &DateTime<Local>) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let start_str = start_date.format("%Y-%m-%d").to_string();
        let end_str = end_date.format("%Y-%m-%d").to_string();
        
        conn.execute(
            "DELETE FROM keystrokes WHERE date(timestamp) BETWEEN ?1 AND ?2",
            params![start_str, end_str],
        )?;
        Ok(())
    }
} 