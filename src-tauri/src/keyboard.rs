use std::sync::Arc;
use std::sync::Mutex;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Local};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyEvent {
    pub key_code: i32,
    #[serde(serialize_with = "serialize_datetime", deserialize_with = "deserialize_datetime")]
    pub timestamp: DateTime<Local>,
    pub is_pressed: bool,
}

fn serialize_datetime<S>(date: &DateTime<Local>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_i64(date.timestamp())
}

fn deserialize_datetime<'de, D>(deserializer: D) -> Result<DateTime<Local>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let timestamp = i64::deserialize(deserializer)?;
    Ok(DateTime::from_timestamp(timestamp, 0).unwrap_or_default().with_timezone(&Local))
}

pub struct KeyboardListener {
    key_events: Arc<Mutex<Vec<KeyEvent>>>,
    is_running: Arc<Mutex<bool>>,
}

impl KeyboardListener {
    pub fn new() -> Self {
        KeyboardListener {
            key_events: Arc::new(Mutex::new(Vec::new())),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self) {
        let key_events = Arc::clone(&self.key_events);
        let is_running = Arc::clone(&self.is_running);
        
        *is_running.lock().unwrap() = true;
        
        std::thread::spawn(move || {
            while *is_running.lock().unwrap() {
                for key_code in 0..256 {
                    let state = unsafe { GetAsyncKeyState(key_code) };
                    if state < 0 {  // 检查最高位是否为1
                        let event = KeyEvent {
                            key_code,
                            timestamp: Local::now(),
                            is_pressed: true,
                        };
                        key_events.lock().unwrap().push(event);
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        });
    }

    pub fn stop(&self) {
        *self.is_running.lock().unwrap() = false;
    }

    pub fn get_events(&self) -> Vec<KeyEvent> {
        let mut events = self.key_events.lock().unwrap();
        let result = events.clone();
        events.clear();
        result
    }
} 