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

    if (
      newChannel &&
      newChannel === config.discordTempVcChannelId &&
      oldChannel !== newChannel
    ) {
      const guild = await client.guilds.fetch(config.discordGuildId);
      const vcChannelNamePrefix = "《 🔊 》";
      const userUsername = stripDisplayNamePrefix(
        newState.member!.user.displayName,
      );
      const channelName = `${vcChannelNamePrefix}${userUsername}'s Channel`;

      try {
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

        // RACE CONDITION FIX
        try {
          // Verify the user is still actually in a voice channel before moving
          const currentMember = await guild.members.fetch(
            newState.member!.user.id,
          );

          if (!currentMember.voice.channelId) {
            throw new Error("User disconnected before move could complete.");
          }

          // Move the user to the VC
          await currentMember.voice.setChannel(tempVcChannel);
          createTempVcChannel(tempVcChannel.id, newState.member!.user.id);
        } catch (moveError) {
          // The user left the creator VC before we could move them.
          // Delete the newly created channel so it doesn't get left behind.
          await tempVcChannel.delete().catch(() => {});
          console.log(
            `Cleaned up orphaned temp VC for ${userUsername} (User disconnected during creation)`,
          );
          return;
        }

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
      } catch (createError) {
        console.error("Failed to create Temp VC:", createError);
      }
    }

    // Left a channel (disconnected, or moved elsewhere) then check if it was a
    // tracked temp VC and is now empty
    if (oldChannel && oldChannel !== newChannel) {
      const leftChannel = oldState.guild.channels.cache.get(oldChannel);
      if (
        leftChannel &&
        leftChannel.isVoiceBased() &&
        tempVcChannelExists(oldChannel)
      ) {
        const humanMembers = leftChannel.members.filter(
          (m) => !m.user.bot,
        ).size;
        if (humanMembers === 0) {
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