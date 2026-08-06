import type { Client, ClientEvents } from "discord.js";

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(client: Client, ...args: ClientEvents[K]): Promise<void> | void;
}