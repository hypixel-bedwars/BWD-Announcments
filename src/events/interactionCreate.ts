import {
  ActionRowBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  type VoiceChannel,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  TextInputBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  StringSelectMenuInteraction,
  GuildMember,
} from "discord.js";
import { Event } from "../models/types/event.js";
import { config } from "../config.js";
import {
  stripDisplayNamePrefix,
  buildActionEmbed,
  buildErrorEmbed,
  resolveTempVcContext,
} from "../utils.js";
import {
  setChannelName,
  setUserLimit,
  lockChannel,
  unlockChannel,
  banUser,
  unbanUser,
  isUserBanned,
  transferOwnership,
  getBannedUsers,
} from "../database/repository/temp_channels.js";
import { commands } from "../handlers/commandHandler.js";

const PARTY_MAX = 8;

// ---------- Shared helpers ----------

async function isAuthorized(
  interaction:
    ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
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
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  await interaction.reply({
    embeds: [
      buildErrorEmbed(
        "Access Denied",
        "Only the channel owner or a moderator can do that.",
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function replyNotInChannel(
  interaction:
    ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
) {
  const embed = buildErrorEmbed(
    "Not In A Channel",
    "You need to be in an active temp VC to do that.",
  );
  if (
    interaction.isRepliable() &&
    !interaction.replied &&
    !interaction.deferred
  ) {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// customIds that skip the owner/moderator gate — party is available to anyone in the VC
const noAuthRequired = new Set([
  "vc_party",
  "vc_party_all",
  "vc_party_select",
  "vc_claim",
]);

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

// ---------- String select menu handlers (customId -> action) ----------

const stringSelectMenuHandlers: Record<
  string,
  (interaction: StringSelectMenuInteraction) => Promise<void>
> = {
  vc_kick_select: handleKickUserSelected,
  vc_block_select: handleBlockUserSelected,
  vc_party_select: handlePartySelected,
  vc_transfer_select: handleTransferOwnershipSelected,
  vc_unblock_select: handleUnblockUserSelected,
};

export default {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({
            embeds: [
              buildErrorEmbed(
                "Unknown Command",
                "That command isn't recognized.",
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await command.execute(client, interaction);
        return;
      }

      if (interaction.isButton()) {
        const handler = buttonHandlers[interaction.customId];
        if (!handler) return;

        const context = await resolveTempVcContext(interaction);
        if (!context) return replyNotInChannel(interaction);

        if (!noAuthRequired.has(interaction.customId)) {
          const authorized = await isAuthorized(
            interaction,
            context.tempVc.owner_id,
          );
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

      if (interaction.isStringSelectMenu()) {
        const handler = stringSelectMenuHandlers[interaction.customId];
        if (!handler) return;

        const context = await resolveTempVcContext(interaction);
        if (!context) return replyNotInChannel(interaction);

        if (!noAuthRequired.has(interaction.customId)) {
          const authorized = await isAuthorized(
            interaction,
            context.tempVc.owner_id,
          );
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
      const errorEmbed = buildErrorEmbed(
        "Something Went Wrong",
        "Something went wrong handling that action.",
      );
      if (
        "replied" in interaction &&
        (interaction.replied || interaction.deferred)
      ) {
        await interaction.followUp({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      } else if ("reply" in interaction) {
        await interaction.reply({
          embeds: [errorEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
} satisfies Event<"interactionCreate">;

// ---------- Edit channel (modal) ----------

async function handleEditChannel(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

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
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

  const authorized = await isAuthorized(interaction, tempVc.owner_id);
  if (!authorized) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "Access Denied",
          "Only the channel owner or a moderator can do that.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newName = interaction.fields.getTextInputValue("vc-name").trim();
  const rawCapacity = interaction.fields
    .getTextInputValue("vc-capacity")
    .trim();
  const newCapacity = Number(rawCapacity);

  if (!Number.isInteger(newCapacity) || newCapacity < 0 || newCapacity > 99) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "Invalid Capacity",
          "Capacity must be a whole number between 0 and 99.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (newName !== channel.name) {
    await channel.setName(newName);
    setChannelName(channel.id, newName);
  }

  if (newCapacity !== tempVc.user_limit) {
    await channel.setUserLimit(newCapacity);
    setUserLimit(channel.id, newCapacity);
  }

  await interaction.reply({
    embeds: [
      buildActionEmbed(
        "✏️",
        "Channel Updated",
        `Channel: <#${channel.id}> is now **${newName}**, limit **${newCapacity === 0 ? "unlimited" : newCapacity}**.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Open / Close ----------

async function handleOpenChannel(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

  const wasLocked = tempVc.is_locked === 1;

  await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
    Connect: true,
  });
  await channel.permissionOverwrites.edit(config.discordVerifiedRoleId, {
    Connect: true,
  });
  unlockChannel(channel.id);

  await interaction.reply({
    embeds: [
      wasLocked
        ? buildActionEmbed(
            "🔓",
            "Channel Opened",
            `Channel: <#${channel.id}> is now open for everyone to join!`,
          )
        : buildActionEmbed(
            "🔓",
            "Channel Already Open",
            `Channel: <#${channel.id}> is already open for everyone to join! No changes were needed.`,
          ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCloseChannel(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

  const wasLocked = tempVc.is_locked === 1;

  await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
    Connect: false,
  });
  await channel.permissionOverwrites.edit(config.discordVerifiedRoleId, {
    Connect: false,
  });
  lockChannel(channel.id);

  await interaction.reply({
    embeds: [
      wasLocked
        ? buildActionEmbed(
            "🔒",
            "Channel Already Locked",
            `Channel: <#${channel.id}> is already closed for all members. No changes were needed.`,
          )
        : buildActionEmbed(
            "🔒",
            "Channel Locked",
            `Channel: <#${channel.id}> is now closed for all members. Access restricted!`,
          ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Party ----------

async function handleParty(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

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
    embeds: [
      buildActionEmbed(
        "👯",
        "Party Time",
        "Choose who to add to your party, or grab everyone currently in the VC.",
      ),
    ],
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
      embeds: [
        buildErrorEmbed(
          "No Users Found",
          "None of the selected users could be found.",
        ),
      ],
      components: [],
    });
    return;
  }

  const names = members.map((member) =>
    stripDisplayNamePrefix(member.displayName),
  );
  const command = `/p ${names.join(" ")}`;

  await interaction.update({
    embeds: [
      buildActionEmbed(
        "👯",
        "Party Command Ready",
        `Copy this into chat:\n\`\`\`${command}\`\`\``,
      ),
    ],
    components: [],
  });
}

async function handlePartyAll(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const others = channel.members.filter(
    (m) => m.id !== interaction.user.id && !m.user.bot,
  );

  if (others.size === 0) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "No One to Party With!",
          "There's no one else in the VC to party with.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (others.size > PARTY_MAX) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "Too Many People!",
          `There are ${others.size} other people in the VC — more than the party max of ${PARTY_MAX}. ` +
            `Use "Get party command" again and pick up to ${PARTY_MAX} manually.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const names = others.map((m) => stripDisplayNamePrefix(m.displayName));
  const command = `/p ${names.join(" ")}`;

  await interaction.reply({
    embeds: [
      buildActionEmbed(
        "👯",
        "Party Command Ready",
        `Copy this into chat:\n\`\`\`${command}\`\`\``,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------- Kick ----------

async function handleKickUser(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const kickableMembers = channel.members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (kickableMembers.size === 0) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "No One to Kick!",
          "There is currently no one to kick in the channel.",
        ),
      ],
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
    embeds: [
      buildActionEmbed(
        "📵",
        "Manage Members",
        "Let's tidy up the channel. Pick a member to kick. Moderators and admins are exempt from being kicked.",
      ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleKickUserSelected(
  interaction: StringSelectMenuInteraction,
) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const userId = interaction.values[0];
  const member = channel.members.get(userId);

  if (!member) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "User Not Found",
          "That user is no longer in the voice channel.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await member.voice.disconnect("Kicked from voice channel");

  await interaction.update({
    embeds: [
      buildActionEmbed(
        "🦵",
        "Member Kicked",
        `**${stripDisplayNamePrefix(member.user.displayName)}** was kicked from the channel.`,
      ),
    ],
    components: [],
  });
}

// ---------- Block ----------

async function handleBlockUser(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const blockableMembers = channel.members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (blockableMembers.size === 0) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "No One to Block!",
          "There is currently no one to block in the channel.",
        ),
      ],
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
      blockableMembers.map((member) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(stripDisplayNamePrefix(member.displayName))
          .setDescription(member.user.username)
          .setValue(member.id),
      ),
    );

  await interaction.reply({
    embeds: [
      buildActionEmbed(
        "🚫",
        "User Block",
        "Time to make some space. Select a user to block from the channel. Keep in mind, moderators and admins are protected.",
      ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleBlockUserSelected(
  interaction: StringSelectMenuInteraction,
) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const targetId = interaction.values[0];
  const member = channel.members.get(targetId);

  if (!member) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "User Not Found",
          "That user is no longer in the voice channel.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel.permissionOverwrites.edit(member.id, { Connect: false });
  banUser(channel.id, member.id);

  if (member.voice.channelId === channel.id) {
    await member.voice.disconnect();
  }

  await interaction.update({
    embeds: [
      buildActionEmbed(
        "🚫",
        "User Blocked",
        `**${stripDisplayNamePrefix(member.displayName)}** was blocked from this channel.`,
      ),
    ],
    components: [],
  });
}

// ---------- Unblock ----------

async function handleUnblockUser(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const bannedIds = getBannedUsers(channel.id);

  if (bannedIds.length === 0) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "No One to Unblock!",
          "No blocked users found to unblock right now.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const options = await Promise.all(
    bannedIds.map(async (id) => {
      const member = await interaction
        .guild!.members.fetch(id)
        .catch(() => null);
      const label = member
        ? stripDisplayNamePrefix(member.displayName)
        : `Unknown user (${id})`;
      const description = member ? member.user.username : "No longer in server";

      return new StringSelectMenuOptionBuilder()
        .setLabel(label.slice(0, 100))
        .setDescription(description.slice(0, 100))
        .setValue(id);
    }),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("vc_unblock_select")
    .setPlaceholder("Choose a user to unblock")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  await interaction.reply({
    embeds: [
      buildActionEmbed("📞", "Unblock User", "Who would you like to unblock?"),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUnblockUserSelected(
  interaction: StringSelectMenuInteraction,
) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { channel } = context;

  const targetId = interaction.values[0];

  if (!isUserBanned(channel.id, targetId)) {
    await interaction.update({
      embeds: [buildErrorEmbed("Not Blocked", "That user isn't blocked.")],
      components: [],
    });
    return;
  }

  await channel.permissionOverwrites.delete(targetId).catch(() => {});
  unbanUser(channel.id, targetId);

  const member = await interaction
    .guild!.members.fetch(targetId)
    .catch(() => null);
  const name = member
    ? stripDisplayNamePrefix(member.displayName)
    : "that user";

  await interaction.update({
    embeds: [
      buildActionEmbed("✅", "User Unblocked", `**${name}** was unblocked.`),
    ],
    components: [],
  });
}

// ---------- Claim ownership ----------

async function handleClaimOwnership(interaction: ButtonInteraction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const context = await resolveTempVcContext(interaction);
    if (!context) {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            "Not In A Channel",
            "You need to be in an active temp VC to claim ownership.",
          ),
        ],
      });
      return;
    }
    const { tempVc, channel } = context;

    if (interaction.user.id === tempVc.owner_id) {
      await interaction.editReply({
        embeds: [
          buildActionEmbed(
            "👑",
            "You Got This!",
            `You're the current owner of <#${channel.id}>. Keep leading!`,
          ),
        ],
      });
      return;
    }

    const currentOwner = await interaction
      .guild!.members.fetch(tempVc.owner_id)
      .catch(() => null);
    const ownerStillHere = currentOwner?.voice.channelId === channel.id;

    if (ownerStillHere) {
      await interaction.editReply({
        embeds: [
          buildErrorEmbed(
            "Owner Still Present",
            "The current owner is still in the channel — ownership can't be claimed.",
          ),
        ],
      });
      return;
    }

    await channel.permissionOverwrites.edit(interaction.user.id, {
      Connect: true,
      ManageChannels: true,
    });
    transferOwnership(channel.id, interaction.user.id);

    await interaction.editReply({
      embeds: [
        buildActionEmbed(
          "👑",
          "Ownership Claimed",
          `<@${interaction.user.id}> is now the owner of this channel.`,
        ),
      ],
    });
  } catch (error) {
    console.error("[CLAIM] Error claiming ownership:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply({
          embeds: [
            buildErrorEmbed(
              "Something Went Wrong",
              "Something went wrong while claiming ownership.",
            ),
          ],
        })
        .catch(() => {});
    }
  }
}

// ---------- Transfer ownership ----------

async function handleTransferOwnership(interaction: ButtonInteraction) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

  if (interaction.user.id !== tempVc.owner_id) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "Access Denied",
          "Only the current owner can transfer ownership.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const eligibleMembers = channel.members.filter(
    (member) => member.id !== interaction.user.id,
  );

  if (eligibleMembers.size === 0) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "No One to Transfer Ownership!",
          "There is no suitable member to transfer ownership to right now.",
        ),
      ],
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
      eligibleMembers.map((member) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(stripDisplayNamePrefix(member.displayName))
          .setDescription(member.user.username)
          .setValue(member.id),
      ),
    );

  await interaction.reply({
    embeds: [
      buildActionEmbed(
        "👑",
        "Transfer Ownership",
        "Who should be the new owner?",
      ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTransferOwnershipSelected(
  interaction: StringSelectMenuInteraction,
) {
  const context = await resolveTempVcContext(interaction);
  if (!context) return replyNotInChannel(interaction);
  const { tempVc, channel } = context;

  if (interaction.user.id !== tempVc.owner_id) {
    await interaction.update({
      embeds: [
        buildErrorEmbed(
          "Access Denied",
          "Only the current owner can transfer ownership.",
        ),
      ],
      components: [],
    });
    return;
  }

  const targetId = interaction.values[0];
  const target = channel.members.get(targetId);

  if (!target) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "User Not Found",
          "That user is no longer in the voice channel.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel.permissionOverwrites.edit(target.id, {
    Connect: true,
    ManageChannels: true,
  });
  await channel.permissionOverwrites.delete(tempVc.owner_id).catch(() => {});

  transferOwnership(channel.id, target.id);

  await interaction.update({
    embeds: [
      buildActionEmbed(
        "👑",
        "Ownership Transferred",
        `Ownership transferred to **${target.user.username}**.`,
      ),
    ],
    components: [],
  });
}
