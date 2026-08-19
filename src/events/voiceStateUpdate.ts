import { ChannelType, Events } from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";
import {
  createTempVcChannel,
  deleteTempVcChannel,
  tempVcChannelExists,
} from "../database/repository/temp_channels.js";
import { stripDisplayNamePrefix } from "../utils.js";

export default {
  name: Events.VoiceStateUpdate,
  async execute(client, oldState, newState) {
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    const vcChannelNamePrefix = "《 🔊 》";
    const userUsername = stripDisplayNamePrefix(newState.member!.user.displayName);
    
    const channelName = `${vcChannelNamePrefix}${userUsername}'s Channel`;

    if (newChannel && newChannel === config.discordTempVcChannelId && oldChannel !== newChannel) {
      const guild = await client.guilds.fetch(config.discordGuildId);

      const tempVcChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: config.discordTempVcCategoryId,
      });

      await tempVcChannel.permissionOverwrites.create(newState.member!.user.id, {
        Connect: true,
      });

      // Move the user to the VC
      await newState.member!.voice.setChannel(tempVcChannel);
      createTempVcChannel(tempVcChannel.id, newState.member!.user.id);
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
          console.log(`Deleted empty temp VC: ${leftChannel.name} (${oldChannel})`);
        }
      }
    }
  },
} satisfies Event<"voiceStateUpdate">;