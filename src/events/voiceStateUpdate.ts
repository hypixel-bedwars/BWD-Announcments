import { ChannelType, Events, PermissionOverwriteOptions } from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";
import {
  createTempVcChannel,
  deleteTempVcChannel,
  tempVcChannelExists,
} from "../database/repository/temp_channels.js";
import {
  buildChannelManagementMessage,
  stripDisplayNamePrefix,
} from "../utils.js";

export default {
  name: Events.VoiceStateUpdate,
  async execute(client, oldState, newState) {
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    const vcChannelNamePrefix = "《 🔊 》";
    const userUsername = stripDisplayNamePrefix(
      newState.member!.user.displayName,
    );

    const channelName = `${vcChannelNamePrefix}${userUsername}'s Channel`;

    if (
      newChannel &&
      newChannel === config.discordTempVcChannelId &&
      oldChannel !== newChannel
    ) {
      const guild = await client.guilds.fetch(config.discordGuildId);

      const tempVcChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: config.discordTempVcCategoryId,
      });

      const permissions: PermissionOverwriteOptions = {
        Connect: true,
        ...(newState.member!.roles.cache.some((role) =>
          config.discordSoundBoardRolesId.includes(role.id),
        )
          ? { UseSoundboard: true }
          : {}),
      };

      await tempVcChannel.permissionOverwrites.edit(
        newState.member!.user.id,
        permissions,
      );

      // Move the user to the VC
      await newState.member!.voice.setChannel(tempVcChannel);
      createTempVcChannel(tempVcChannel.id, newState.member!.user.id);

      try {
        const { embeds, components } = buildChannelManagementMessage(
          config.discordTempVcModeratorRoleId,
        );
        await tempVcChannel.send({ embeds, components });
      } catch (err) {
        console.error(
          `Failed to send channel management embed in ${tempVcChannel.id}:`,
          err,
        );
      }
    }

    // Left a channel (disconnected, or moved elsewhere) then check if it was a
    // tracked temp VC and is now empty
    if (oldChannel && oldChannel !== newChannel) {
      const leftChannel = oldState.channel;

      if (leftChannel && tempVcChannelExists(oldChannel)) {
        if (leftChannel.members.size === 0) {
          await leftChannel.delete().catch(() => {
            // Channel may have already been deleted (race condition)
          });
          deleteTempVcChannel(oldChannel);
          console.log(
            `Deleted empty temp VC: ${leftChannel.name} (${oldChannel})`,
          );
        }
      }
    }
  },
} satisfies Event<"voiceStateUpdate">;
