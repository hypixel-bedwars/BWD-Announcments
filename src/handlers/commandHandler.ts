import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Client } from "discord.js";
import { Command } from "../models/types/command.js";

export async function registerCommands(client: Client) {
  const commandsDir = join(import.meta.dirname, "..", "commands");

  const files = (await readdir(commandsDir))
    .filter(file => file.endsWith(".ts") || file.endsWith(".js"))
    .filter(file => !file.endsWith(".d.ts"));

  const commands: Command[] = [];

  for (const file of files) {
    const path = pathToFileURL(join(commandsDir, file)).href;

    const { default: command } = await import(path) as {
      default: Command;
    };

    commands.push(command);

    console.log(`Loaded command ${file}`);
  }

  await client.application?.commands.set(
    commands.map(command => command.data)
  );

  console.log(`Registered ${commands.length} command(s)`);
}