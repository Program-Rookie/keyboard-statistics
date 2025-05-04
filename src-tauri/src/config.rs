use serde::{Serialize, Deserialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub show_exit_confirm: bool,
    pub minimize_on_close: bool,
    pub recording_enabled: bool,
    pub autostart_enabled: bool,
    pub popup_position: PopupPosition,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PopupPosition {
    pub x: i32,      // X坐标，正值表示从左侧计算位置
    pub y: i32,      // Y坐标，正值表示从顶部计算位置
    pub monitor_id: Option<String>, // 存储显示器ID
}

impl Default for PopupPosition {
    fn default() -> Self {
        PopupPosition {
            x: 80,  // 默认X坐标
            y: 500, // 默认Y坐标，现在使用绝对值
            monitor_id: None, // 默认为空，使用主显示器
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            show_exit_confirm: true,
            minimize_on_close: true,
            recording_enabled: true,
            autostart_enabled: false,
            popup_position: PopupPosition::default(),
        }
    }
}

pub struct ConfigManager {
    config: Mutex<AppConfig>,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new(app_dir: PathBuf) -> Self {
        let config_path = app_dir.join("config.json");
        let config = if config_path.exists() {
            match File::open(&config_path) {
                Ok(mut file) => {
                    let mut contents = String::new();
                    if file.read_to_string(&mut contents).is_ok() {
                        serde_json::from_str(&contents).unwrap_or_default()
                    } else {
                        AppConfig::default()
                    }
                }
                Err(_) => AppConfig::default()
            }
        } else {
            AppConfig::default()
        };

        ConfigManager {
            config: Mutex::new(config),
            config_path,
        }
    }

    pub fn save_config(&self) -> Result<(), String> {
        let config = self.config.lock().unwrap();
        let json = serde_json::to_string_pretty(&*config)
            .map_err(|e| format!("配置序列化失败: {}", e))?;

        File::create(&self.config_path)
            .map_err(|e| format!("创建配置文件失败: {}", e))?
            .write_all(json.as_bytes())
            .map_err(|e| format!("写入配置文件失败: {}", e))
    }

    pub fn get_config(&self) -> std::sync::MutexGuard<AppConfig> {
        self.config.lock().unwrap()
    }
}