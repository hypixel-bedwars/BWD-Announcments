import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";

export default {
  name: Events.ClientReady,
  once: true,

  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
  }
} satisfies Event<"clientReady">;