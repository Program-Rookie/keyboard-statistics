use crate::database::KeyboardEventRecord;
use chrono::{DateTime, Local, Duration, NaiveDateTime, TimeZone};
use rusqlite::Connection;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use rusqlite::params;

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyStats {
    pub total_presses: u64,
    pub kpm: f64,
    pub most_used_keys: Vec<(String, u64)>,
    pub key_categories: HashMap<String, u64>,
    pub app_usage: HashMap<String, u64>,
    pub time_distribution: HashMap<String, u64>,
}

pub struct DataAnalyzer {
    conn: Connection,
}

impl DataAnalyzer {
    pub fn new(conn: Connection) -> Self {
        DataAnalyzer { conn }
    }

    pub fn get_stats(&self, time_range: &str) -> Result<KeyStats, rusqlite::Error> {
        let (start_time, end_time) = self.get_time_range(time_range)?;
        
        let total_presses = self.get_total_presses(&start_time, &end_time)?;
        let kpm = self.calculate_kpm(&start_time, &end_time)?;
        let most_used_keys = self.get_most_used_keys(&start_time, &end_time, 10)?;
        let key_categories = self.get_key_categories(&start_time, &end_time)?;
        let app_usage = self.get_app_usage(&start_time, &end_time)?;
        let time_distribution = self.get_time_distribution(&start_time, &end_time)?;

        Ok(KeyStats {
            total_presses,
            kpm,
            most_used_keys,
            key_categories,
            app_usage,
            time_distribution,
        })
    }

    fn get_time_range(&self, time_range: &str) -> Result<(DateTime<Local>, DateTime<Local>), rusqlite::Error> {
        let now = Local::now();
        let (start_time, end_time) = match time_range {
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
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        Ok((start_time, end_time))
    }

    fn get_total_presses(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) -> Result<u64, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM keyboard_events WHERE timestamp BETWEEN ?1 AND ?2"
        )?;
        let count: u64 = stmt.query_row(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| row.get(0)
        )?;
        Ok(count)
    }

    fn calculate_kpm(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) -> Result<f64, rusqlite::Error> {
        let duration = (*end_time - *start_time).num_minutes() as f64;
        if duration <= 0.0 {
            return Ok(0.0);
        }
        let total_presses = self.get_total_presses(start_time, end_time)?;
        Ok(total_presses as f64 / duration)
    }

    fn get_most_used_keys(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>, limit: usize) 
        -> Result<Vec<(String, u64)>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT key_code, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY key_code 
             ORDER BY count DESC 
             LIMIT ?3"
        )?;
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339(), limit],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?
                ))
            }
        )?;
        
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn get_key_categories(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) 
        -> Result<HashMap<String, u64>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT key_code, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY key_code"
        )?;
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?
                ))
            }
        )?;
        
        let mut categories = HashMap::new();
        for row in rows {
            let (key, count) = row?;
            let category = self.categorize_key(&key);
            *categories.entry(category).or_insert(0) += count;
        }
        Ok(categories)
    }

    fn get_app_usage(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) 
        -> Result<HashMap<String, u64>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT app_name, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY app_name"
        )?;
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?
                ))
            }
        )?;
        
        let mut app_usage = HashMap::new();
        for row in rows {
            let (app, count) = row?;
            app_usage.insert(app, count);
        }
        Ok(app_usage)
    }

    fn get_time_distribution(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) 
        -> Result<HashMap<String, u64>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT strftime('%H', timestamp) as hour, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY hour"
        )?;
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u64>(1)?
                ))
            }
        )?;
        
        let mut distribution = HashMap::new();
        for row in rows {
            let (hour, count) = row?;
            distribution.insert(hour, count);
        }
        Ok(distribution)
    }

    fn categorize_key(&self, key: &str) -> String {
        if key.len() == 1 && key.chars().next().unwrap().is_alphabetic() {
            "字母键".to_string()
        } else if key.len() == 1 && key.chars().next().unwrap().is_numeric() {
            "数字键".to_string()
        } else if key.len() == 1 && !key.chars().next().unwrap().is_alphanumeric() {
            "符号键".to_string()
        } else if key.contains("Ctrl") || key.contains("Alt") || key.contains("Shift") || key.contains("Win") {
            "修饰键".to_string()
        } else if key.contains("F") && key[1..].parse::<u32>().is_ok() {
            "功能键".to_string()
        } else if key.contains("Arrow") || key == "Home" || key == "End" || key == "PageUp" || key == "PageDown" {
            "导航键".to_string()
        } else if key == "Enter" || key == "Space" || key == "Tab" || key == "Backspace" || key == "Delete" {
            "编辑键".to_string()
        } else {
            "其他键".to_string()
        }
    }
} 