import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Client } from "discord.js";
import type { Event } from "../models/types/event.js";

export async function registerEvents(client: Client) {
  const eventsDir = join(import.meta.dirname, "..", "events");

  const files = await readdir(eventsDir);

  for (const file of files) {
    if (!file.endsWith(".js")) continue;

    const path = pathToFileURL(join(eventsDir, file)).href;

    const { default: event } = await import(path) as {
      default: Event;
    };

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    console.log(`Loaded event ${file}`);
  }
}