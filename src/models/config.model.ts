export default interface AppConfig {
  discordToken: string;
  discordGuildId: string;
  discordTagRoleId: string;
  discordBoostRoleId: string;
  discordTagAnnouncmentChannelId: string;
  discordBoostAnnouncmentChannelId: string;
  
  discordTempVcCategoryId: string;
  discordTempVcChannelId: string;
  discordTempVcModeratorRoleId: string;
  discordVerifiedRoleId: string;
  discordSoundBoardRolesId: string[];
}