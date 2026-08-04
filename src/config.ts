import { configDotenv } from "dotenv";
import AppConfig from "./models/config.model.js";

export function initAppConfig(): AppConfig {
  configDotenv();

  return {
    discordToken: getEnv("DISCORD_TOKEN"),
    discordGuildId: getEnv("DISCORD_GUILD_ID")
  };
}

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
  