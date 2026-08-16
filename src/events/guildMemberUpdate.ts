import { Client, EmbedBuilder, Events, GuildMember, PartialGuildMember, TextChannel } from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";

export default {
  name: Events.GuildMemberUpdate,
  async execute(
    client: Client,
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember
  ) {
    if (newMember.guild.id !== config.discordGuildId) return;

    const wasBoosting = oldMember.premiumSince != null;
    const isBoosting = newMember.premiumSince != null;

    if (!wasBoosting && isBoosting || wasBoosting && isBoosting) {
      // Since the members are automatically given a role
      // All the bot will need to do is announce the boost
      // Since the members are automatically given a role
      const channel = newMember.guild.channels.cache.get(
        config.discordBoostAnnouncmentChannelId
      ) as TextChannel | undefined;
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xf47fff)
        .setAuthor({ name: "Server Boosted" })
        .setDescription(
          `Thank you, ${newMember} — you've boosted the server!\n\n` +
            `> ### **Boost Count**\n` +
            `> This is boost #${newMember.guild.premiumSubscriptionCount ?? "?"} for the server\n` +
            `> ### **Exclusive Perks**\n` +
            `> • You get the <@&${config.discordBoostRoleId}> role\n` +
            `> • Access to wool colors\n` +
            `> • 4x the entries when entering giveaways`,
        )
        .setThumbnail(newMember.displayAvatarURL())
        .setFooter({
          text: "Thank you for supporting the server.",
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } else if (wasBoosting && !isBoosting) {
      // handle "stopped boosting" logic here
      // no logic for now tho
      // left it like this for future use
    }
  },
} satisfies Event<"guildMemberUpdate">;