import "discord.js";

declare module "discord.js" {
  interface ClientEvents {
    raw: [packet: { t: string; d: any }];
  }
}