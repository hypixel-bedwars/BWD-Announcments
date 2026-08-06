import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config.js";
import { registerEvents } from "./handlers/eventHandler.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

await registerEvents(client);

client.login(config.discordToken);