import { db } from "./database.js";

export function initializeDatabase() {
  db.exec(`
    -- Main table: one row per active temp VC
    CREATE TABLE IF NOT EXISTS temp_channels (
        channel_id  INTEGER PRIMARY KEY,                    -- Discord channel ID (snowflake)
        owner_id    INTEGER NOT NULL,                       -- Discord user ID of the owner
        user_limit  INTEGER NOT NULL DEFAULT 0,             -- 0 = no limit
        name        TEXT,                                   -- current channel name (NULL = using default)
        is_locked   INTEGER NOT NULL DEFAULT 0,             -- 0 = unlocked, 1 = locked
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())  -- unix timestamp
    );

    -- Banned users: one row per (channel, banned user) pair
    CREATE TABLE IF NOT EXISTS banned_users (
        channel_id  INTEGER NOT NULL,
        user_id     INTEGER NOT NULL,
        PRIMARY KEY (channel_id, user_id),
        FOREIGN KEY (channel_id) REFERENCES temp_channels(channel_id) ON DELETE CASCADE
    );

    -- Helpful index for looking up all channels owned by a user
    CREATE INDEX IF NOT EXISTS idx_temp_channels_owner ON temp_channels(owner_id);
  `);
}
