use rusqlite::{Connection, Result, params};
use chrono::{DateTime, Local};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardEventRecord {
    pub timestamp: DateTime<Local>,
    pub key_code: String,
    pub app_name: String,
    pub window_title: String,
}

// 初始化数据库，创建必要的表
pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    
    // 创建键盘事件表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS keyboard_events (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            key_code TEXT NOT NULL,
            app_name TEXT NOT NULL,
            window_title TEXT NOT NULL
        )",
        [],
    )?;
    println!("创建键盘事件表成功");
    
    // 创建应用统计表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_stats (
            id INTEGER PRIMARY KEY,
            app_name TEXT UNIQUE NOT NULL,
            key_count INTEGER NOT NULL DEFAULT 0,
            last_used TEXT NOT NULL
        )",
        [],
    )?;
    println!("创建应用统计表成功");
    
    // 创建按键统计表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS key_stats (
            id INTEGER PRIMARY KEY,
            key_code TEXT UNIQUE NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    println!("创建按键统计表成功");
    
    Ok(conn)
}

// 插入键盘事件记录
pub fn insert_event(conn: &Connection, event: &KeyboardEventRecord) -> Result<()> {
    // 插入事件记录
    conn.execute(
        "INSERT INTO keyboard_events (timestamp, key_code, app_name, window_title) 
         VALUES (?1, ?2, ?3, ?4)",
        params![
            event.timestamp.to_rfc3339(),
            event.key_code,
            event.app_name,
            event.window_title
        ],
    )?;
    println!("插入事件记录成功");
    
    // 更新应用统计
    conn.execute(
        "INSERT INTO app_stats (app_name, key_count, last_used) 
         VALUES (?1, 1, ?2)
         ON CONFLICT(app_name) DO UPDATE SET 
         key_count = key_count + 1,
         last_used = ?2",
        params![
            event.app_name,
            event.timestamp.to_rfc3339()
        ],
    )?;
    println!("更新应用统计成功");
    
    // 更新按键统计
    conn.execute(
        "INSERT INTO key_stats (key_code, count) 
         VALUES (?1, 1)
         ON CONFLICT(key_code) DO UPDATE SET 
         count = count + 1",
        params![event.key_code],
    )?;
    println!("更新按键统计成功");
    Ok(())
}

// 查询指定时间范围内的按键事件
pub fn query_events_by_time_range(
    conn: &Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<Vec<KeyboardEventRecord>> {
    let mut stmt = conn.prepare(
        "SELECT timestamp, key_code, app_name, window_title 
         FROM keyboard_events 
         WHERE timestamp BETWEEN ?1 AND ?2
         ORDER BY timestamp DESC"
    )?;
    
    let events = stmt.query_map(
        params![start_time.to_rfc3339(), end_time.to_rfc3339()],
        |row| {
            let timestamp_str: String = row.get(0)?;
            let timestamp = DateTime::parse_from_rfc3339(&timestamp_str)
                .map(|dt| dt.with_timezone(&Local))
                .unwrap_or_else(|_| Local::now());
            
            Ok(KeyboardEventRecord {
                timestamp,
                key_code: row.get(1)?,
                app_name: row.get(2)?,
                window_title: row.get(3)?,
            })
        },
    )?;
    
    let mut result = Vec::new();
    for event in events {
        result.push(event?);
    }
    
    Ok(result)
}

// 获取总按键次数
pub fn get_total_key_count(conn: &Connection) -> Result<i64> {
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM keyboard_events")?;
    let count: i64 = stmt.query_row([], |row| row.get(0))?;
    Ok(count)
}

// 获取指定时间范围内的按键次数
pub fn get_key_count_by_time_range(
    conn: &Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<i64> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM keyboard_events 
         WHERE timestamp BETWEEN ?1 AND ?2"
    )?;
    
    let count: i64 = stmt.query_row(
        params![start_time.to_rfc3339(), end_time.to_rfc3339()],
        |row| row.get(0)
    )?;
    
    Ok(count)
}

// 获取最常用的按键列表
pub fn get_top_keys(conn: &Connection, limit: i64) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT key_code, count FROM key_stats 
         ORDER BY count DESC 
         LIMIT ?1"
    )?;
    
    let rows = stmt.query_map(params![limit], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

// 获取最常用的应用列表
pub fn get_top_apps(conn: &Connection, limit: i64) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT app_name, key_count FROM app_stats 
         ORDER BY key_count DESC 
         LIMIT ?1"
    )?;
    
    let rows = stmt.query_map(params![limit], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

// 计算指定时间范围内的平均KPM
pub fn calculate_average_kpm(
    conn: &Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<f64> {
    // 获取时间范围内的总按键次数
    let key_count = get_key_count_by_time_range(conn, start_time.clone(), end_time.clone())?;
    
    // 计算时间范围的分钟数
    let duration = end_time.signed_duration_since(start_time);
    let minutes = duration.num_minutes() as f64;
    
    if minutes > 0.0 {
        Ok(key_count as f64 / minutes)
    } else {
        Ok(0.0)
    }
}

// 清空所有数据
pub fn clear_all_data(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM keyboard_events", [])?;
    conn.execute("DELETE FROM app_stats", [])?;
    conn.execute("DELETE FROM key_stats", [])?;
    Ok(())
}