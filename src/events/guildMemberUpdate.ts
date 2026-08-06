import { Client, Events, GuildMember, PartialGuildMember } from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";

export default {
  name: Events.GuildMemberUpdate,
  execute(
    client: Client,
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember
  ) {
    if (newMember.guild.id !== config.discordGuildId) return;

    const wasBoosting = oldMember.premiumSince != null;
    const isBoosting = newMember.premiumSince != null;

    if (!wasBoosting && isBoosting) {
      console.log(`${newMember.user.tag} started boosting the server!`);
      // handle "started boosting" logic here
      // TODO
    } else if (wasBoosting && !isBoosting) {
      console.log(`${newMember.user.tag} stopped boosting the server.`);
      // handle "stopped boosting" logic here
      // TODO
    }
  },
} satisfies Event<"guildMemberUpdate">;