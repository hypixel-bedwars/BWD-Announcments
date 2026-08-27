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

function getEnvArray(name: string): string[] {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.split(",").map((item) => item.trim());
}

export const config: AppConfig = {
  discordToken: getEnv("DISCORD_TOKEN"),
  discordGuildId: getEnv("DISCORD_GUILD_ID"),
  discordTagRoleId: getEnv("DISCORD_TAG_ROLE_ID"),
  discordBoostRoleId: getEnv("DISCORD_BOOST_ROLE_ID"),
  discordTagAnnouncmentChannelId: getEnv("DISCORD_TAG_ANNOUNCMENT_CHANNEL_ID"),
  discordBoostAnnouncmentChannelId: getEnv("DISCORD_BOOST_ANNOUNCMENT_CHANNEL_ID"),

  discordTempVcCategoryId: getEnv("DISCORD_TEMPVC_CATEGORY_ID"),
  discordTempVcChannelId: getEnv("DISCORD_TEMPVC_CHANNEL_ID"),
  discordTempVcModeratorRoleId: getEnv("DISCORD_TEMPVC_MODERATOR_ROLE_ID"),
  discordVerifiedRoleId: getEnv("DISCORD_VERIFIED_ROLE_ID"),
  discordSoundBoardRolesId: getEnvArray("DISCORD_SOUNDBOARD_ROLES_ID"),
} as const;