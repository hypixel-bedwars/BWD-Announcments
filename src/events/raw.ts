import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";

export default {
  name: Events.Raw,

  execute(packet) {
    if (
      packet.t === "GUILD_MEMBER_UPDATE" ||
      packet.t === "USER_UPDATE"
    ) {
      const user = packet.d.user;

      if (user?.primary_guild) {
        console.log("primary_guild:", user.primary_guild);
      }
    }
  }
} satisfies Event<"raw">;