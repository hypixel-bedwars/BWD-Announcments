import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";
import { exit } from "node:process";
import { registerCommands } from "../handlers/commandHandler.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    if (client.user == null) {
      exit()
    }
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands(client);
  }
} satisfies Event<"clientReady">;