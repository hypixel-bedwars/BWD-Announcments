import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  VoiceChannel,
} from "discord.js";
import {
  getTempVcChannel,
  TempVcChannel,
} from "./database/repository/temp_channels.js";

const EMBED_FOOTER = "Hypixel Bedwars • Enhanced for performance 🚀";
const COLOR_SUCCESS = 0x57f287;
const COLOR_ERROR = 0xed4245;
type AnyVcInteraction =
  ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;

export function stripDisplayNamePrefix(displayName: string): string {
  // Removes a leading [ ... ] bracket group (and any following space),
  return displayName.replace(/^\[[^\]]*\]\s*/, "").trim();
}

export function buildChannelManagementMessage(ownerRoleId: string) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎙️ Channel management")
    .setDescription(
      "> Once the channel has been created, you can do some customisation and configuration of your channel using the buttons below.\n\n" +
        `🌱 **Note:** In addition, only the channel owner & <@&${ownerRoleId}> can make these changes.`,
    )
    .setFooter({
      text: "Hypixel Bedwars • Enhanced for performance 🚀",
    });

  // Row 1 — general controls
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vc_edit")
      .setLabel("Edit channel")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("vc_open")
      .setLabel("Open channel")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vc_close")
      .setLabel("Close channel")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    // new ButtonBuilder()
    //   .setCustomId("vc_invite")
    //   .setLabel("Invite user")
    //   .setEmoji("👤")
    //   .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vc_party")
      .setLabel("Get party command")
      .setEmoji("👯")
      .setStyle(ButtonStyle.Success),
  );

  // Row 2 — user moderation
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vc_kick")
      .setLabel("Kick user")
      .setEmoji("🦵")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("vc_block")
      .setLabel("Block user")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("vc_unblock")
      .setLabel("Unblock user")
      .setEmoji("📞")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vc_soundboard")
      .setLabel("SoundBoard Access")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Secondary),
  );

  // Row 3 — ownership
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vc_claim")
      .setLabel("Claim ownership")
      .setEmoji("👑")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vc_transfer")
      .setLabel("Transfer ownership")
      .setEmoji("👑")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export function buildActionEmbed(
  emoji: string,
  title: string,
  description: string,
) {
  return new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle(`${emoji} ${title}`)
    .setDescription(`> 🌱 - ${description}`)
    .setFooter({ text: EMBED_FOOTER });
}

export function buildErrorEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle(`⚠️ ${title}`)
    .setDescription(`> ${description}`)
    .setFooter({ text: `${EMBED_FOOTER}` });
}

export async function resolveTempVcContext(
  interaction: AnyVcInteraction,
): Promise<{ tempVc: TempVcChannel; channel: VoiceChannel } | null> {
  if (!interaction.channelId) {
    return null;
  }
  // Case 1: panel is posted inside the VC's own text chat — the fast path,
  // no change from how this already worked.
  let tempVc = getTempVcChannel(interaction.channelId);
  let targetChannelId = interaction.channelId;

  // Case 2: panel is posted in a general/central channel — fall back to
  // whatever voice channel the person clicking is currently sitting in.
  if (!tempVc) {
    const guildMember = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => null);
    const voiceChannelId = guildMember?.voice.channelId;

    if (voiceChannelId) {
      tempVc = getTempVcChannel(voiceChannelId);
      targetChannelId = voiceChannelId;
    }
  }

  if (!tempVc) return null;

  const channel = await interaction.guild?.channels
    .fetch(targetChannelId)
    .catch(() => null);
  if (!channel || !channel.isVoiceBased()) return null;

  return { tempVc, channel: channel as VoiceChannel };
}
