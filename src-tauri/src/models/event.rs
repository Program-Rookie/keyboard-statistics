use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyEvent {
    pub key_code: String,
    pub timestamp: i64,
    pub app_name: String,
    pub is_modifier: bool,
}

impl KeyEvent {
    pub fn new(key_code: String, timestamp: i64, app_name: String, is_modifier: bool) -> Self {
        Self {
            key_code,
            timestamp,
            app_name,
            is_modifier,
        }
    }
} 