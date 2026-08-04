import { Client, GatewayIntentBits, Events } from "discord.js";
import { initAppConfig } from "./config.js";

const AppConfig = initAppConfig()

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.Error, error => {
  console.error(error);
});

client.login(AppConfig.discordToken);