import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config.js";

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

client.login(config.discordToken);