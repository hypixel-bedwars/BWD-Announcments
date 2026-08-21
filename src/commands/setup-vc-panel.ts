import {
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  Client,
  MessageFlags,
} from "discord.js";
import { config } from "../config.js";
import { buildChannelManagementMessage } from "../utils.js";
import type { Command } from "../models/types/command.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup-vc-panel")
    .setDescription("Send the temporary VC management panel to a channel.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where the VC management panel should be sent.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString()),

  async execute(client: Client, interaction: ChatInputCommandInteraction) {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const { embeds, components } = buildChannelManagementMessage(config.discordTempVcModeratorRoleId);

    await channel.send({ embeds, components });

    await interaction.reply({
      content: `VC management panel sent to <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
} satisfies Command;