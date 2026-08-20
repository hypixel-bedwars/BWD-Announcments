import {
  ActionRowBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  type VoiceChannel,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type UserSelectMenuInteraction,
  TextInputBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  GuildMember,
} from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";
import { stripDisplayNamePrefix } from "../utils.js";
import {
  getTempVcChannel,
  setChannelName,
  setUserLimit,
  lockChannel,
  unlockChannel,
  banUser,
  unbanUser,
  isUserBanned,
  transferOwnership,
} from "../database/repository/temp_channels.js";

const PARTY_MAX = 8;

// ---------- Shared helpers ----------

async function isAuthorized(
  interaction:
    | ButtonInteraction
    | ModalSubmitInteraction
    | UserSelectMenuInteraction
    | StringSelectMenuInteraction,
  ownerId: string,
): Promise<boolean> {
  if (interaction.user.id === ownerId) return true;
  if (!interaction.guild) return false;

  const guildMember = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  return (
    guildMember?.roles.cache.has(config.discordTempVcModeratorRoleId) ?? false
  );
}

async function replyDenied(
  interaction:
    ButtonInteraction | UserSelectMenuInteraction | StringSelectMenuInteraction,
) {
  await interaction.reply({
    content: "Only the channel owner or a moderator can do that.",
    flags: MessageFlags.Ephemeral,
  });
}

// customIds that skip the owner/moderator gate — party is available to anyone in the VC
const noAuthRequired = new Set([
  "vc_party",
  "vc_party_all",
  "vc_party_select",
  "vc_claim",
]);

async function requireInVoice(
  interaction: ButtonInteraction | UserSelectMenuInteraction,
): Promise<boolean> {
  const guildMember = await interaction
    .guild!.members.fetch(interaction.user.id)
    .catch(() => null);
  if (guildMember?.voice.channelId !== interaction.channelId) {
    await interaction.reply({
      content: "You need to be in this voice channel to use that.",
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

// ---------- Button handlers ----------

const buttonHandlers: Record<
  string,
  (interaction: ButtonInteraction) => Promise<void>
> = {
  vc_edit: handleEditChannel,
  vc_open: handleOpenChannel,
  vc_close: handleCloseChannel,
  vc_party: handleParty,
  vc_party_all: handlePartyAll,
  vc_kick: handleKickUser,
  vc_block: handleBlockUser,
  vc_unblock: handleUnblockUser,
  vc_claim: handleClaimOwnership,
  vc_transfer: handleTransferOwnership,
};
// ---------- Select menu handlers (customId -> action) ----------

const selectMenuHandlers: Record<
  string,
  (interaction: UserSelectMenuInteraction) => Promise<void>
> = {
  vc_unblock_select: handleUnblockUserSelected,
};

// ---------- String select menu handlers (customId -> action) ----------

const stringSelectMenuHandlers: Record<
  string,
  (interaction: StringSelectMenuInteraction) => Promise<void>
> = {
  vc_kick_select: handleKickUserSelected,
  vc_block_select: handleBlockUserSelected,
  vc_party_select: handlePartySelected,
  vc_transfer_select: handleTransferOwnershipSelected,
};

export default {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      if (interaction.isButton()) {
        const handler = buttonHandlers[interaction.customId];
        if (!handler) return;

        const tempVc = getTempVcChannel(interaction.channelId);
        if (!tempVc) {
          await interaction.reply({
            content:
              "This button isn't tied to an active temp channel anymore.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!noAuthRequired.has(interaction.customId)) {
          const authorized = await isAuthorized(interaction, tempVc.owner_id);
          if (!authorized) return replyDenied(interaction);
        }

        await handler(interaction);
        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId === "edit-vc-modal"
      ) {
        await handleEditChannelSubmit(interaction);
        return;
      }

      if (interaction.isUserSelectMenu()) {
        const handler = selectMenuHandlers[interaction.customId];
        if (!handler) return;

        const tempVc = getTempVcChannel(interaction.channelId);
        if (!tempVc) {
          await interaction.reply({
            content:
              "This action isn't tied to an active temp channel anymore.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!noAuthRequired.has(interaction.customId)) {
          const authorized = await isAuthorized(interaction, tempVc.owner_id);
          if (!authorized) return replyDenied(interaction);
        }

        await handler(interaction);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        const handler = stringSelectMenuHandlers[interaction.customId];
        if (!handler) return;

        const tempVc = getTempVcChannel(interaction.channelId);
        if (!tempVc) {
          await interaction.reply({
            content:
              "This action isn't tied to an active temp channel anymore.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!noAuthRequired.has(interaction.customId)) {
          const authorized = await isAuthorized(interaction, tempVc.owner_id);
          if (!authorized) return replyDenied(interaction);
        }

        await handler(interaction);
        return;
      }
    } catch (err) {
      console.error(
        `Error handling interaction "${(interaction as any).customId}":`,
        err,
      );
      const errorMessage = "Something went wrong handling that action.";
      if (
        "replied" in interaction &&
        (interaction.replied || interaction.deferred)
      ) {
        await interaction.followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      } else if ("reply" in interaction) {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} satisfies Event<"interactionCreate">;

// ---------- Edit channel (modal) ----------

async function handleEditChannel(interaction: ButtonInteraction) {
  const tempVc = getTempVcChannel(interaction.channelId)!;
  const channel = interaction.channel as VoiceChannel;

  // Prefer the DB-tracked name, but fall back to the channel's actual current
  // name so the field is always prefilled — this way submitting without
  // touching it results in no change.
  const currentName = tempVc.name ?? channel.name;

  const modal = new ModalBuilder()
    .setCustomId("edit-vc-modal")
    .setTitle("Edit Voice Channel");

  const nameInput = new TextInputBuilder()
    .setCustomId("vc-name")
    .setLabel("Voice channel name")
    .setPlaceholder("Enter the new channel name")
    .setStyle(TextInputStyle.Short)
    .setValue(currentName)
    .setRequired(true)
    .setMaxLength(100);

  const capacityInput = new TextInputBuilder()
    .setCustomId("vc-capacity")
    .setLabel("Number of people (0 = unlimited)")
    .setPlaceholder("Enter a number from 0 to 99")
    .setStyle(TextInputStyle.Short)
    .setValue(String(tempVc.user_limit))
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(capacityInput),
  );

  await interaction.showModal(modal);
}

async function handleEditChannelSubmit(interaction: ModalSubmitInteraction) {
  const tempVc = getTempVcChannel(interaction.channelId!);
  if (!tempVc) {
    await interaction.reply({
      content: "This channel is no longer tracked.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const authorized = await isAuthorized(interaction, tempVc.owner_id);
  if (!authorized) {
    await interaction.reply({
      content: "Only the channel owner or a moderator can do that.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel as VoiceChannel;
  const newName = interaction.fields.getTextInputValue("vc-name").trim();
  const rawCapacity = interaction.fields
    .getTextInputValue("vc-capacity")
    .trim();
  const newCapacity = Number(rawCapacity);

  if (!Number.isInteger(newCapacity) || newCapacity < 0 || newCapacity > 99) {
    await interaction.reply({
      content: "Capacity must be a whole number between 0 and 99.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Only touch the name if it actually changed — avoids a wasted API call
  // when the user submits the prefilled value untouched.
  if (newName !== channel.name) {
    await channel.setName(newName);
    setChannelName(interaction.channelId!, newName);
  }

  if (newCapacity !== tempVc.user_limit) {
    await channel.setUserLimit(newCapacity);
    setUserLimit(interaction.channelId!, newCapacity);
  }

  await interaction.reply({
    content: `Channel updated: **${newName}**, limit **${newCapacity === 0 ? "unlimited" : newCapacity}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Open / Close ----------

async function handleOpenChannel(interaction: ButtonInteraction) {
  const channel = interaction.channel as VoiceChannel;
  await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
    Connect: true,
  });
  await channel.permissionOverwrites.edit(config.discordVerifiedRoleId, {
    Connect: true,
  });
  unlockChannel(interaction.channelId);

  await interaction.reply({
    content: "🔓 Channel opened — anyone can join.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCloseChannel(interaction: ButtonInteraction) {
  const channel = interaction.channel as VoiceChannel;
  await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
    Connect: false,
  });
  await channel.permissionOverwrites.edit(config.discordVerifiedRoleId, {
    Connect: false,
  });
  lockChannel(interaction.channelId);

  await interaction.reply({
    content: "🔒 Channel closed — only allowed users can join.",
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Party ----------

async function handleParty(interaction: ButtonInteraction) {
  if (!(await requireInVoice(interaction))) return;

  const channel = interaction.channel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "This command can only be used in a voice channel.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const members = channel.members;

  const select = new StringSelectMenuBuilder()
    .setCustomId("vc_party_select")
    .setPlaceholder(`Choose up to ${PARTY_MAX} people`)
    .setMinValues(1)
    .setMaxValues(Math.min(PARTY_MAX, members.size))
    .addOptions(
      members.map((member) => {
        const displayName = stripDisplayNamePrefix(member.displayName);
        const label =
          displayName.length >= 1 ? displayName : member.user.username;

        return new StringSelectMenuOptionBuilder()
          .setLabel(label.slice(0, 100))
          .setDescription(member.user.username.slice(0, 100))
          .setValue(member.id);
      }),
    );

  const allButton = new ButtonBuilder()
    .setCustomId("vc_party_all")
    .setLabel("Select everyone in VC")
    .setEmoji("👯")
    .setStyle(ButtonStyle.Success);

  await interaction.reply({
    content:
      "Choose who to add to your party, or grab everyone currently in the VC.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(allButton),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePartySelected(interaction: StringSelectMenuInteraction) {
  const selectedIds = interaction.values;

  const members = selectedIds
    .map((id) => interaction.guild?.members.cache.get(id))
    .filter((member): member is GuildMember => member !== undefined);

  if (members.length === 0) {
    await interaction.update({
      content: "None of the selected users could be found.",
      components: [],
    });
    return;
  }

  const names = members.map((member) =>
    stripDisplayNamePrefix(member.displayName),
  );

  const command = `/p ${names.join(" ")}`;

  await interaction.update({
    content: `Copy this into chat:\n\`\`\`${command}\`\`\``,
    components: [],
  });
}

async function handlePartyAll(interaction: ButtonInteraction) {
  if (!(await requireInVoice(interaction))) return;

  const channel = interaction.channel as VoiceChannel;
  const others = channel.members.filter(
    (m) => m.id !== interaction.user.id && !m.user.bot,
  );

  if (others.size === 0) {
    await interaction.reply({
      content: "There's no one else in the VC to party with.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (others.size > PARTY_MAX) {
    await interaction.reply({
      content:
        `There are ${others.size} other people in the VC — more than the party max of ${PARTY_MAX}. ` +
        `Use "Get party command" again and pick up to ${PARTY_MAX} manually.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const names = others.map((m) => stripDisplayNamePrefix(m.displayName));
  const command = `/p ${names.join(" ")}`;

  await interaction.reply({
    content: `Copy this into chat:\n\`\`\`${command}\`\`\``,
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Kick ----------

async function handleKickUser(interaction: ButtonInteraction) {
  const channel = interaction.channel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "This command can only be used in a voice channel.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const members = channel.members;

  // Don't allow the person using the button to kick themselves
  const kickableMembers = members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (kickableMembers.size === 0) {
    await interaction.reply({
      content: "There are no other members in the VC to kick.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("vc_kick_select")
    .setPlaceholder("Choose a user to kick")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      kickableMembers.map((member) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(stripDisplayNamePrefix(member.displayName))
          .setDescription(member.user.username)
          .setValue(member.id),
      ),
    );

  await interaction.reply({
    content: "Who would you like to kick? (They can rejoin unless blocked.)",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleKickUserSelected(
  interaction: StringSelectMenuInteraction,
) {
  const userId = interaction.values[0];
  const channel = interaction.channel as VoiceChannel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "The voice channel is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = channel.members.get(userId);

  if (!member) {
    await interaction.reply({
      content: "That user is no longer in the voice channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Disconnect them from the VC
  await member.voice.disconnect("Kicked from voice channel");

  await interaction.update({
    content: `🦵 Kicked **${stripDisplayNamePrefix(member.user.displayName)}** from the channel.`,
    components: [],
  });
}

// ---------- Block ----------

async function handleBlockUser(interaction: ButtonInteraction) {
  const channel = interaction.channel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "This command can only be used in a voice channel.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const members = channel.members;

  // Don't allow the person using the button to block themselves
  const kickableMembers = members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (kickableMembers.size === 0) {
    await interaction.reply({
      content: "There are no other members in the VC to block.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("vc_block_select")
    .setPlaceholder("Choose a user to block")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      kickableMembers.map((member) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(stripDisplayNamePrefix(member.displayName))
          .setDescription(member.user.username)
          .setValue(member.id),
      ),
    );

  await interaction.reply({
    content: "Who would you like to block?",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBlockUserSelected(
  interaction: StringSelectMenuInteraction,
) {
  const target = interaction.values[0];
  const channel = interaction.channel as VoiceChannel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "The voice channel is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = channel.members.get(target);

  if (!member) {
    await interaction.reply({
      content: "That user is no longer in the voice channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel.permissionOverwrites.edit(member.id, { Connect: false });
  banUser(interaction.channelId, member.id);

  const guildMember = await interaction
    .guild!.members.fetch(member.id)
    .catch(() => null);
  if (guildMember?.voice.channelId === interaction.channelId) {
    await guildMember.voice.disconnect();
  }

  await interaction.update({
    content: `🚫 Blocked **${stripDisplayNamePrefix(member.displayName)}** from this channel.`,
    components: [],
  });
}

// ---------- Unblock ----------

async function handleUnblockUser(interaction: ButtonInteraction) {
  const select = new UserSelectMenuBuilder()
    .setCustomId("vc_unblock_select")
    .setPlaceholder("Choose a user to unblock")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Who would you like to unblock?",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUnblockUserSelected(
  interaction: UserSelectMenuInteraction,
) {
  const target = interaction.users.first()!;

  if (!isUserBanned(interaction.channelId, target.id)) {
    await interaction.update({
      content: `**${target.username}** isn't blocked.`,
      components: [],
    });
    return;
  }

  const channel = interaction.channel as VoiceChannel;
  await channel.permissionOverwrites.delete(target.id);
  unbanUser(interaction.channelId, target.id);

  await interaction.update({
    content: `✅ Unblocked **${target.username}**.`,
    components: [],
  });
}

// ---------- Claim ownership ----------

async function handleClaimOwnership(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const tempVc = getTempVcChannel(interaction.channelId);
    if (!tempVc) {
      await interaction.editReply({
        content: "This voice channel is no longer being tracked.",
      });
      return;
    }

    const currentOwner = await interaction
      .guild!.members.fetch(tempVc.owner_id)
      .catch(() => null);

    const ownerStillHere =
      currentOwner?.voice.channelId === interaction.channelId;

    if (ownerStillHere) {
      await interaction.editReply({
        content:
          "The current owner is still in the channel — ownership can't be claimed.",
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isVoiceBased()) {
      await interaction.editReply({
        content: "This command can only be used in a voice channel.",
      });
      return;
    }

    await channel.permissionOverwrites.edit(interaction.user.id, {
      Connect: true,
      ManageChannels: true,
    });

    transferOwnership(interaction.channelId, interaction.user.id);

    await interaction.editReply({
      content: `👑 <@${interaction.user.id}> is now the owner of this channel.`,
    });
  } catch (error) {
    console.error("[CLAIM] Error claiming ownership:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply({
          content: "Something went wrong while claiming ownership.",
        })
        .catch(() => {});
    }
  }
}

// ---------- Transfer ownership ----------

async function handleTransferOwnership(interaction: ButtonInteraction) {
  const tempVc = getTempVcChannel(interaction.channelId)!;

  if (interaction.user.id !== tempVc.owner_id) {
    await interaction.reply({
      content: "Only the current owner can transfer ownership.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "This command can only be used in a voice channel.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const members = channel.members;

  const eligibalMembers = members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (eligibalMembers.size === 0) {
    await interaction.reply({
      content: "There are no other members in the VC to transfer ownership to.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("vc_transfer_select")
    .setPlaceholder("Choose the new owner")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      eligibalMembers.map((member) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(stripDisplayNamePrefix(member.displayName))
          .setDescription(member.user.username)
          .setValue(member.id),
      ),
    );

  await interaction.reply({
    content: "Who should be the new owner?",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTransferOwnershipSelected(
  interaction: StringSelectMenuInteraction,
) {
  const targetId = interaction.values[0];
  const tempVc = getTempVcChannel(interaction.channelId)!;

  if (interaction.user.id !== tempVc.owner_id) {
    await interaction.update({
      content: "Only the current owner can transfer ownership.",
      components: [],
    });
    return;
  }

  const channel = interaction.channel as VoiceChannel;

  if (!channel?.isVoiceBased()) {
    await interaction.reply({
      content: "The voice channel is no longer available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  const target = channel.members.get(targetId);

  if (!target) {
    await interaction.reply({
      content: "That user is no longer in the voice channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  
  await channel.permissionOverwrites.edit(target.id, {
    Connect: true,
    ManageChannels: true,
  });
  await channel.permissionOverwrites.delete(tempVc.owner_id).catch(() => {});

  transferOwnership(interaction.channelId, target.id);

  await interaction.update({
    content: `👑 Ownership transferred to **${target.user.username}**.`,
    components: [],
  });
}
