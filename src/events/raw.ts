import { Events } from "discord.js";
import type { Event } from "../models/types/event.js";

const lastSeenTag = new Map<string, string | null>();

export default {
  name: Events.Raw,

  execute(packet) {
    if (
      packet.t === "GUILD_MEMBER_UPDATE" ||
      packet.t === "USER_UPDATE"
    ) {
      const user = packet.d.user;
      if (!user?.id) return;

      const newTag = user.primary_guild?.tag ?? null;
      const prevTag = lastSeenTag.get(user.id);

      if (newTag === prevTag) return;
      lastSeenTag.set(user.id, newTag);

      console.log(`${user.username} primary_guild changed:`, user.primary_guild);
    }
  }
} satisfies Event<"raw">;