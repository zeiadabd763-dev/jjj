import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  if (!fs.existsSync(commandsPath)) return;

  const walk = async (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const res = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(res);
      else if (entry.isFile() && res.endsWith('.js')) {
        try {
          const cmd = await import(pathToFileURL(res).href);
          const c = cmd.default;
          if (!c) continue;
          
          // Support both SlashCommandBuilder format (has .data property) and old format (has .name)
          if (c.data) {
            // New format: SlashCommandBuilder
            if (typeof c.execute !== 'function') continue;
            const commandName = c.data.name;
            client.commands.set(commandName, c);
          } else if (c.name && typeof c.execute === 'function') {
            // Old format: simple object with name and execute
            client.commands.set(c.name, c);
          }
        } catch (err) {
          console.error(`Failed to load command ${res}:`, err);
        }
      }
    }
  };

  await walk(commandsPath);
}

