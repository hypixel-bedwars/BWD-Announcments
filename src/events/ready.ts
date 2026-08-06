import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";
import { exit } from "node:process";

export default {
  name: Events.ClientReady,
  once: true,

  execute(client) {
    if (client.user == null) {
      exit()
    }
    console.log(`Logged in as ${client.user.tag}`);
  }
} satisfies Event<"clientReady">;