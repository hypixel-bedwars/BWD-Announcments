import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

export function stripDisplayNamePrefix(displayName: string): string {
  // Removes a leading [ ... ] bracket group (and any following space),
  // e.g. "[323 💫] VA80" -> "VA80", "[32 ⭐] OBF77" -> "OBF77"
  return displayName.replace(/^\[[^\]]*\]\s*/, "").trim();
}

export function buildChannelManagementMessage(ownerRoleId: string) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287) // Discord "green" — matches the left accent bar
    .setTitle("🎙️ Channel management")
    .setDescription(
      "> Once the channel has been created, you can do some customisation and configuration of your channel using the buttons below.\n\n" +
      `🌱 **Note:** In addition, only the channel owner & <@&${ownerRoleId}> can make these changes.`
    )
    .setFooter({
      text: "Hypixel Bedwars • Enhanced for performance 🚀"
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
    new ButtonBuilder()
      .setCustomId("vc_invite")
      .setLabel("Invite user")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),
  );

  // Row 2 — user moderation
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vc_kick")
      .setLabel("Kick user")
      .setEmoji("📵")
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
