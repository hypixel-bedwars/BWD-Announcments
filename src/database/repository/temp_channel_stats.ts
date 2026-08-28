import { Snowflake } from "discord.js";
import { db } from "../database.js";

// ---------- Types ----------

export interface TempChannelEvent {
  channel_id: Snowflake;
  total_time: number;
  closed_at: number;
}

export interface TempChannelDailyStatistic {
  date: string; // YYYY-MM-DD, UTC
  total_channels: number;
  total_time: number;
}

// ---------- Events ----------

export function recordTempChannelEvent(
  channelId: Snowflake,
  totalTime: number,
  closedAt: number,
) {
  const statement = db.prepare(
    `INSERT INTO temp_channel_events (channel_id, total_time, closed_at) VALUES (?, ?, ?);`,
  );
  statement.run(channelId, totalTime, closedAt);
}

export function getTempChannelEvents(channelId: Snowflake): TempChannelEvent[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_events WHERE channel_id = ? ORDER BY closed_at;`,
  );
  return statement.all(channelId) as TempChannelEvent[];
}

export function getTempChannelEventsBetween(
  startTs: number,
  endTs: number,
): TempChannelEvent[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_events WHERE closed_at >= ? AND closed_at < ? ORDER BY closed_at;`,
  );
  return statement.all(startTs, endTs) as TempChannelEvent[];
}

export function getAllTempChannelEvents(): TempChannelEvent[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_events ORDER BY closed_at;`,
  );
  return statement.all() as TempChannelEvent[];
}

// ---------- Daily statistics ----------

export function incrementDailyStatistics(
  date: string,
  channelsToAdd: number,
  timeToAdd: number,
) {
  const statement = db.prepare(`
    INSERT INTO temp_channel_daily_statistics (date, total_channels, total_time)
    VALUES (?, ?, ?)
    ON CONFLICT (date) DO UPDATE SET
      total_channels = total_channels + excluded.total_channels,
      total_time = total_time + excluded.total_time;
  `);
  statement.run(date, channelsToAdd, timeToAdd);
}

export function getDailyStatistics(
  date: string,
): TempChannelDailyStatistic | undefined {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_daily_statistics WHERE date = ?;`,
  );
  return statement.get(date) as TempChannelDailyStatistic | undefined;
}

export function getDailyStatisticsRange(
  startDate: string,
  endDate: string,
): TempChannelDailyStatistic[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_daily_statistics WHERE date BETWEEN ? AND ? ORDER BY date;`,
  );
  return statement.all(startDate, endDate) as TempChannelDailyStatistic[];
}

export function getAllDailyStatistics(): TempChannelDailyStatistic[] {
  const statement = db.prepare(
    `SELECT * FROM temp_channel_daily_statistics ORDER BY date;`,
  );
  return statement.all() as TempChannelDailyStatistic[];
}

// ---------- Closing a channel ----------

// One event row + one daily-rollup upsert, atomically.
const closeChannelTransaction = db.transaction(
  (channelId: Snowflake, totalTime: number, closedAt: number, date: string) => {
    recordTempChannelEvent(channelId, totalTime, closedAt);
    incrementDailyStatistics(date, 1, totalTime);
  },
);

/**
 * Call this once, right when a temp VC closes. `createdAt` must come from
 * `temp_channels` (getTempVcChannel) BEFORE you call deleteTempVcChannel,
 * since that row is about to disappear.
 */
export function recordChannelClosed(channelId: Snowflake, createdAt: number) {
  const closedAt = Math.floor(Date.now() / 1000);
  const totalTime = Math.max(0, closedAt - createdAt);
  const date = new Date(closedAt * 1000).toISOString().slice(0, 10);

  closeChannelTransaction(channelId, totalTime, closedAt, date);
}