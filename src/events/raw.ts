import { APIUser, Client, Events } from "discord.js";
import type { Event } from "../models/types/event.js";
import { config } from "../config.js";

const lastSeenTag = new Map<string, string | null>();

async function tagExecute(client: Client, user: APIUser) {
  if (
    user.primary_guild != null &&
    user.primary_guild.identity_guild_id === config.discordGuildId
  ) {
    const guild = await client.guilds.fetch(config.discordGuildId);
    const member = await guild.members.fetch(user.id);

    // Give member the tag role
    member.roles.add(config.discordTagRoleId);
  }
}

export default {
  name: Events.Raw,
  execute(client: Client, packet: any) {
    if (packet.t === "GUILD_MEMBER_UPDATE" || packet.t === "USER_UPDATE") {
      const user: APIUser = packet.d.user;
      if (!user?.id) return;

      const newTag = user.primary_guild?.tag ?? null;
      const prevTag = lastSeenTag.get(user.id);
      if (newTag === prevTag) return;
      lastSeenTag.set(user.id, newTag);

      tagExecute(client, user);

      console.log(`${user.username} primary_guild changed:`, user.primary_guild);
    }
  },
} satisfies Event<"raw">;