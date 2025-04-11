use chrono::{DateTime, Local, Duration, Datelike};
use std::collections::HashMap;
use crate::keyboard::KeyEvent;
use crate::database::Database;

pub struct Analyzer {
    db: Database,
}

impl Analyzer {
    pub fn new(db: Database) -> Self {
        Analyzer { db }
    }
    
    // 计算总按键次数
    pub fn get_total_keystrokes(&self) -> Result<i64, rusqlite::Error> {
        self.db.get_total_keystrokes()
    }
    
    // 计算今日按键次数
    pub fn get_today_keystrokes(&self) -> Result<i64, rusqlite::Error> {
        let today = Local::now();
        self.db.get_keystrokes_by_date(&today)
    }
    
    // 计算本周按键次数
    pub fn get_this_week_keystrokes(&self) -> Result<i64, rusqlite::Error> {
        let today = Local::now();
        let week_start = today - Duration::days(today.weekday().num_days_from_monday() as i64);
        let week_end = today;
        
        self.get_keystrokes_in_date_range(&week_start, &week_end)
    }
    
    // 计算本月按键次数
    pub fn get_this_month_keystrokes(&self) -> Result<i64, rusqlite::Error> {
        let today = Local::now();
        let month_start = today.with_day(1).unwrap();
        let month_end = today;
        
        self.get_keystrokes_in_date_range(&month_start, &month_end)
    }
    
    // 计算指定日期范围内的按键次数
    pub fn get_keystrokes_in_date_range(&self, start_date: &DateTime<Local>, end_date: &DateTime<Local>) -> Result<i64, rusqlite::Error> {
        let start_str = start_date.format("%Y-%m-%d").to_string();
        let end_str = end_date.format("%Y-%m-%d").to_string();
        
        let conn = self.db.get_connection();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM keystrokes WHERE date(timestamp) BETWEEN ?1 AND ?2",
            rusqlite::params![start_str, end_str],
            |row| row.get(0),
        )?;
        Ok(count)
    }
    
    // 计算按键频率 (KPM - Keys Per Minute)
    pub fn calculate_kpm(&self, events: &[KeyEvent]) -> f64 {
        if events.len() < 2 {
            return 0.0;
        }
        
        let first_time = events.first().unwrap().timestamp;
        let last_time = events.last().unwrap().timestamp;
        
        let duration_minutes = (last_time - first_time).num_seconds() as f64 / 60.0;
        if duration_minutes <= 0.0 {
            return 0.0;
        }
        
        events.len() as f64 / duration_minutes
    }
    
    // 获取最常用的按键
    pub fn get_top_keys(&self, limit: i64) -> Result<Vec<(i32, i64)>, rusqlite::Error> {
        self.db.get_top_keys(limit)
    }
    
    // 获取最常用的应用程序
    pub fn get_top_applications(&self, limit: i64) -> Result<Vec<(String, i64)>, rusqlite::Error> {
        self.db.get_top_applications(limit)
    }
    
    // 获取按小时分布的按键次数
    pub fn get_keystrokes_by_hour(&self) -> Result<Vec<(i32, i64)>, rusqlite::Error> {
        self.db.get_keystrokes_by_hour()
    }
    
    // 获取按星期几分布的按键次数
    pub fn get_keystrokes_by_weekday(&self) -> Result<Vec<(i32, i64)>, rusqlite::Error> {
        let conn = self.db.get_connection();
        let mut stmt = conn.prepare(
            "SELECT CAST(strftime('%w', timestamp) AS INTEGER) as weekday, COUNT(*) as count 
             FROM keystrokes 
             GROUP BY weekday 
             ORDER BY weekday"
        )?;
        
        let weekday_counts = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
        
        let mut result = Vec::new();
        for weekday_count in weekday_counts {
            result.push(weekday_count?);
        }
        
        Ok(result)
    }
    
    // 分析按键类型分布
    pub fn analyze_key_types(&self) -> Result<HashMap<String, i64>, rusqlite::Error> {
        let conn = self.db.get_connection();
        let mut stmt = conn.prepare(
            "SELECT key_code, COUNT(*) as count FROM keystrokes GROUP BY key_code"
        )?;
        
        let key_counts = stmt.query_map([], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?))
        })?;
        
        let mut result = HashMap::new();
        result.insert("字母键".to_string(), 0);
        result.insert("数字键".to_string(), 0);
        result.insert("功能键".to_string(), 0);
        result.insert("修饰键".to_string(), 0);
        result.insert("其他键".to_string(), 0);
        
        for key_count in key_counts {
            let (key_code, count) = key_count?;
            
            // 根据键码分类
            if (65..=90).contains(&key_code) {
                *result.get_mut("字母键").unwrap() += count;
            } else if (48..=57).contains(&key_code) {
                *result.get_mut("数字键").unwrap() += count;
            } else if (112..=123).contains(&key_code) {
                *result.get_mut("功能键").unwrap() += count;
            } else if [16, 17, 18, 91, 92].contains(&key_code) {
                *result.get_mut("修饰键").unwrap() += count;
            } else {
                *result.get_mut("其他键").unwrap() += count;
            }
        }
        
        Ok(result)
    }
    
    // 导出数据
    pub fn export_data(&self, format: &str) -> Result<String, rusqlite::Error> {
        self.db.export_data(format)
    }
    
    // 清除数据
    pub fn clear_data(&self) -> Result<(), rusqlite::Error> {
        self.db.clear_data()
    }
    
    // 清除指定日期范围的数据
    pub fn clear_data_by_date_range(&self, start_date: &DateTime<Local>, end_date: &DateTime<Local>) -> Result<(), rusqlite::Error> {
        self.db.clear_data_by_date_range(start_date, end_date)
    }
    
    // 基础健康风险评估
    pub fn assess_health_risk(&self, daily_hours: f64) -> String {
        let today_keystrokes = match self.get_today_keystrokes() {
            Ok(count) => count,
            Err(_) => 0,
        };
        
        let kpm = if daily_hours > 0.0 {
            today_keystrokes as f64 / (daily_hours * 60.0)
        } else {
            0.0
        };
        
        // 简单的风险评估逻辑
        if kpm > 300.0 && daily_hours > 6.0 {
            "警告：您的按键频率和使用时间较高，请注意休息，避免重复性劳损。".to_string()
        } else if kpm > 200.0 && daily_hours > 4.0 {
            "提示：您的按键频率和使用时间适中，建议定期休息，保持良好姿势。".to_string()
        } else {
            "您的按键使用情况良好，继续保持！".to_string()
        }
    }
} 