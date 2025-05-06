use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Local;
use once_cell::sync::Lazy;

// 日志级别
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl LogLevel {
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warning => "WARNING",
            LogLevel::Error => "ERROR",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "DEBUG" => Some(LogLevel::Debug),
            "INFO" => Some(LogLevel::Info),
            "WARNING" | "WARN" => Some(LogLevel::Warning),
            "ERROR" | "ERR" => Some(LogLevel::Error),
            _ => None,
        }
    }
}

// 全局日志文件句柄
pub static LOGGER: Lazy<Mutex<Option<Logger>>> = Lazy::new(|| Mutex::new(None));

pub struct Logger {
    file: File,
    min_level: LogLevel,
}

impl Logger {
    // 初始化日志系统
    pub fn init(log_dir: PathBuf, min_level: LogLevel) -> io::Result<()> {
        // 确保日志目录存在
        if !log_dir.exists() {
            std::fs::create_dir_all(&log_dir)?;
        }

        // 创建日志文件名，格式为 app_YYYY-MM-DD.log
        let now = Local::now();
        let log_file_name = format!("app_{}.log", now.format("%Y-%m-%d"));
        let log_file_path = log_dir.join(log_file_name);

        // 打开日志文件，如果存在则追加，不存在则创建
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file_path)?;

        // 创建Logger实例
        let mut logger = Logger {
            file,
            min_level,
        };

        // 记录启动日志
        let startup_msg = format!("===== 应用启动于 {} =====", now.format("%Y-%m-%d %H:%M:%S"));
        writeln!(logger.file, "{}", startup_msg)?;

        // 设置全局Logger
        let mut global_logger = LOGGER.lock().unwrap();
        *global_logger = Some(logger);

        println!("日志系统初始化完成");
        Ok(())
    }

    // 写入日志
    pub fn log(level: LogLevel, source: &str, message: &str) -> io::Result<()> {
        let mut logger_guard = LOGGER.lock().unwrap();
        
        if let Some(logger) = logger_guard.as_mut() {
            // 检查日志级别
            if level as u8 >= logger.min_level as u8 {
                let now = Local::now();
                let timestamp = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();
                let log_entry = format!("[{}] [{}] [{}] {}", timestamp, level.as_str(), source, message);
                
                // 写入日志文件
                writeln!(logger.file, "{}", log_entry)?;
                // 确保立即写入磁盘
                logger.file.flush()?;
                
                // 同时打印到控制台
                println!("{}", log_entry);
            }
            Ok(())
        } else {
            // 日志系统未初始化，直接打印到控制台
            println!("[NOT_INITIALIZED] [{}] [{}] {}", level.as_str(), source, message);
            Ok(())
        }
    }

    // 便捷方法：记录debug日志
    pub fn debug(source: &str, message: &str) -> io::Result<()> {
        Self::log(LogLevel::Debug, source, message)
    }

    // 便捷方法：记录info日志
    pub fn info(source: &str, message: &str) -> io::Result<()> {
        Self::log(LogLevel::Info, source, message)
    }

    // 便捷方法：记录warning日志
    pub fn warning(source: &str, message: &str) -> io::Result<()> {
        Self::log(LogLevel::Warning, source, message)
    }

    // 便捷方法：记录error日志
    pub fn error(source: &str, message: &str) -> io::Result<()> {
        Self::log(LogLevel::Error, source, message)
    }
}

// 提供给前端的日志记录命令
#[tauri::command]
pub fn log_message(level: &str, source: &str, message: &str) -> Result<(), String> {
    let log_level = LogLevel::from_str(level).unwrap_or(LogLevel::Info);
    
    Logger::log(log_level, source, message)
        .map_err(|e| format!("记录日志失败: {}", e))
}

// 重要：应用退出时确保所有日志都被写入
pub fn shutdown() -> io::Result<()> {
    let mut logger_guard = LOGGER.lock().unwrap();
    
    if let Some(logger) = logger_guard.as_mut() {
        let now = Local::now();
        let shutdown_msg = format!("===== 应用关闭于 {} =====", now.format("%Y-%m-%d %H:%M:%S"));
        writeln!(logger.file, "{}", shutdown_msg)?;
        logger.file.flush()?;
    }
    
    Ok(())
} 