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
    pub avg_kpm: f64,
    pub backspace_ratio: f64,
    pub most_used_keys: Vec<(String, u64)>,
    pub key_categories: HashMap<String, u64>,
    pub app_usage: HashMap<String, u64>,
    pub time_distribution: HashMap<String, u64>,
    pub prev_total_presses: u64,
    pub prev_avg_kpm: f64,
    pub prev_backspace_ratio: f64,
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
        let kpm = self.calculate_current_kpm()?;
        let avg_kpm = self.calculate_average_kpm(&start_time, &end_time)?;
        let backspace_ratio = self.calculate_backspace_ratio(&start_time, &end_time)?;
        let most_used_keys = self.get_most_used_keys(&start_time, &end_time, 10)?;
        let key_categories = self.get_key_categories(&start_time, &end_time)?;
        let app_usage = self.get_app_usage(&start_time, &end_time)?;
        let time_distribution = self.get_time_distribution(&start_time, &end_time)?;
        
        // 获取前一周期的统计数据
        let (prev_start_time, prev_end_time) = self.get_previous_time_range(time_range)?;
        let prev_total_presses = self.get_total_presses(&prev_start_time, &prev_end_time)?;
        let prev_avg_kpm = self.calculate_average_kpm(&prev_start_time, &prev_end_time)?;
        let prev_backspace_ratio = self.calculate_backspace_ratio(&prev_start_time, &prev_end_time)?;

        Ok(KeyStats {
            total_presses,
            kpm,
            avg_kpm,
            backspace_ratio,
            most_used_keys,
            key_categories,
            app_usage,
            time_distribution,
            prev_total_presses,
            prev_avg_kpm,
            prev_backspace_ratio,
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

    pub fn calculate_current_kpm(&self) -> Result<f64, rusqlite::Error> {
        let now = Local::now();
        let one_minute_ago = now - Duration::seconds(60);
        
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM keyboard_events WHERE timestamp BETWEEN ?1 AND ?2"
        )?;
        
        let count: u64 = stmt.query_row(
            params![one_minute_ago.to_rfc3339(), now.to_rfc3339()],
            |row| row.get(0)
        )?;
        
        Ok(count as f64)
    }

    fn calculate_average_kpm(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) -> Result<f64, rusqlite::Error> {
        let duration = (*end_time - *start_time).num_minutes() as f64;
        if duration <= 0.0 {
            return Ok(0.0);
        }
        let total_presses = self.get_total_presses(start_time, end_time)?;
        Ok(total_presses as f64 / duration)
    }

    fn calculate_backspace_ratio(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) -> Result<f64, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM keyboard_events WHERE key_code = 'Backspace' AND timestamp BETWEEN ?1 AND ?2"
        )?;
        
        let backspace_count: u64 = stmt.query_row(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| row.get(0)
        )?;
        
        let total = self.get_total_presses(start_time, end_time)?;
        
        if total > 0 {
            Ok((backspace_count as f64 / total as f64) * 100.0)
        } else {
            Ok(0.0)
        }
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
            "SELECT strftime('%H', datetime(timestamp, 'localtime')) as hour, COUNT(*) as count 
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

    fn get_previous_time_range(&self, time_range: &str) -> Result<(DateTime<Local>, DateTime<Local>), rusqlite::Error> {
        let now = Local::now();
        let (current_start, current_end) = self.get_time_range(time_range)?;
        
        let duration = current_end.signed_duration_since(current_start);
        
        let (prev_start_time, prev_end_time) = match time_range {
            "today" => {
                // 前一天的相同时间段
                let yesterday_end = current_start;
                let yesterday_start = yesterday_end - duration;
                (yesterday_start, yesterday_end)
            },
            "week" => {
                // 上一周
                let prev_week_end = current_start;
                let prev_week_start = prev_week_end - Duration::days(7);
                (prev_week_start, prev_week_end)
            },
            "month" => {
                // 上个月
                let prev_month_end = current_start;
                let prev_month_start = prev_month_end - Duration::days(30);
                (prev_month_start, prev_month_end)
            },
            "all" => {
                // 全部数据没有前一个周期的比较
                (current_start, current_end)
            },
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        
        Ok((prev_start_time, prev_end_time))
    }
} 