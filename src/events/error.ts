import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";

export default {
  name: Events.Error,
  execute(error: Error) {
    console.error(error);
  }
} satisfies Event<"error">;