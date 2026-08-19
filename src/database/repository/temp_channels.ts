import { Snowflake } from "discord.js";
import { db } from "../database.js";

// ---------- Types ----------

export interface TempVcChannel {
  channel_id: Snowflake;
  owner_id: Snowflake;
  user_limit: number;
  name: string | null;
  is_locked: number; // 0 | 1
  created_at: number;
}

// ---------- Create ----------

export function createTempVcChannel(channelId: Snowflake, userId: Snowflake) {
  const statement = db.prepare(
    `INSERT INTO temp_channels (channel_id, owner_id) VALUES (?, ?);`
  );
  statement.run(channelId, userId);
}

// ---------- Read ----------

export function getTempVcChannel(channelId: Snowflake): TempVcChannel | undefined {
  const statement = db.prepare(
    `SELECT * FROM temp_channels WHERE channel_id = ?;`
  );
  return statement.get(channelId) as TempVcChannel | undefined;
}

export function getTempVcChannelsByOwner(userId: Snowflake): TempVcChannel[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channels WHERE owner_id = ?;`
  );
  return statement.all(userId) as TempVcChannel[];
}

export function getAllTempVcChannels(): TempVcChannel[] {
  const statement = db.prepare(`SELECT * FROM temp_channels;`);
  return statement.all() as TempVcChannel[];
}

export function tempVcChannelExists(channelId: Snowflake): boolean {
  const statement = db.prepare(
    `SELECT 1 FROM temp_channels WHERE channel_id = ?;`
  );
  return statement.get(channelId) !== undefined;
}

// ---------- Update ----------

export function setUserLimit(channelId: Snowflake, limit: number) {
  const statement = db.prepare(
    `UPDATE temp_channels SET user_limit = ? WHERE channel_id = ?;`
  );
  statement.run(limit, channelId);
}

export function setChannelName(channelId: Snowflake, name: string) {
  const statement = db.prepare(
    `UPDATE temp_channels SET name = ? WHERE channel_id = ?;`
  );
  statement.run(name, channelId);
}

export function transferOwnership(channelId: Snowflake, newOwnerId: Snowflake) {
  const statement = db.prepare(
    `UPDATE temp_channels SET owner_id = ? WHERE channel_id = ?;`
  );
  statement.run(newOwnerId, channelId);
}

export function lockChannel(channelId: Snowflake) {
  const statement = db.prepare(
    `UPDATE temp_channels SET is_locked = 1 WHERE channel_id = ?;`
  );
  statement.run(channelId);
}

export function unlockChannel(channelId: Snowflake) {
  const statement = db.prepare(
    `UPDATE temp_channels SET is_locked = 0 WHERE channel_id = ?;`
  );
  statement.run(channelId);
}

export function toggleChannelLock(channelId: Snowflake) {
  const statement = db.prepare(
    `UPDATE temp_channels SET is_locked = NOT is_locked WHERE channel_id = ?;`
  );
  statement.run(channelId);
}

export function isChannelLocked(channelId: Snowflake): boolean {
  const statement = db.prepare(
    `SELECT is_locked FROM temp_channels WHERE channel_id = ?;`
  );
  const row = statement.get(channelId) as { is_locked: number } | undefined;
  return row?.is_locked === 1;
}

// ---------- Delete ----------

export function deleteTempVcChannel(channelId: Snowflake) {
  const statement = db.prepare(
    `DELETE FROM temp_channels WHERE channel_id = ?;`
  );
  statement.run(channelId);
}

// ---------- Banned users ----------

export function banUser(channelId: Snowflake, userId: Snowflake) {
  const statement = db.prepare(
    `INSERT OR IGNORE INTO banned_users (channel_id, user_id) VALUES (?, ?);`
  );
  statement.run(channelId, userId);
}

export function unbanUser(channelId: Snowflake, userId: Snowflake) {
  const statement = db.prepare(
    `DELETE FROM banned_users WHERE channel_id = ? AND user_id = ?;`
  );
  statement.run(channelId, userId);
}

export function isUserBanned(channelId: Snowflake, userId: Snowflake): boolean {
  const statement = db.prepare(
    `SELECT 1 FROM banned_users WHERE channel_id = ? AND user_id = ?;`
  );
  return statement.get(channelId, userId) !== undefined;
}

export function getBannedUsers(channelId: Snowflake): Snowflake[] {
  const statement = db.prepare(
    `SELECT user_id FROM banned_users WHERE channel_id = ?;`
  );
  const rows = statement.all(channelId) as { user_id: Snowflake }[];
  return rows.map((row) => row.user_id);
}