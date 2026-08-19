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
    ButtonInteraction | ModalSubmitInteraction | UserSelectMenuInteraction,
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
  interaction: ButtonInteraction | UserSelectMenuInteraction,
) {
  await interaction.reply({
    content: "Only the channel owner or a moderator can do that.",
    flags: MessageFlags.Ephemeral,
  });
}

// customIds that skip the owner/moderator gate — party is available to anyone in the VC
const noAuthRequired = new Set(["vc_party", "vc_party_all", "vc_party_select"]);

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
  vc_party_select: handlePartySelected,
  vc_kick_select: handleKickUserSelected,
  vc_block_select: handleBlockUserSelected,
  vc_unblock_select: handleUnblockUserSelected,
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
  lockChannel(interaction.channelId);

  await interaction.reply({
    content: "🔒 Channel closed — only allowed users can join.",
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Party ----------

async function handleParty(interaction: ButtonInteraction) {
  if (!(await requireInVoice(interaction))) return;

  const select = new UserSelectMenuBuilder()
    .setCustomId("vc_party_select")
    .setPlaceholder(`Choose up to ${PARTY_MAX} people`)
    .setMinValues(1)
    .setMaxValues(PARTY_MAX);

  const allButton = new ButtonBuilder()
    .setCustomId("vc_party_all")
    .setLabel("Select everyone in VC")
    .setEmoji("👯")
    .setStyle(ButtonStyle.Success);

  await interaction.reply({
    content:
      "Choose who to add to your party, or grab everyone currently in the VC.",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(allButton),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePartySelected(interaction: UserSelectMenuInteraction) {
  const selectedIds = interaction.values;

  const members = await Promise.all(
    selectedIds.map((id) =>
      interaction.guild!.members.fetch(id).catch(() => null),
    ),
  );
  const validMembers = members.filter(
    (m): m is NonNullable<typeof m> => m !== null,
  );

  const names = validMembers.map((m) => stripDisplayNamePrefix(m.displayName));
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
  const select = new UserSelectMenuBuilder()
    .setCustomId("vc_kick_select")
    .setPlaceholder("Choose a user to kick")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Who would you like to kick? (They can rejoin unless blocked.)",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleKickUserSelected(interaction: UserSelectMenuInteraction) {
  const target = interaction.users.first()!;
  const guildMember = await interaction
    .guild!.members.fetch(target.id)
    .catch(() => null);

  if (guildMember?.voice.channelId === interaction.channelId) {
    await guildMember.voice.disconnect();
  }

  await interaction.update({
    content: `👢 Kicked **${target.username}** from the channel.`,
    components: [],
  });
}

// ---------- Block ----------

async function handleBlockUser(interaction: ButtonInteraction) {
  const select = new UserSelectMenuBuilder()
    .setCustomId("vc_block_select")
    .setPlaceholder("Choose a user to block")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Who would you like to block?",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBlockUserSelected(interaction: UserSelectMenuInteraction) {
  const target = interaction.users.first()!;
  const channel = interaction.channel as VoiceChannel;

  await channel.permissionOverwrites.edit(target.id, { Connect: false });
  banUser(interaction.channelId, target.id);

  const guildMember = await interaction
    .guild!.members.fetch(target.id)
    .catch(() => null);
  if (guildMember?.voice.channelId === interaction.channelId) {
    await guildMember.voice.disconnect();
  }

  await interaction.update({
    content: `🚫 Blocked **${target.username}** from this channel.`,
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
  const tempVc = getTempVcChannel(interaction.channelId)!;

  const currentOwner = await interaction
    .guild!.members.fetch(tempVc.owner_id)
    .catch(() => null);
  const ownerStillHere =
    currentOwner?.voice.channelId === interaction.channelId;

  if (ownerStillHere) {
    await interaction.reply({
      content:
        "The current owner is still in the channel — ownership can't be claimed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = interaction.channel as VoiceChannel;
  await channel.permissionOverwrites.edit(interaction.user.id, {
    Connect: true,
    ManageChannels: true,
  });

  transferOwnership(interaction.channelId, interaction.user.id);

  await interaction.reply({
    content: `👑 <@${interaction.user.id}> is now the owner of this channel.`,
  });
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

  const select = new UserSelectMenuBuilder()
    .setCustomId("vc_transfer_select")
    .setPlaceholder("Choose the new owner")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Who should be the new owner?",
    components: [
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTransferOwnershipSelected(
  interaction: UserSelectMenuInteraction,
) {
  const target = interaction.users.first()!;
  const tempVc = getTempVcChannel(interaction.channelId)!;

  if (interaction.user.id !== tempVc.owner_id) {
    await interaction.update({
      content: "Only the current owner can transfer ownership.",
      components: [],
    });
    return;
  }

  const channel = interaction.channel as VoiceChannel;
  await channel.permissionOverwrites.edit(target.id, {
    Connect: true,
    ManageChannels: true,
  });
  await channel.permissionOverwrites.delete(tempVc.owner_id).catch(() => {});

  transferOwnership(interaction.channelId, target.id);

  await interaction.update({
    content: `👑 Ownership transferred to **${target.username}**.`,
    components: [],
  });
}
