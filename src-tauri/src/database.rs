use rusqlite::{Connection, Result, params};
use chrono::{DateTime, Local};
use serde::{Serialize, Deserialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyboardEventRecord {
    pub timestamp: DateTime<Local>,
    pub key_code: String,
    pub app_name: String,
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
            app_name TEXT NOT NULL
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
        "INSERT INTO keyboard_events (timestamp, key_code, app_name) 
         VALUES (?1, ?2, ?3)",
        params![
            event.timestamp.to_rfc3339(),
            event.key_code,
            event.app_name
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
        "SELECT timestamp, key_code, app_name 
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
pub fn clear_all_data(conn: &mut Connection) -> Result<()> {
    conn.execute("DELETE FROM keyboard_events", [])?;
    conn.execute("DELETE FROM app_stats", [])?;
    conn.execute("DELETE FROM key_stats", [])?;
    Ok(())
}

// 导出数据为JSON格式
pub fn export_data_as_json(
    conn: &Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<String> {
    let mut events = query_events_by_time_range(conn, start_time, end_time)?;
    
    // 使用serde_json::Value手动构建JSON以添加额外字段
    let json_events: Vec<serde_json::Value> = events.iter().map(|event| {
        let mut map = serde_json::Map::new();
        map.insert("readable_time".to_string(), serde_json::Value::String(event.timestamp.format("%Y-%m-%d %H:%M:%S").to_string()));
        map.insert("key_code".to_string(), serde_json::Value::String(event.key_code.clone()));
        map.insert("app_name".to_string(), serde_json::Value::String(event.app_name.clone()));
        serde_json::Value::Object(map)
    }).collect();
    
    let json = serde_json::to_string_pretty(&json_events)
        .map_err(|e| rusqlite::Error::InvalidQuery)?; // 简单转换错误类型
    Ok(json)
}

// 导出数据为CSV格式
pub fn export_data_as_csv(
    conn: &Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<String> {
    let events = query_events_by_time_range(conn, start_time, end_time)?;
    
    let mut csv_content = String::from("readable_time,key_code,app_name\n");
    for event in events {
        // 格式化时间戳为易读格式
        let readable_time = event.timestamp.format("%Y-%m-%d %H:%M:%S").to_string();
        
        // 简单处理CSV，实际项目中可能需要更复杂的转义处理
        let line = format!("{},\"{}\",\"{}\"\n",
            readable_time,
            event.key_code.replace(',', "\\,"),
            event.app_name.replace('"', "\"\"")
        );
        csv_content.push_str(&line);
    }
    
    Ok(csv_content)
}

// 删除指定时间范围内的数据
pub fn delete_data_by_time_range(
    conn: &mut Connection, 
    start_time: DateTime<Local>, 
    end_time: DateTime<Local>
) -> Result<usize> {
    // 获取要删除的按键记录和应用记录
    let key_counts: Vec<(String, i64)>;
    let app_counts: Vec<(String, i64)>;
    
    // 在独立作用域中获取数据，确保stmt被释放
    {
        let mut stmt = conn.prepare(
            "SELECT key_code, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2
             GROUP BY key_code"
        )?;
        
        key_counts = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        )?
        .filter_map(|r| r.ok())
        .collect();
    }
    
    // 在独立作用域中获取数据，确保stmt被释放
    {
        let mut stmt = conn.prepare(
            "SELECT app_name, COUNT(*) as count 
             FROM keyboard_events 
             WHERE timestamp BETWEEN ?1 AND ?2
             GROUP BY app_name"
        )?;
        
        app_counts = stmt.query_map(
            params![start_time.to_rfc3339(), end_time.to_rfc3339()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        )?
        .filter_map(|r| r.ok())
        .collect();
    }
    
    // 开始事务
    let tx = conn.transaction()?;
    
    // 删除键盘事件记录
    let deleted_count = tx.execute(
        "DELETE FROM keyboard_events 
         WHERE timestamp BETWEEN ?1 AND ?2",
        params![start_time.to_rfc3339(), end_time.to_rfc3339()],
    )?;
    
    // 更新按键统计
    for (key, count) in key_counts {
        tx.execute(
            "UPDATE key_stats 
             SET count = count - ?1 
             WHERE key_code = ?2",
            params![count, key],
        )?;
        
        // 删除计数为0的记录
        tx.execute(
            "DELETE FROM key_stats 
             WHERE count <= 0",
            [],
        )?;
    }
    
    // 更新应用统计
    for (app, count) in app_counts {
        tx.execute(
            "UPDATE app_stats 
             SET key_count = key_count - ?1 
             WHERE app_name = ?2",
            params![count, app],
        )?;
        
        // 删除计数为0的记录
        tx.execute(
            "DELETE FROM app_stats 
             WHERE key_count <= 0",
            [],
        )?;
    }
    
    // 提交事务
    tx.commit()?;
    
    Ok(deleted_count)
}

// 导出统计摘要为JSON格式
pub fn export_summary_as_json(
    conn: &Connection,
    start_time: DateTime<Local>,
    end_time: DateTime<Local>
) -> Result<String> {
    // 获取最常用的10个按键
    let top_keys = get_top_keys(conn, 10)?;
    
    // 获取最常用的10个应用
    let top_apps = get_top_apps(conn, 10)?;
    
    // 获取指定时间范围内的总按键次数
    let total_key_count = get_key_count_by_time_range(conn, start_time.clone(), end_time.clone())?;
    
    // 计算时间范围内的平均KPM
    let avg_kpm = calculate_average_kpm(conn, start_time.clone(), end_time.clone())?;
    
    // 使用serde_json构建JSON
    let mut summary = serde_json::Map::new();
    
    // 添加时间范围信息
    summary.insert("start_time".to_string(), serde_json::Value::String(start_time.format("%Y-%m-%d %H:%M:%S").to_string()));
    summary.insert("end_time".to_string(), serde_json::Value::String(end_time.format("%Y-%m-%d %H:%M:%S").to_string()));
    
    // 添加总按键数
    summary.insert("total_key_count".to_string(), serde_json::Value::Number(serde_json::Number::from(total_key_count)));
    
    // 添加平均KPM
    summary.insert("average_kpm".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(avg_kpm).unwrap_or(serde_json::Number::from(0))));
    
    // 添加最常用按键
    let keys_json: Vec<serde_json::Value> = top_keys.iter().map(|(key, count)| {
        let mut key_obj = serde_json::Map::new();
        key_obj.insert("key_code".to_string(), serde_json::Value::String(key.clone()));
        key_obj.insert("count".to_string(), serde_json::Value::Number(serde_json::Number::from(*count)));
        serde_json::Value::Object(key_obj)
    }).collect();
    summary.insert("top_keys".to_string(), serde_json::Value::Array(keys_json));
    
    // 添加最常用应用
    let apps_json: Vec<serde_json::Value> = top_apps.iter().map(|(app, count)| {
        let mut app_obj = serde_json::Map::new();
        app_obj.insert("app_name".to_string(), serde_json::Value::String(app.clone()));
        app_obj.insert("key_count".to_string(), serde_json::Value::Number(serde_json::Number::from(*count)));
        serde_json::Value::Object(app_obj)
    }).collect();
    summary.insert("top_apps".to_string(), serde_json::Value::Array(apps_json));
    
    // 添加导出时间
    let export_time = Local::now();
    summary.insert("export_time".to_string(), serde_json::Value::String(export_time.format("%Y-%m-%d %H:%M:%S").to_string()));
    
    // 转换为JSON字符串
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(summary))
        .map_err(|_| rusqlite::Error::InvalidQuery)?;
    
    Ok(json)
}

// 导出统计摘要为CSV格式
pub fn export_summary_as_csv(
    conn: &Connection,
    start_time: DateTime<Local>,
    end_time: DateTime<Local>
) -> Result<String> {
    // 获取最常用的10个按键
    let top_keys = get_top_keys(conn, 10)?;
    
    // 获取最常用的10个应用
    let top_apps = get_top_apps(conn, 10)?;
    
    // 获取指定时间范围内的总按键次数
    let total_key_count = get_key_count_by_time_range(conn, start_time.clone(), end_time.clone())?;
    
    // 计算时间范围内的平均KPM
    let avg_kpm = calculate_average_kpm(conn, start_time.clone(), end_time.clone())?;
    
    // 构建CSV内容
    let mut csv_content = String::new();
    
    // 添加时间范围信息
    csv_content.push_str(&format!("开始时间,{}\n", start_time.format("%Y-%m-%d %H:%M:%S")));
    csv_content.push_str(&format!("结束时间,{}\n", end_time.format("%Y-%m-%d %H:%M:%S")));
    
    // 添加导出时间
    let export_time = Local::now();
    csv_content.push_str(&format!("导出时间,{}\n", export_time.format("%Y-%m-%d %H:%M:%S")));
    
    // 添加总按键数和平均KPM
    csv_content.push_str(&format!("总按键次数,{}\n", total_key_count));
    csv_content.push_str(&format!("平均KPM,{:.2}\n\n", avg_kpm));
    
    // 添加最常用按键统计
    csv_content.push_str("最常用按键\n");
    csv_content.push_str("按键,次数\n");
    for (key, count) in top_keys {
        csv_content.push_str(&format!("\"{}\",{}\n", key.replace('"', "\"\""), count));
    }
    
    // 换行
    csv_content.push_str("\n");
    
    // 添加最常用应用统计
    csv_content.push_str("最常用应用\n");
    csv_content.push_str("应用名称,按键次数\n");
    for (app, count) in top_apps {
        csv_content.push_str(&format!("\"{}\",{}\n", app.replace('"', "\"\""), count));
    }
    
    Ok(csv_content)
}

// 识别连续输入时段，用于健康风险评估
pub fn identify_continuous_typing_sessions(
    conn: &Connection,
    start_time: DateTime<Local>,
    end_time: DateTime<Local>,
    max_gap_seconds: i64
) -> Result<Vec<(DateTime<Local>, DateTime<Local>, i64)>> {
    // 查询指定时间范围内的键盘事件
    let mut stmt = conn.prepare(
        "SELECT timestamp FROM keyboard_events 
         WHERE timestamp BETWEEN ?1 AND ?2
         ORDER BY timestamp ASC"
    )?;
    
    let timestamp_rows = stmt.query_map(
        params![start_time.to_rfc3339(), end_time.to_rfc3339()],
        |row| {
            let timestamp_str: String = row.get(0)?;
            let timestamp = DateTime::parse_from_rfc3339(&timestamp_str)
                .map(|dt| dt.with_timezone(&Local))
                .unwrap_or_else(|_| Local::now());
            
            Ok(timestamp)
        },
    )?;
    
    let mut timestamps: Vec<DateTime<Local>> = Vec::new();
    for timestamp_row in timestamp_rows {
        timestamps.push(timestamp_row?);
    }
    
    // 识别连续输入时段
    let mut sessions: Vec<(DateTime<Local>, DateTime<Local>, i64)> = Vec::new();
    
    if timestamps.is_empty() {
        return Ok(sessions);
    }
    
    let mut session_start = timestamps[0];
    let mut last_time = timestamps[0];
    
    for i in 1..timestamps.len() {
        let current_time = timestamps[i];
        let gap = current_time.signed_duration_since(last_time).num_seconds();
        
        if gap > max_gap_seconds {
            // 当前间隔大于阈值，结束上一个会话并记录
            let duration = last_time.signed_duration_since(session_start).num_seconds();
            sessions.push((session_start, last_time, duration));
            
            // 开始新会话
            session_start = current_time;
        }
        
        last_time = current_time;
    }
    
    // 添加最后一个会话
    let duration = last_time.signed_duration_since(session_start).num_seconds();
    sessions.push((session_start, last_time, duration));
    
    Ok(sessions)
}

// 计算健康风险相关指标
pub fn calculate_health_risk_metrics(
    conn: &Connection,
    start_time: DateTime<Local>,
    end_time: DateTime<Local>
) -> Result<serde_json::Value> {
    // 获取总按键数
    let total_key_count = get_key_count_by_time_range(conn, start_time.clone(), end_time.clone())?;
    
    // 计算时间范围的天数
    let days = (end_time.signed_duration_since(start_time).num_seconds() as f64 / 86400.0).max(1.0);
    
    // 计算日均按键数
    let daily_avg_keys = total_key_count as f64 / days;
    
    // 计算平均KPM
    let avg_kpm = calculate_average_kpm(conn, start_time.clone(), end_time.clone())?;
    
    // 识别连续输入时段（定义5分钟无按键为会话中断）
    let sessions = identify_continuous_typing_sessions(conn, start_time.clone(), end_time.clone(), 300)?;
    
    // 计算长时间会话
    let long_sessions_threshold = 60 * 60; // 1小时连续输入定义为长会话（秒）
    let long_sessions: Vec<_> = sessions.iter()
        .filter(|(_, _, duration)| *duration >= long_sessions_threshold)
        .collect();
        
    // 计算平均会话长度（秒）
    let avg_session_duration = if !sessions.is_empty() {
        sessions.iter().map(|(_, _, duration)| duration).sum::<i64>() as f64 / sessions.len() as f64
    } else {
        0.0
    };
    
    // 构建返回的JSON对象
    let mut metrics = serde_json::Map::new();
    
    metrics.insert("total_key_count".to_string(), serde_json::Value::Number(serde_json::Number::from(total_key_count)));
    metrics.insert("days_analyzed".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(days).unwrap_or(serde_json::Number::from(1))));
    metrics.insert("daily_avg_keys".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(daily_avg_keys).unwrap_or(serde_json::Number::from(0))));
    metrics.insert("avg_kpm".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(avg_kpm).unwrap_or(serde_json::Number::from(0))));
    metrics.insert("total_sessions".to_string(), serde_json::Value::Number(serde_json::Number::from(sessions.len())));
    metrics.insert("long_sessions_count".to_string(), serde_json::Value::Number(serde_json::Number::from(long_sessions.len())));
    metrics.insert("avg_session_duration_seconds".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(avg_session_duration).unwrap_or(serde_json::Number::from(0))));
    
    // 添加长会话详情
    let long_sessions_details: Vec<serde_json::Value> = long_sessions.iter().map(|(start, end, duration)| {
        let mut session_map = serde_json::Map::new();
        session_map.insert("start_time".to_string(), serde_json::Value::String(start.format("%Y-%m-%d %H:%M:%S").to_string()));
        session_map.insert("end_time".to_string(), serde_json::Value::String(end.format("%Y-%m-%d %H:%M:%S").to_string()));
        session_map.insert("duration_minutes".to_string(), serde_json::Value::Number(serde_json::Number::from(*duration / 60)));
        serde_json::Value::Object(session_map)
    }).collect();
    
    metrics.insert("long_sessions".to_string(), serde_json::Value::Array(long_sessions_details));
    
    // 添加每日长会话次数
    let long_sessions_per_day = if days > 0.0 {
        long_sessions.len() as f64 / days
    } else {
        0.0
    };
    metrics.insert("long_sessions_per_day".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(long_sessions_per_day).unwrap_or(serde_json::Number::from(0))));
    
    Ok(serde_json::Value::Object(metrics))
}