use rusqlite::{Connection, Result};
use std::path::Path;
use crate::models::event::KeyEvent;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Database { conn };
        db.init()?;
        Ok(db)
    }

    fn init(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS key_events (
                id INTEGER PRIMARY KEY,
                key_code TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                app_name TEXT,
                is_modifier BOOLEAN NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    pub fn insert_event(&self, event: &KeyEvent) -> Result<()> {
        self.conn.execute(
            "INSERT INTO key_events (key_code, timestamp, app_name, is_modifier)
             VALUES (?1, ?2, ?3, ?4)",
            (
                &event.key_code,
                event.timestamp,
                &event.app_name,
                event.is_modifier,
            ),
        )?;
        Ok(())
    }

    pub fn get_total_keystrokes(&self) -> Result<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM key_events",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }
} 