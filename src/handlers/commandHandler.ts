import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Client } from "discord.js";
import { Command } from "../models/types/command.js";
import { config } from "../config.js";

export const commands = new Map<string, Command>();

export async function registerCommands(client: Client) {
  const commandsDir = join(import.meta.dirname, "..", "commands");
  const files = (await readdir(commandsDir))
    .filter(file => file.endsWith(".ts") || file.endsWith(".js"))
    .filter(file => !file.endsWith(".d.ts"));

  for (const file of files) {
    const path = pathToFileURL(join(commandsDir, file)).href;
    const { default: command } = await import(path) as { default: Command };

    commands.set(command.data.name, command);
    console.log(`Loaded command ${file}`);
  }

  await client.application?.commands.set(
    Array.from(commands.values()).map(command => command.data),
    config.discordGuildId,
  );
  console.log(`Registered ${commands.size} guild command(s)`);
}