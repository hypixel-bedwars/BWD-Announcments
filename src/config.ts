import { configDotenv } from "dotenv";
import AppConfig from "./models/config.model.js";

configDotenv();

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config: AppConfig = {
  discordToken: getEnv("DISCORD_TOKEN"),
  discordGuildId: getEnv("DISCORD_GUILD_ID"),
  discordTagRoleId: getEnv("DISCORD_TAG_ROLE_ID"),
  discordBoostRoleId: getEnv("DISCORD_BOOST_ROLE_ID"),
  discordTagAnnouncmentChannelId: getEnv("DISCORD_TAG_ANNOUNCMENT_CHANNEL_ID"),
  discordBoostAnnouncmentChannelId: getEnv("DISCORD_BOOST_ANNOUNCMENT_CHANNEL_ID")
} as const;