import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config.js";
import { registerEvents } from "./handlers/eventHandler.js";
import { registerCommands } from "./handlers/commandHandler.js";
import { initializeDatabase } from "./database/schema.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

await registerEvents(client);

initializeDatabase();

client.login(config.discordToken);