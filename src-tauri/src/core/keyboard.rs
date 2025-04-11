use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use crate::models::event::KeyEvent;

pub struct KeyboardMonitor {
    is_running: Arc<AtomicBool>,
}

impl KeyboardMonitor {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self) {
        self.is_running.store(true, Ordering::SeqCst);
        // TODO: 实现键盘事件监听
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        // TODO: 停止键盘事件监听
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
} 