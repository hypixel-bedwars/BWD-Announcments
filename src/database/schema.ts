import { db } from "./database.js";

export function initializeDatabase() {
  db.exec(`
    -- Main table: one row per active temp VC
    CREATE TABLE IF NOT EXISTS temp_channels (
        channel_id  TEXT PRIMARY KEY,                    -- Discord channel ID (snowflake)
        owner_id    TEXT NOT NULL,                       -- Discord user ID of the owner
        user_limit  INTEGER NOT NULL DEFAULT 0,             -- 0 = no limit
        name        TEXT,                                   -- current channel name (NULL = using default)
        is_locked   INTEGER NOT NULL DEFAULT 0,             -- 0 = unlocked, 1 = locked
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())  -- unix timestamp
    );

    -- Banned users: one row per (channel, banned user) pair
    CREATE TABLE IF NOT EXISTS banned_users (
        channel_id  TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        PRIMARY KEY (channel_id, user_id),
        FOREIGN KEY (channel_id) REFERENCES temp_channels(channel_id) ON DELETE CASCADE
    );

    -- Temp Statistics table: one row per closed channel
    CREATE TABLE IF NOT EXISTS temp_channel_events (
        total_time  INTEGER NOT NULL CHECK (total_time >= 0),
        channel_id  TEXT NOT NULL,
        closed_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Daily snapshots of the statistics
    CREATE TABLE IF NOT EXISTS temp_channel_daily_statistics (
        date            TEXT PRIMARY KEY,
        total_channels  INTEGER NOT NULL DEFAULT 0,
        total_time      INTEGER NOT NULL DEFAULT 0
    );

    -- Helpful index for looking up all channels owned by a user
    CREATE INDEX IF NOT EXISTS idx_temp_channels_owner ON temp_channels(owner_id);
    -- banned_users
    CREATE INDEX IF NOT EXISTS idx_banned_users_user ON banned_users(user_id);
    -- temp_channel_events: speeds up range scans when building daily rollups
    CREATE INDEX IF NOT EXISTS idx_temp_channel_events_closed_at ON temp_channel_events(closed_at);
    CREATE INDEX IF NOT EXISTS idx_temp_channel_events_channel_id ON temp_channel_events(channel_id);
  `);
}
