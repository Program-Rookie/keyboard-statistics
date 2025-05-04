use crate::database::KeyboardEventRecord;
use chrono::{DateTime, Local, Duration, NaiveDateTime, TimeZone, Datelike, Weekday};
use rusqlite::Connection;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use rusqlite::params;

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyCombo {
    pub combo: String,
    pub count: u64,
}

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
    pub activity_heatmap: HashMap<String, u64>,
    pub key_combos: Vec<KeyCombo>,
    pub app_time_distribution: Vec<AppTimeData>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppTimeData {
    pub label: String,
    pub data: Vec<u64>,
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
        let activity_heatmap = self.get_activity_heatmap(time_range)?;
        let key_combos = self.get_key_combos(&start_time, &end_time, 10)?;
        let app_time_distribution = self.get_app_time_distribution(&start_time, &end_time)?;
        
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
            activity_heatmap,
            key_combos,
            app_time_distribution,
        })
    }

    fn get_time_range(&self, time_range: &str) -> Result<(DateTime<Local>, DateTime<Local>), rusqlite::Error> {
        let now = Local::now();
        
        // 获取最早的记录时间
        let first_event_time = match crate::database::get_first_event_time(&self.conn)? {
            Some(time) => time,
            None => now - Duration::days(1)  // 如果没有记录，默认为昨天
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
            "all" => {
                // 365天前的时间
                let year_ago = now - Duration::days(365);
                
                // 取最早记录时间和365天前中的较新者作为开始时间
                let start_time = if first_event_time > year_ago {
                    first_event_time
                } else {
                    year_ago
                };
                
                (start_time, now)
            },
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        
        // 确保开始时间不早于最早记录时间
        let adjusted_start_time = if initial_start_time < first_event_time {
            first_event_time
        } else {
            initial_start_time
        };
        
        Ok((adjusted_start_time, end_time))
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
        } else if key.contains("Arrow") || key == "Home" || key == "End" || key == "PageUp" || key == "PageDown" || key == "↑" || key == "↓" {
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

    // 获取活动热力图数据
    fn get_activity_heatmap(&self, time_range: &str) -> Result<HashMap<String, u64>, rusqlite::Error> {
        match time_range {
            "today" => self.get_today_heatmap(),
            "week" => self.get_week_heatmap(),
            "month" => self.get_month_heatmap(),
            "all" => self.get_all_time_heatmap(),
            _ => Err(rusqlite::Error::InvalidQuery),
        }
    }

    // 获取今日活动热力图（按小时分布）
    fn get_today_heatmap(&self) -> Result<HashMap<String, u64>, rusqlite::Error> {
        let (start_time, end_time) = self.get_time_range("today")?;
        
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
        
        let mut heatmap = HashMap::new();
        for row in rows {
            let (hour, count) = row?;
            heatmap.insert(format!("h_{}", hour), count);
        }
        
        // 添加元数据以便前端区分热力图类型
        heatmap.insert("type".to_string(), 1); // 1表示按小时的今日热力图
        
        Ok(heatmap)
    }

    // 获取本周活动热力图（按星期和小时分布）
    fn get_week_heatmap(&self) -> Result<HashMap<String, u64>, rusqlite::Error> {
        let (start_time, end_time) = self.get_time_range("week")?;
        
        let mut stmt = self.conn.prepare(
            "SELECT 
                strftime('%w', datetime(timestamp, 'localtime')) as day_of_week,
                strftime('%H', datetime(timestamp, 'localtime')) as hour, 
                COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY day_of_week, hour"
        )?;
        
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?
                ))
            }
        )?;
        
        let mut heatmap = HashMap::new();
        for row in rows {
            let (day, hour, count) = row?;
            // 使用格式"d_h"存储：d为星期几(0-6，0为周日)，h为小时(0-23)
            heatmap.insert(format!("d{}_h{}", day, hour), count);
        }
        
        // 添加元数据以便前端区分热力图类型
        heatmap.insert("type".to_string(), 2); // 2表示按星期和小时的周热力图
        
        Ok(heatmap)
    }

    // 获取本月活动热力图（按日期和小时分布）
    fn get_month_heatmap(&self) -> Result<HashMap<String, u64>, rusqlite::Error> {
        let (start_time, end_time) = self.get_time_range("month")?;
        
        let mut stmt = self.conn.prepare(
            "SELECT 
                strftime('%d', datetime(timestamp, 'localtime')) as day,
                strftime('%H', datetime(timestamp, 'localtime')) as hour, 
                COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             GROUP BY day, hour"
        )?;
        
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?
                ))
            }
        )?;
        
        let mut heatmap = HashMap::new();
        for row in rows {
            let (day, hour, count) = row?;
            // 确保格式与前端期望的格式一致：d01_h00表示1日0时
            heatmap.insert(format!("d{}_h{}", day, hour), count);
        }
        
        // 添加元数据以便前端区分热力图类型
        heatmap.insert("type".to_string(), 3); // 3表示按日期和小时的月热力图
        
        Ok(heatmap)
    }

    // 获取所有时间活动热力图（按星期和小时的汇总）
    fn get_all_time_heatmap(&self) -> Result<HashMap<String, u64>, rusqlite::Error> {
        // 对于全部数据，我们按星期几和小时汇总
        let mut stmt = self.conn.prepare(
            "SELECT 
                strftime('%w', datetime(timestamp, 'localtime')) as day_of_week,
                strftime('%H', datetime(timestamp, 'localtime')) as hour, 
                COUNT(*) as count 
             FROM keyboard_events 
             GROUP BY day_of_week, hour"
        )?;
        
        let rows = stmt.query_map(
            params![],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u64>(2)?
                ))
            }
        )?;
        
        let mut heatmap = HashMap::new();
        for row in rows {
            let (day, hour, count) = row?;
            // 确保格式与前端期望的格式一致：d0_h00表示周日0时
            heatmap.insert(format!("d{}_h{}", day, hour), count);
        }
        
        // 添加元数据以便前端区分热力图类型
        heatmap.insert("type".to_string(), 4); // 4表示所有时间的热力图
        
        Ok(heatmap)
    }

    // 获取常用组合键
    fn get_key_combos(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>, limit: usize) 
        -> Result<Vec<KeyCombo>, rusqlite::Error> {
        // 查询组合键使用情况
        let mut stmt = self.conn.prepare(
            "SELECT key_code, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2 
             AND key_code LIKE '%+%' 
             GROUP BY key_code 
             ORDER BY count DESC 
             LIMIT ?3"
        )?;
        
        let rows = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339(), limit as i64],
            |row| {
                Ok(KeyCombo {
                    combo: row.get::<_, String>(0)?,
                    count: row.get::<_, u64>(1)?
                })
            }
        )?;
        
        let mut combos = Vec::new();
        for row in rows {
            combos.push(row?);
        }
        
        Ok(combos)
    }
    
    // 获取应用时间分布数据
    fn get_app_time_distribution(&self, start_time: &DateTime<Local>, end_time: &DateTime<Local>) 
        -> Result<Vec<AppTimeData>, rusqlite::Error> {
        // 获取前5个最常用的应用
        let mut app_usage = self.get_app_usage(start_time, end_time)?;
        let mut top_apps: Vec<_> = app_usage.iter()
            .map(|(app, count)| (app.clone(), *count))
            .collect();
            
        // 按使用量降序排序
        top_apps.sort_by(|a, b| b.1.cmp(&a.1));
        
        // 获取前5个应用
        let top_apps = if top_apps.len() > 5 {
            top_apps[0..5].to_vec()
        } else {
            top_apps
        };
        
        // 准备返回结果
        let mut result = Vec::new();
        
        // 对于每个应用，获取其24小时的使用分布
        for (app_name, _) in &top_apps {
            // 查询该应用在24小时内的使用分布
            let mut stmt = self.conn.prepare(
                "SELECT strftime('%H', datetime(timestamp, 'localtime')) as hour, COUNT(*) as count 
                 FROM keyboard_events 
                 WHERE timestamp BETWEEN ?1 AND ?2 
                 AND app_name = ?3
                 GROUP BY hour
                 ORDER BY hour"
            )?;
            
            let hour_rows = stmt.query_map(
                params![start_time.to_rfc3339(), end_time.to_rfc3339(), app_name],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, u64>(1)?
                    ))
                }
            )?;
            
            // 创建24小时的数据数组，初始化为0
            let mut hourly_data = vec![0u64; 24];
            
            // 填充实际数据
            for hour_row in hour_rows {
                if let Ok((hour_str, count)) = hour_row {
                    if let Ok(hour) = hour_str.parse::<usize>() {
                        if hour < 24 {
                            hourly_data[hour] = count;
                        }
                    }
                }
            }
            
            // 添加到结果
            result.push(AppTimeData {
                label: app_name.clone(),
                data: hourly_data,
            });
        }
        
        Ok(result)
    }
} 