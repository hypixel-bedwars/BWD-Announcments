import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";

export default {
  name: Events.UserUpdate,
  once: false,

  execute(newUser) {
    console.log(`User updated: ${newUser.tag} (${newUser.id})`);
    console.log("primaryGuild:", newUser.primaryGuild);
  }
} satisfies Event<"userUpdate">;